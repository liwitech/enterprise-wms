import csv
import io
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.enums import TaskStatusEnum, TimesheetStatusEnum, UserRoleEnum
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.task import Task
from app.models.timesheet import TimesheetEntry
from app.models.user import User
from app.schemas.common import ApiResponse, paginated
from app.schemas.timesheet import WeeklySummaryRead
from app.services.timesheet_service import TimesheetService

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/timesheet")
async def timesheet_report(
    dept_id: Optional[UUID] = None,
    week_start: Optional[date] = None,
    project_id: Optional[UUID] = None,
    format: str = Query("json", pattern="^(json|csv)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(
        require_role(
            UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN, UserRoleEnum.MANAGER
        )
    ),
):
    entries = await TimesheetService(db).get_report_entries(
        user, dept_id=dept_id, week_start=week_start, project_id=project_id
    )

    if format == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            [
                "entry_id",
                "user_email",
                "user_name",
                "project_name",
                "work_date",
                "hours_logged",
                "status",
                "description",
            ]
        )
        for e in entries:
            writer.writerow(
                [
                    str(e.id),
                    e.user.email if e.user else "",
                    e.user.full_name if e.user else "",
                    e.project.name if e.project else "",
                    str(e.work_date),
                    str(e.hours_logged),
                    e.status.value,
                    e.description or "",
                ]
            )
        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=timesheet_report.csv"},
        )

    # JSON response
    data = [
        {
            "entry_id": str(e.id),
            "user_id": str(e.user_id),
            "user_email": e.user.email if e.user else None,
            "user_name": e.user.full_name if e.user else None,
            "project_id": str(e.project_id),
            "project_name": e.project.name if e.project else None,
            "work_date": str(e.work_date),
            "hours_logged": float(e.hours_logged),
            "status": e.status.value,
            "description": e.description,
        }
        for e in entries
    ]
    return {"success": True, "data": data, "meta": {"total": len(data)}}


@router.get(
    "/timesheet/weekly-summary",
    response_model=ApiResponse[list[WeeklySummaryRead]],
)
async def weekly_summary_report(
    week_start: Optional[date] = None,
    dept_id: Optional[UUID] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(
        require_role(
            UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN, UserRoleEnum.MANAGER
        )
    ),
):
    rows, total = await TimesheetService(db).get_weekly_summaries(
        user, week_start=week_start, dept_id=dept_id, page=page, per_page=per_page
    )
    return paginated(
        [WeeklySummaryRead.model_validate(r) for r in rows], page, per_page, total
    )


