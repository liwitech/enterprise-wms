import calendar as _cal
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import redis_client
from app.models.enums import ProjectMemberRoleEnum, TaskStatusEnum, UserRoleEnum
from app.models.project_member import ProjectMember
from app.models.task import Task
from app.models.task_comment import TaskComment
from app.models.timesheet import TimesheetEntry
from app.models.user import User
from app.schemas.task import (
    TaskCreate,
    TaskStatusUpdate,
    TaskUpdate,
    TimesheetSummaryBrief,
)


def _generate_recurrence_dates(
    start: date,
    rtype: str,
    interval: int,
    days: list[int] | None,
    end_type: str,
    count: int | None,
    until: date | None,
) -> list[date]:
    """Return all occurrence dates for a recurring task (including the first)."""
    MAX_COUNT = {'DAILY': 90, 'WEEKLY': 104, 'MONTHLY': 36, 'YEARLY': 10}
    cap = MAX_COUNT.get(rtype, 52)
    if end_type == 'COUNT' and count:
        cap = min(count, cap)

    results: list[date] = []

    def over_limit(d: date) -> bool:
        return (end_type == 'UNTIL' and until is not None and d > until) or len(results) >= cap

    if rtype == 'DAILY':
        cur = start
        while not over_limit(cur):
            results.append(cur)
            cur += timedelta(days=interval)

    elif rtype == 'WEEKLY':
        selected = sorted(set(days or [start.weekday()]))
        week_monday = start - timedelta(days=start.weekday())
        week_iter = 0
        while len(results) < cap and week_iter <= 200:
            for day_offset in selected:
                candidate = week_monday + timedelta(days=day_offset)
                if candidate < start:
                    continue
                if over_limit(candidate):
                    return results
                results.append(candidate)
            week_iter += 1
            week_monday += timedelta(weeks=interval)

    elif rtype == 'MONTHLY':
        cur = start
        while not over_limit(cur):
            results.append(cur)
            m = cur.month + interval
            y = cur.year + (m - 1) // 12
            m = ((m - 1) % 12) + 1
            d = min(start.day, _cal.monthrange(y, m)[1])
            cur = date(y, m, d)

    elif rtype == 'YEARLY':
        cur = start
        while not over_limit(cur):
            results.append(cur)
            y = cur.year + interval
            try:
                cur = date(y, cur.month, cur.day)
            except ValueError:
                cur = date(y, cur.month, 28)

    return results


