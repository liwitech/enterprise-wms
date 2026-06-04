from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.department import Department
from app.models.enums import ProjectStatusEnum, TaskStatusEnum, TimesheetStatusEnum
from app.models.project import Project
from app.models.task import Task
from app.models.timesheet import TimesheetEntry
from app.models.user import User
from app.schemas.dashboard import (
    Alert,
    AlertSeverity,
    AlertType,
    DashboardSummary,
    ExecutiveDashboardResponse,
    OwnerBrief,
    ProjectBrief,
    ProjectHealth,
    WorkloadItem,
)

_CAPACITY_BASELINE = 20  # tasks considered 100% capacity


class DashboardService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_executive(
        self,
        org_id: UUID,
        dept_id: UUID | None,
        date_from: date | None,
        date_to: date | None,
    ) -> ExecutiveDashboardResponse:
        today = date.today()

        # ── Projects ──────────────────────────────────────────────────────────
        proj_q = select(Project).where(
            Project.org_id == org_id,
            Project.deleted_at.is_(None),
            Project.status.notin_([ProjectStatusEnum.CANCELLED]),
        )
        if dept_id:
            proj_q = proj_q.where(Project.dept_id == dept_id)
        if date_from:
            proj_q = proj_q.where(or_(Project.end_date >= date_from, Project.end_date.is_(None)))
        if date_to:
            proj_q = proj_q.where(or_(Project.start_date <= date_to, Project.start_date.is_(None)))

        projects = (await self.db.execute(proj_q)).scalars().all()
        project_ids = [p.id for p in projects]

        # ── Task stats ────────────────────────────────────────────────────────
        task_counts: dict[str, dict[str, int]] = {}
        open_tasks_count = 0
        due_soon_count = 0
        workload_rows: list = []

        if project_ids:
            tc_q = (
                select(
                    Task.project_id,
                    func.count(Task.id).label("total"),
                    func.sum(case((Task.status == TaskStatusEnum.DONE, 1), else_=0)).label("done"),
                    func.sum(
                        case(
                            (
                                and_(
                                    Task.status.notin_([TaskStatusEnum.DONE, TaskStatusEnum.CANCELLED]),
                                    Task.assignee_user_id.is_(None),
                                ),
                                1,
                            ),
                            else_=0,
                        )
                    ).label("unassigned"),
                )
                .where(
                    Task.project_id.in_(project_ids),
                    Task.deleted_at.is_(None),
                    Task.parent_task_id.is_(None),
                )
                .group_by(Task.project_id)
            )
            task_counts = {
                str(r.project_id): {
                    "total": int(r.total or 0),
                    "done": int(r.done or 0),
                    "unassigned": int(r.unassigned or 0),
                }
                for r in (await self.db.execute(tc_q)).all()
            }

            open_q = select(func.count(Task.id)).where(
                Task.project_id.in_(project_ids),
                Task.deleted_at.is_(None),
                Task.status.notin_([TaskStatusEnum.DONE, TaskStatusEnum.CANCELLED]),
            )
            open_tasks_count = (await self.db.execute(open_q)).scalar_one() or 0

            due_soon_q = select(func.count(Task.id)).where(
                Task.project_id.in_(project_ids),
                Task.deleted_at.is_(None),
                Task.status.notin_([TaskStatusEnum.DONE, TaskStatusEnum.CANCELLED]),
                Task.due_date.isnot(None),
                Task.due_date >= today,
                Task.due_date <= today + timedelta(days=7),
            )
            due_soon_count = (await self.db.execute(due_soon_q)).scalar_one() or 0

            wl_q = (
                select(
                    Task.assignee_user_id,
                    func.count(Task.id).label("tasks_assigned"),
                    func.sum(
                        case(
                            (
                                and_(
                                    Task.due_date < today,
                                    Task.status.notin_([TaskStatusEnum.DONE, TaskStatusEnum.CANCELLED]),
                                ),
                                1,
                            ),
                            else_=0,
                        )
                    ).label("tasks_overdue"),
                )
                .where(
                    Task.project_id.in_(project_ids),
                    Task.deleted_at.is_(None),
                    Task.assignee_user_id.isnot(None),
                    Task.status.notin_([TaskStatusEnum.DONE, TaskStatusEnum.CANCELLED]),
                )
                .group_by(Task.assignee_user_id)
                .order_by(func.count(Task.id).desc())
                .limit(10)
            )
            workload_rows = (await self.db.execute(wl_q)).all()

        # ── Active employees ──────────────────────────────────────────────────
        emp_q = select(func.count(User.id)).where(
            User.org_id == org_id,
            User.is_active.is_(True),
            User.deleted_at.is_(None),
        )
        if dept_id:
            emp_q = emp_q.where(User.dept_id == dept_id)
        active_employees = (await self.db.execute(emp_q)).scalar_one() or 0

        # ── Dept / Owner lookups ──────────────────────────────────────────────
        dept_ids = [p.dept_id for p in projects if p.dept_id]
        dept_map: dict[str, str] = {}
        if dept_ids:
            dept_rows = (
                await self.db.execute(select(Department).where(Department.id.in_(dept_ids)))
            ).scalars().all()
            dept_map = {str(d.id): d.name for d in dept_rows}

        owner_ids = list({p.owner_user_id for p in projects})
        owner_map: dict[str, User] = {}
        if owner_ids:
            owner_rows = (
                await self.db.execute(select(User).where(User.id.in_(owner_ids)))
            ).scalars().all()
            owner_map = {str(u.id): u for u in owner_rows}

        # ── Build ProjectBrief + counters ─────────────────────────────────────
        briefs: list[ProjectBrief] = []
        on_track = delayed = overdue_cnt = 0

        for p in projects:
            tc = task_counts.get(str(p.id), {"total": 0, "done": 0, "unassigned": 0})
            days_remaining: int | None = (p.end_date - today).days if p.end_date else None

            if days_remaining is not None and days_remaining < 0 and p.status != ProjectStatusEnum.COMPLETED:
                health = ProjectHealth.OVERDUE
                overdue_cnt += 1
            elif p.start_date and p.end_date:
                total_days = max((p.end_date - p.start_date).days, 1)
                elapsed = max((today - p.start_date).days, 0)
                expected = min(elapsed / total_days * 100, 100.0)
                if p.progress_percent < expected - 15:
                    health = ProjectHealth.AT_RISK
                    delayed += 1
                else:
                    health = ProjectHealth.ON_TRACK
                    on_track += 1
            elif days_remaining is not None and days_remaining <= 7 and p.progress_percent < 80:
                health = ProjectHealth.AT_RISK
                delayed += 1
            else:
                health = ProjectHealth.ON_TRACK
                on_track += 1

            owner = owner_map.get(str(p.owner_user_id))
            briefs.append(
                ProjectBrief(
                    id=str(p.id),
                    name=p.name,
                    dept_name=dept_map.get(str(p.dept_id)) if p.dept_id else None,
                    owner=OwnerBrief(
                        id=str(p.owner_user_id),
                        name=owner.full_name if owner else "—",
                        avatar_url=owner.avatar_url if owner else None,
                    ),
                    status=p.status.value,
                    health=health,
                    progress_percent=round(p.progress_percent, 1),
                    start_date=p.start_date.isoformat() if p.start_date else None,
                    end_date=p.end_date.isoformat() if p.end_date else None,
                    days_remaining=days_remaining,
                    tasks_total=tc["total"],
                    tasks_done=tc["done"],
                )
            )

        _h_order = {ProjectHealth.OVERDUE: 0, ProjectHealth.AT_RISK: 1, ProjectHealth.ON_TRACK: 2}
        briefs.sort(key=lambda b: (_h_order[b.health], b.days_remaining if b.days_remaining is not None else 9999))
        top10 = briefs[:10]

        # ── Alerts ────────────────────────────────────────────────────────────
        alerts: list[Alert] = []
        for b in briefs:
            if b.health == ProjectHealth.OVERDUE:
                alerts.append(Alert(
                    project_id=b.id,
                    project_name=b.name,
                    alert_type=AlertType.OVERDUE,
                    message=f'Dự án "{b.name}" đã quá hạn {abs(b.days_remaining or 0)} ngày.',
                    severity=AlertSeverity.HIGH,
                ))
            elif b.health == ProjectHealth.AT_RISK:
                alerts.append(Alert(
                    project_id=b.id,
                    project_name=b.name,
                    alert_type=AlertType.DELAYED,
                    message=f'Dự án "{b.name}" đang chậm so với kế hoạch ({b.progress_percent:.0f}% hoàn thành).',
                    severity=AlertSeverity.MEDIUM,
                ))
            unassigned = task_counts.get(b.id, {}).get("unassigned", 0)
            if unassigned > 0:
                alerts.append(Alert(
                    project_id=b.id,
                    project_name=b.name,
                    alert_type=AlertType.UNASSIGNED_TASKS,
                    message=f'Dự án "{b.name}" có {unassigned} công việc chưa được giao.',
                    severity=AlertSeverity.MEDIUM,
                ))

        alerts.sort(key=lambda a: 0 if a.severity == AlertSeverity.HIGH else 1)
        alerts = alerts[:10]

        # ── Workload ──────────────────────────────────────────────────────────
        wl_ids = [r.assignee_user_id for r in workload_rows if r.assignee_user_id]
        wu_map: dict[str, User] = {}
        if wl_ids:
            wu_rows = (
                await self.db.execute(select(User).where(User.id.in_(wl_ids)))
            ).scalars().all()
            wu_map = {str(u.id): u for u in wu_rows}

        workload: list[WorkloadItem] = []
        for r in workload_rows:
            u = wu_map.get(str(r.assignee_user_id))
            assigned = int(r.tasks_assigned or 0)
            workload.append(WorkloadItem(
                user_id=str(r.assignee_user_id),
                name=u.full_name if u else "—",
                avatar_url=u.avatar_url if u else None,
                tasks_assigned=assigned,
                tasks_overdue=int(r.tasks_overdue or 0),
                capacity_percent=min(round(assigned / _CAPACITY_BASELINE * 100, 1), 150.0),
            ))

        # ── Pending timesheets ─────────────────────────────────────────────────
        ts_q = select(func.count(TimesheetEntry.id)).where(
            TimesheetEntry.status == TimesheetStatusEnum.SUBMITTED
        )
        ts_pending = (await self.db.execute(ts_q)).scalar_one() or 0

        return ExecutiveDashboardResponse(
            summary=DashboardSummary(
                total_projects=len(projects),
                projects_on_track=on_track,
                projects_delayed=delayed,
                projects_overdue=overdue_cnt,
                total_tasks_open=int(open_tasks_count),
                tasks_due_soon=int(due_soon_count),
                total_employees_active=int(active_employees),
            ),
            projects=top10,
            alerts=alerts,
            workload=workload,
            timesheet_pending_count=int(ts_pending),
        )