@router.get("/project-kpi")
async def project_kpi_report(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(
        require_role(
            UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN, UserRoleEnum.MANAGER
        )
    ),
):
    today = date.today()

    project = (
        await db.execute(select(Project).where(Project.id == project_id))
    ).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    members = (
        await db.execute(
            select(ProjectMember)
            .options(selectinload(ProjectMember.user))
            .where(ProjectMember.project_id == project_id)
            .order_by(ProjectMember.joined_at)
        )
    ).scalars().all()

    result = []
    for member in members:
        u = member.user
        if not u:
            continue

        tasks = (
            await db.execute(
                select(Task).where(
                    Task.project_id == project_id,
                    Task.assignee_user_id == member.user_id,
                    Task.deleted_at.is_(None),
                )
            )
        ).scalars().all()

        done_tasks = [t for t in tasks if t.status == TaskStatusEnum.DONE]

        tasks_assigned = sum(1 for t in tasks if t.status != TaskStatusEnum.CANCELLED)
        tasks_done_ontime = sum(
            1 for t in done_tasks
            if t.completed_at is not None
            and (t.due_date is None or t.completed_at.date() <= t.due_date)
        )
        tasks_done_overdue = sum(
            1 for t in done_tasks
            if t.due_date is not None
            and t.completed_at is not None
            and t.completed_at.date() > t.due_date
        )
        tasks_done_no_deadline = sum(
            1 for t in done_tasks if t.due_date is None
        )
        tasks_overdue = sum(
            1 for t in tasks
            if t.status not in (TaskStatusEnum.DONE, TaskStatusEnum.CANCELLED)
            and t.due_date is not None
            and t.due_date < today
        )
        tasks_in_progress = sum(
            1 for t in tasks
            if t.status in (TaskStatusEnum.IN_PROGRESS, TaskStatusEnum.IN_REVIEW)
        )
        tasks_todo = sum(1 for t in tasks if t.status == TaskStatusEnum.TODO)
        total_estimated = round(
            sum(t.estimated_hours or 0 for t in tasks if t.status != TaskStatusEnum.CANCELLED),
            1,
        )

        ts_hours = (
            await db.execute(
                select(func.coalesce(func.sum(TimesheetEntry.hours_logged), 0)).where(
                    TimesheetEntry.project_id == project_id,
                    TimesheetEntry.user_id == member.user_id,
                    TimesheetEntry.status == TimesheetStatusEnum.APPROVED,
                )
            )
        ).scalar_one()

        done_with_deadline = tasks_done_ontime + tasks_done_overdue
        ontime_rate = (
            round(tasks_done_ontime / done_with_deadline * 100, 1)
            if done_with_deadline > 0
            else None
        )

        result.append({
            "user_id": str(member.user_id),
            "full_name": u.full_name,
            "email": u.email,
            "role": member.role.value,
            "tasks_assigned": tasks_assigned,
            "tasks_done_ontime": tasks_done_ontime,
            "tasks_done_overdue": tasks_done_overdue,
            "tasks_done_no_deadline": tasks_done_no_deadline,
            "tasks_overdue": tasks_overdue,
            "tasks_in_progress": tasks_in_progress,
            "tasks_todo": tasks_todo,
            "ontime_rate": ontime_rate,
            "total_actual_hours": float(ts_hours),
            "total_estimated_hours": total_estimated,
        })

    return {
        "success": True,
        "data": {
            "project_id": str(project_id),
            "project_name": project.name,
            "as_of": str(today),
            "members": result,
        },
    }