class TaskService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── List ──────────────────────────────────────────────────────────────────

    async def list_tasks(
        self,
        user: User,
        *,
        project_id: Optional[UUID] = None,
        assignee_user_id: Optional[UUID] = None,
        status: Optional[TaskStatusEnum] = None,
        priority=None,
        sprint_id: Optional[UUID] = None,
        due_date_from: Optional[date] = None,
        due_date_to: Optional[date] = None,
        is_overdue: Optional[bool] = None,
        include_subtasks: bool = False,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[Task], int]:
        base_conditions = [Task.deleted_at.is_(None)]
        if not include_subtasks:
            base_conditions.append(Task.parent_task_id.is_(None))
        q = select(Task).where(*base_conditions)

        if user.role not in (UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN):
            member_subq = select(ProjectMember.project_id).where(
                ProjectMember.user_id == user.id
            )
            q = q.where(Task.project_id.in_(member_subq))

        if project_id:
            q = q.where(Task.project_id == project_id)
        if assignee_user_id:
            q = q.where(Task.assignee_user_id == assignee_user_id)
        if status:
            q = q.where(Task.status == status)
        if priority:
            q = q.where(Task.priority == priority)
        if sprint_id:
            q = q.where(Task.sprint_id == sprint_id)
        if due_date_from:
            q = q.where(Task.due_date >= due_date_from)
        if due_date_to:
            q = q.where(Task.due_date <= due_date_to)
        if is_overdue is True:
            today = date.today()
            q = q.where(
                Task.due_date < today,
                Task.status.not_in([TaskStatusEnum.DONE, TaskStatusEnum.CANCELLED]),
            )

        q = q.order_by(Task.created_at.desc())

        total = (
            await self.db.execute(select(func.count()).select_from(q.subquery()))
        ).scalar_one()

        tasks = (
            await self.db.execute(q.offset((page - 1) * per_page).limit(per_page))
        ).scalars().all()

        return list(tasks), total

    # ── Create ────────────────────────────────────────────────────────────────

    async def create_task(self, data: TaskCreate, user: User) -> Task:
        await self._check_member(data.project_id, user)
        seq_val = (await self.db.execute(text("SELECT nextval('task_code_seq')"))).scalar()
        task_code = f"TASK-{seq_val:04d}"
        task = Task(
            **data.model_dump(exclude={"reporter_user_id"}),
            reporter_user_id=user.id,
            task_code=task_code,
        )
        self.db.add(task)

        if data.is_recurring and data.recurrence_type and data.start_date:
            await self.db.flush()  # obtain task.id before creating children
            await self._create_recurrence_instances(task, data, user)

        await self.db.commit()
        await self.db.refresh(task)
        await redis_client.dashboard_cache_invalidate(str(task.project_id))
        return task

    async def _create_recurrence_instances(self, template: Task, data: TaskCreate, user: User) -> None:
        dates = _generate_recurrence_dates(
            start=data.start_date,  # type: ignore[arg-type]
            rtype=data.recurrence_type,  # type: ignore[arg-type]
            interval=data.recurrence_interval or 1,
            days=data.recurrence_days,
            end_type=data.recurrence_end_type or 'NEVER',
            count=data.recurrence_count,
            until=data.recurrence_until,
        )

        duration_days: int | None = None
        if data.due_date and data.start_date:
            duration_days = (data.due_date - data.start_date).days

        for occurrence_date in dates[1:]:  # first date is the template task itself
            seq_val = (await self.db.execute(text("SELECT nextval('task_code_seq')"))).scalar()
            child_due = (
                occurrence_date + timedelta(days=duration_days)
                if duration_days is not None else None
            )
            child = Task(
                project_id=data.project_id,
                sprint_id=data.sprint_id,
                title=data.title,
                description=data.description,
                status=TaskStatusEnum.TODO,
                priority=data.priority,
                assignee_user_id=data.assignee_user_id,
                start_date=occurrence_date,
                due_date=child_due,
                estimated_hours=data.estimated_hours,
                tags=data.tags,
                reporter_user_id=user.id,
                task_code=f"TASK-{seq_val:04d}",
                is_recurring=True,
                recurrence_parent_id=template.id,
            )
            self.db.add(child)

    # ── Get Detail ────────────────────────────────────────────────────────────

    async def get_task(self, task_id: UUID, user: User) -> Task:
        task = (
            await self.db.execute(
                select(Task)
                .options(
                    selectinload(Task.subtasks),
                    selectinload(Task.parent),
                    selectinload(Task.comments).selectinload(TaskComment.user),
                    selectinload(Task.attachments),
                )
                .where(Task.id == task_id, Task.deleted_at.is_(None))
            )
        ).scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        await self._check_view(task.project_id, user)
        return task

    async def get_timesheet_summary(self, task_id: UUID) -> TimesheetSummaryBrief:
        row = (
            await self.db.execute(
                select(
                    func.coalesce(
                        func.sum(TimesheetEntry.hours_logged), 0.0
                    ).label("total"),
                    func.count(TimesheetEntry.id).label("count"),
                ).where(TimesheetEntry.task_id == task_id)
            )
        ).one()
        return TimesheetSummaryBrief(total_hours=float(row.total), entry_count=row.count)

    # ── Update ────────────────────────────────────────────────────────────────

    async def update_task(self, task_id: UUID, data: TaskUpdate, user: User) -> Task:
        task = await self._get_or_404(task_id)
        await self._check_modify(task, user)
        updates = data.model_dump(exclude_unset=True)
        if "status" in updates:
            new_status = updates["status"]
            if new_status == TaskStatusEnum.DONE and task.status != TaskStatusEnum.DONE:
                updates["completed_at"] = datetime.now(timezone.utc)
            elif new_status != TaskStatusEnum.DONE and task.status == TaskStatusEnum.DONE:
                updates["completed_at"] = None
        for k, v in updates.items():
            setattr(task, k, v)
        await self.db.commit()
        await self.db.refresh(task)
        await redis_client.dashboard_cache_invalidate(str(task.project_id))
        return task

    # ── Status ────────────────────────────────────────────────────────────────

    async def update_task_status(
        self, task_id: UUID, data: TaskStatusUpdate, user: User
    ) -> Task:
        task = await self._get_or_404(task_id)
        await self._check_modify(task, user)
        old_status = task.status
        task.status = data.status
        if data.status == TaskStatusEnum.DONE and old_status != TaskStatusEnum.DONE:
            task.completed_at = datetime.now(timezone.utc)
        elif data.status != TaskStatusEnum.DONE and old_status == TaskStatusEnum.DONE:
            task.completed_at = None
        await self.db.commit()
        await self.db.refresh(task)

        await redis_client.publish_task_status_changed(
            project_id=str(task.project_id),
            task_id=str(task.id),
            old_status=old_status.value,
            new_status=data.status.value,
            user_id=str(user.id),
        )
        await redis_client.dashboard_cache_invalidate(str(task.project_id))
        return task

    # ── Comments ──────────────────────────────────────────────────────────────

    async def add_comment(
        self, task_id: UUID, content: str, user: User
    ) -> TaskComment:
        task = await self._get_or_404(task_id)
        await self._check_view(task.project_id, user)
        comment = TaskComment(task_id=task_id, user_id=user.id, content=content)
        self.db.add(comment)
        await self.db.commit()
        await self.db.refresh(comment)
        # Reload with user relationship
        result = await self.db.execute(
            select(TaskComment)
            .options(selectinload(TaskComment.user))
            .where(TaskComment.id == comment.id)
        )
        return result.scalar_one()

    async def list_comments(
        self, task_id: UUID, user: User, page: int = 1, per_page: int = 20
    ) -> tuple[list[TaskComment], int]:
        task = await self._get_or_404(task_id)
        await self._check_view(task.project_id, user)

        base_q = select(TaskComment).where(TaskComment.task_id == task_id)
        total = (
            await self.db.execute(
                select(func.count()).select_from(base_q.subquery())
            )
        ).scalar_one()

        comments = (
            await self.db.execute(
                base_q
                .options(selectinload(TaskComment.user))
                .order_by(TaskComment.created_at.asc())
                .offset((page - 1) * per_page)
                .limit(per_page)
            )
        ).scalars().all()

        return list(comments), total

    # ── Permission helpers ────────────────────────────────────────────────────

    async def _check_member(self, project_id: UUID, user: User) -> None:
        if user.role in (UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN):
            return
        member = (
            await self.db.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.user_id == user.id,
                    ProjectMember.role.in_(
                        [ProjectMemberRoleEnum.MEMBER, ProjectMemberRoleEnum.PM]
                    ),
                )
            )
        ).scalar_one_or_none()
        if not member:
            raise HTTPException(
                status_code=403,
                detail="Project members (MEMBER or PM) can create tasks",
            )

    async def _check_view(self, project_id: UUID, user: User) -> None:
        if user.role in (UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN):
            return
        member = (
            await self.db.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if not member:
            raise HTTPException(status_code=403, detail="Not a member of this project")

    async def _check_modify(self, task: Task, user: User) -> None:
        if user.role in (UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN):
            return
        if task.assignee_user_id == user.id:
            return
        member = (
            await self.db.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == task.project_id,
                    ProjectMember.user_id == user.id,
                    ProjectMember.role == ProjectMemberRoleEnum.PM,
                )
            )
        ).scalar_one_or_none()
        if not member:
            raise HTTPException(
                status_code=403,
                detail="Only the assignee, project manager, or admin can modify this task",
            )

    async def _get_or_404(self, task_id: UUID) -> Task:
        task = (
            await self.db.execute(
                select(Task).where(Task.id == task_id, Task.deleted_at.is_(None))
            )
        ).scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        return task