@router.get("/member-kpi")
async def member_kpi_report(
    user_id: UUID,
    project_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(
            UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN, UserRoleEnum.MANAGER
        )
    ),
):
    today = date.today()

    target_user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Build task query for this user
    task_q = select(Task).where(
        Task.assignee_user_id == user_id,
        Task.deleted_at.is_(None),
    )
    if project_id:
        task_q = task_q.where(Task.project_id == project_id)
    else:
        member_subq = select(ProjectMember.project_id).where(
            ProjectMember.user_id == user_id
        )
        task_q = task_q.where(Task.project_id.in_(member_subq))

    tasks = (await db.execute(task_q)).scalars().all()

    done_tasks = [t for t in tasks if t.status == TaskStatusEnum.DONE]
    tasks_assigned = sum(1 for t in tasks if t.status != TaskStatusEnum.CANCELLED)
    tasks_done = len(done_tasks)
    tasks_done_ontime = sum(
        1 for t in done_tasks
        if t.completed_at is not None
        and (t.due_date is None or t.completed_at.date() <= t.due_date)
    )
    tasks_done_overdue = sum(
        1 for t in done_tasks
        if t.due_date is not None
        and t.completed_at is not None
        and t.completed_at.date() > t.due_date
    )
    tasks_done_no_deadline = sum(1 for t in done_tasks if t.due_date is None)
    tasks_overdue = sum(
        1 for t in tasks
        if t.status not in (TaskStatusEnum.DONE, TaskStatusEnum.CANCELLED)
        and t.due_date is not None
        and t.due_date < today
    )
    tasks_in_progress = sum(
        1 for t in tasks
        if t.status in (TaskStatusEnum.IN_PROGRESS, TaskStatusEnum.IN_REVIEW)
    )
    tasks_todo = sum(1 for t in tasks if t.status == TaskStatusEnum.TODO)
    total_estimated = round(
        sum(t.estimated_hours or 0 for t in tasks if t.status != TaskStatusEnum.CANCELLED), 1
    )

    ts_q = select(func.coalesce(func.sum(TimesheetEntry.hours_logged), 0)).where(
        TimesheetEntry.user_id == user_id,
        TimesheetEntry.status == TimesheetStatusEnum.APPROVED,
    )
    if project_id:
        ts_q = ts_q.where(TimesheetEntry.project_id == project_id)
    ts_hours = float((await db.execute(ts_q)).scalar_one())

    done_with_deadline = tasks_done_ontime + tasks_done_overdue
    ontime_rate = (
        round(tasks_done_ontime / done_with_deadline * 100, 1)
        if done_with_deadline > 0 else None
    )
    completion_rate = (
        round(tasks_done / tasks_assigned * 100, 1)
        if tasks_assigned > 0 else None
    )

    if ontime_rate is not None or completion_rate is not None:
        base = (ontime_rate or 0) * 0.6 + (completion_rate or 0) * 0.4
        penalty = min(20.0, tasks_overdue * 5.0)
        kpi_score = round(max(0.0, base - penalty), 1)
    else:
        kpi_score = None

    # Per-project breakdown (only when not scoped to a single project)
    projects_breakdown = []
    if not project_id and tasks:
        project_ids = list({t.project_id for t in tasks})
        all_projects = (await db.execute(
            select(Project).where(Project.id.in_(project_ids))
        )).scalars().all()
        proj_name_map = {p.id: p.name for p in all_projects}

        for pid in project_ids:
            ptasks = [t for t in tasks if t.project_id == pid]
            pdone = [t for t in ptasks if t.status == TaskStatusEnum.DONE]
            p_assigned = sum(1 for t in ptasks if t.status != TaskStatusEnum.CANCELLED)
            p_ontime = sum(
                1 for t in pdone
                if t.completed_at is not None
                and (t.due_date is None or t.completed_at.date() <= t.due_date)
            )
            p_overdue_done = sum(
                1 for t in pdone
                if t.due_date is not None
                and t.completed_at is not None
                and t.completed_at.date() > t.due_date
            )
            p_overdue = sum(
                1 for t in ptasks
                if t.status not in (TaskStatusEnum.DONE, TaskStatusEnum.CANCELLED)
                and t.due_date is not None
                and t.due_date < today
            )
            pts_hours = float((await db.execute(
                select(func.coalesce(func.sum(TimesheetEntry.hours_logged), 0)).where(
                    TimesheetEntry.user_id == user_id,
                    TimesheetEntry.project_id == pid,
                    TimesheetEntry.status == TimesheetStatusEnum.APPROVED,
                )
            )).scalar_one())
            p_done_with_dl = p_ontime + p_overdue_done
            p_ontime_rate = (
                round(p_ontime / p_done_with_dl * 100, 1)
                if p_done_with_dl > 0 else None
            )
            projects_breakdown.append({
                "project_id": str(pid),
                "project_name": proj_name_map.get(pid, "Unknown"),
                "tasks_assigned": p_assigned,
                "tasks_done_ontime": p_ontime,
                "tasks_done_overdue": p_overdue_done,
                "tasks_overdue": p_overdue,
                "ontime_rate": p_ontime_rate,
                "total_actual_hours": pts_hours,
            })
        projects_breakdown.sort(key=lambda x: x["project_name"])

    return {
        "success": True,
        "data": {
            "user_id": str(user_id),
            "full_name": target_user.full_name,
            "email": target_user.email,
            "as_of": str(today),
            "kpi_score": kpi_score,
            "summary": {
                "tasks_assigned": tasks_assigned,
                "tasks_done": tasks_done,
                "tasks_done_ontime": tasks_done_ontime,
                "tasks_done_overdue": tasks_done_overdue,
                "tasks_done_no_deadline": tasks_done_no_deadline,
                "tasks_overdue": tasks_overdue,
                "tasks_in_progress": tasks_in_progress,
                "tasks_todo": tasks_todo,
                "ontime_rate": ontime_rate,
                "completion_rate": completion_rate,
                "total_actual_hours": ts_hours,
                "total_estimated_hours": total_estimated,
            },
            "projects": projects_breakdown,
        },
    }
