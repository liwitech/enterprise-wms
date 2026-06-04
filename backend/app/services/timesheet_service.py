from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.department import Department
from app.models.enums import TimesheetStatusEnum, UserRoleEnum
from app.models.task import Task
from app.models.timesheet import TimesheetEntry
from app.models.timesheet_weekly_summary import TimesheetWeeklySummary
from app.models.user import User
from app.schemas.timesheet import (
    TimesheetEntryCreate,
    TimesheetEntryUpdate,
    TimesheetSummaryResponse,
    SummaryByProject,
    SummaryByDay,
    SummaryByWeek,
)


class TimesheetService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── List ──────────────────────────────────────────────────────────────────

    async def list_entries(
        self,
        user: User,
        *,
        week_start: Optional[date] = None,
        year: Optional[int] = None,
        month: Optional[int] = None,
        project_id: Optional[UUID] = None,
        status: Optional[TimesheetStatusEnum] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[TimesheetEntry], int]:
        q = (
            select(TimesheetEntry)
            .options(
                selectinload(TimesheetEntry.user),
                selectinload(TimesheetEntry.project),
            )
            .where(TimesheetEntry.user_id == user.id)
        )

        if week_start:
            week_end = date.fromordinal(week_start.toordinal() + 6)
            q = q.where(
                TimesheetEntry.work_date >= week_start,
                TimesheetEntry.work_date <= week_end,
            )
        if year and month:
            q = q.where(
                func.date_part("year", TimesheetEntry.work_date) == year,
                func.date_part("month", TimesheetEntry.work_date) == month,
            )
        elif year:
            q = q.where(func.date_part("year", TimesheetEntry.work_date) == year)
        elif month:
            q = q.where(func.date_part("month", TimesheetEntry.work_date) == month)

        if project_id:
            q = q.where(TimesheetEntry.project_id == project_id)
        if status:
            q = q.where(TimesheetEntry.status == status)

        q = q.order_by(TimesheetEntry.work_date.desc())

        total = (
            await self.db.execute(select(func.count()).select_from(q.subquery()))
        ).scalar_one()

        entries = (
            await self.db.execute(q.offset((page - 1) * per_page).limit(per_page))
        ).scalars().all()

        return list(entries), total

    # ── Create ────────────────────────────────────────────────────────────────

    async def create_entry(self, data: TimesheetEntryCreate, user: User) -> TimesheetEntry:
        # work_date must not be more than 1 day in the future
        today = date.today()
        if data.work_date > today:
            raise HTTPException(
                status_code=400,
                detail="work_date cannot be in the future",
            )

        # Resolve project_id from task
        task = await self.db.get(Task, data.task_id)
        if not task or task.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Task not found")

        # Validate daily total <= 16h
        day_total = (
            await self.db.execute(
                select(func.coalesce(func.sum(TimesheetEntry.hours_logged), Decimal("0")))
                .where(
                    TimesheetEntry.user_id == user.id,
                    TimesheetEntry.work_date == data.work_date,
                    TimesheetEntry.status != TimesheetStatusEnum.REJECTED,
                )
            )
        ).scalar_one()

        if Decimal(str(day_total)) + data.hours_logged > 16:
            raise HTTPException(
                status_code=400,
                detail=f"Daily total would exceed 16h (already logged {day_total}h on {data.work_date})",
            )

        entry = TimesheetEntry(
            user_id=user.id,
            task_id=data.task_id,
            project_id=task.project_id,
            work_date=data.work_date,
            hours_logged=data.hours_logged,
            description=data.description,
            status=TimesheetStatusEnum.DRAFT,
        )
        self.db.add(entry)
        await self.db.commit()
        await self.db.refresh(entry)
        return entry

    # ── Update ────────────────────────────────────────────────────────────────

    async def update_entry(
        self, entry_id: UUID, data: TimesheetEntryUpdate, user: User
    ) -> TimesheetEntry:
        entry = await self._get_own_or_404(entry_id, user)
        if entry.status not in (TimesheetStatusEnum.DRAFT, TimesheetStatusEnum.REJECTED):
            raise HTTPException(
                status_code=400,
                detail="Only DRAFT or REJECTED entries can be edited",
            )

        updates = data.model_dump(exclude_none=True)
        new_work_date = updates.get("work_date", entry.work_date)
        new_hours = updates.get("hours_logged", entry.hours_logged)

        if new_work_date > date.today():
            raise HTTPException(status_code=400, detail="work_date cannot be in the future")

        # Validate daily total (excluding current entry)
        day_total = (
            await self.db.execute(
                select(func.coalesce(func.sum(TimesheetEntry.hours_logged), Decimal("0")))
                .where(
                    TimesheetEntry.user_id == user.id,
                    TimesheetEntry.work_date == new_work_date,
                    TimesheetEntry.status != TimesheetStatusEnum.REJECTED,
                    TimesheetEntry.id != entry_id,
                )
            )
        ).scalar_one()

        if Decimal(str(day_total)) + Decimal(str(new_hours)) > 16:
            raise HTTPException(
                status_code=400,
                detail=f"Daily total would exceed 16h (already logged {day_total}h on {new_work_date})",
            )

        for k, v in updates.items():
            setattr(entry, k, v)

        # REJECTED → DRAFT on edit
        if entry.status == TimesheetStatusEnum.REJECTED:
            entry.status = TimesheetStatusEnum.DRAFT
            entry.reject_reason = None

        await self.db.commit()
        await self.db.refresh(entry)
        return entry

    # ── Delete ────────────────────────────────────────────────────────────────

    async def delete_entry(self, entry_id: UUID, user: User) -> None:
        entry = await self._get_own_or_404(entry_id, user)
        if entry.status != TimesheetStatusEnum.DRAFT:
            raise HTTPException(
                status_code=400, detail="Only DRAFT entries can be deleted"
            )
        await self.db.delete(entry)
        await self.db.commit()

    # ── Submit batch ──────────────────────────────────────────────────────────

    async def submit_batch(
        self, entry_ids: list[UUID], user: User
    ) -> list[TimesheetEntry]:
        if not entry_ids:
            raise HTTPException(status_code=400, detail="entry_ids must not be empty")

        rows = (
            await self.db.execute(
                select(TimesheetEntry).where(
                    TimesheetEntry.id.in_(entry_ids),
                    TimesheetEntry.user_id == user.id,
                )
            )
        ).scalars().all()

        found_ids = {e.id for e in rows}
        missing = set(entry_ids) - found_ids
        if missing:
            raise HTTPException(
                status_code=404,
                detail=f"Entries not found or not owned by you: {[str(i) for i in missing]}",
            )

        now = datetime.now(timezone.utc)
        updated = []
        for entry in rows:
            if entry.status != TimesheetStatusEnum.DRAFT:
                raise HTTPException(
                    status_code=400,
                    detail=f"Entry {entry.id} is not DRAFT (status={entry.status.value})",
                )
            entry.status = TimesheetStatusEnum.SUBMITTED
            entry.submitted_at = now
            updated.append(entry)

        await self.db.commit()
        for e in updated:
            await self.db.refresh(e)
        return updated

    # ── Summary ───────────────────────────────────────────────────────────────

    async def get_summary(self, user: User, year: int, month: int) -> TimesheetSummaryResponse:
        base_filter = [
            TimesheetEntry.user_id == user.id,
            TimesheetEntry.status != TimesheetStatusEnum.REJECTED,
            func.date_part("year", TimesheetEntry.work_date) == year,
            func.date_part("month", TimesheetEntry.work_date) == month,
        ]

        # by_project
        from app.models.project import Project
        project_rows = (
            await self.db.execute(
                select(
                    TimesheetEntry.project_id,
                    Project.name.label("project_name"),
                    func.sum(TimesheetEntry.hours_logged).label("total_hours"),
                )
                .join(Project, Project.id == TimesheetEntry.project_id)
                .where(*base_filter)
                .group_by(TimesheetEntry.project_id, Project.name)
                .order_by(func.sum(TimesheetEntry.hours_logged).desc())
            )
        ).all()

        by_project = [
            SummaryByProject(
                project_id=r.project_id,
                project_name=r.project_name,
                total_hours=Decimal(str(r.total_hours)),
            )
            for r in project_rows
        ]

        # by_day
        day_rows = (
            await self.db.execute(
                select(
                    TimesheetEntry.work_date,
                    func.sum(TimesheetEntry.hours_logged).label("total_hours"),
                )
                .where(*base_filter)
                .group_by(TimesheetEntry.work_date)
                .order_by(TimesheetEntry.work_date)
            )
        ).all()

        by_day = [
            SummaryByDay(work_date=r.work_date, total_hours=Decimal(str(r.total_hours)))
            for r in day_rows
        ]

        # by_week (ISO Monday of the week) — use text literal to avoid parameterization
        _week_expr = func.date_trunc(text("'week'"), TimesheetEntry.work_date)
        week_rows = (
            await self.db.execute(
                select(
                    _week_expr.label("week_start"),
                    func.sum(TimesheetEntry.hours_logged).label("total_hours"),
                )
                .where(*base_filter)
                .group_by(_week_expr)
                .order_by(_week_expr)
            )
        ).all()

        by_week = [
            SummaryByWeek(
                week_start=r.week_start.date() if hasattr(r.week_start, "date") else r.week_start,
                total_hours=Decimal(str(r.total_hours)),
            )
            for r in week_rows
        ]

        return TimesheetSummaryResponse(by_project=by_project, by_day=by_day, by_week=by_week)

    # ── Manager: pending ─────────────────────────────────────────────────────

    async def get_pending(
        self, manager: User, page: int = 1, per_page: int = 20
    ) -> tuple[list[TimesheetEntry], int]:
        q = (
            select(TimesheetEntry)
            .options(
                selectinload(TimesheetEntry.user),
                selectinload(TimesheetEntry.project),
            )
            .where(TimesheetEntry.status == TimesheetStatusEnum.SUBMITTED)
        )

        if manager.role not in (UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN):
            managed_dept_ids = select(Department.id).where(
                Department.manager_user_id == manager.id
            )
            managed_user_ids = select(User.id).where(
                User.dept_id.in_(managed_dept_ids)
            )
            q = q.where(TimesheetEntry.user_id.in_(managed_user_ids))

        q = q.order_by(TimesheetEntry.submitted_at.asc())

        total = (
            await self.db.execute(select(func.count()).select_from(q.subquery()))
        ).scalar_one()

        entries = (
            await self.db.execute(q.offset((page - 1) * per_page).limit(per_page))
        ).scalars().all()

        return list(entries), total

    # ── Approve ───────────────────────────────────────────────────────────────

    async def approve_entry(self, entry_id: UUID, manager: User) -> TimesheetEntry:
        entry = await self._get_or_404(entry_id)
        if entry.status != TimesheetStatusEnum.SUBMITTED:
            raise HTTPException(
                status_code=400, detail="Only SUBMITTED entries can be approved"
            )
        await self._check_manager_can_act(entry, manager)

        entry.status = TimesheetStatusEnum.APPROVED
        entry.approved_by = manager.id
        entry.approved_at = datetime.now(timezone.utc)

        # Update Task.actual_hours
        task = await self.db.get(Task, entry.task_id)
        if task:
            task.actual_hours = (task.actual_hours or 0.0) + float(entry.hours_logged)

        await self.db.commit()
        await self.db.refresh(entry)
        return entry

    # ── Reject ────────────────────────────────────────────────────────────────

    async def reject_entry(
        self, entry_id: UUID, reject_reason: str, manager: User
    ) -> TimesheetEntry:
        entry = await self._get_or_404(entry_id)
        if entry.status != TimesheetStatusEnum.SUBMITTED:
            raise HTTPException(
                status_code=400, detail="Only SUBMITTED entries can be rejected"
            )
        await self._check_manager_can_act(entry, manager)

        entry.status = TimesheetStatusEnum.REJECTED
        entry.reject_reason = reject_reason
        # Mock email log
        print(
            f"[MOCK EMAIL] Timesheet {entry_id} rejected by {manager.email}: {reject_reason}"
        )

        await self.db.commit()
        await self.db.refresh(entry)
        return entry

    # ── Batch approve ─────────────────────────────────────────────────────────

    async def approve_batch(
        self, entry_ids: list[UUID], manager: User
    ) -> list[TimesheetEntry]:
        if not entry_ids:
            raise HTTPException(status_code=400, detail="entry_ids must not be empty")

        rows = (
            await self.db.execute(
                select(TimesheetEntry).where(TimesheetEntry.id.in_(entry_ids))
            )
        ).scalars().all()

        found_ids = {e.id for e in rows}
        missing = set(entry_ids) - found_ids
        if missing:
            raise HTTPException(
                status_code=404,
                detail=f"Entries not found: {[str(i) for i in missing]}",
            )

        now = datetime.now(timezone.utc)
        updated = []
        for entry in rows:
            if entry.status != TimesheetStatusEnum.SUBMITTED:
                raise HTTPException(
                    status_code=400,
                    detail=f"Entry {entry.id} is not SUBMITTED (status={entry.status.value})",
                )
            await self._check_manager_can_act(entry, manager)
            entry.status = TimesheetStatusEnum.APPROVED
            entry.approved_by = manager.id
            entry.approved_at = now

            task = await self.db.get(Task, entry.task_id)
            if task:
                task.actual_hours = (task.actual_hours or 0.0) + float(entry.hours_logged)

            updated.append(entry)

        await self.db.commit()
        for e in updated:
            await self.db.refresh(e)
        return updated

    # ── Reports ───────────────────────────────────────────────────────────────

    async def get_report_entries(
        self,
        manager: User,
        *,
        dept_id: Optional[UUID] = None,
        week_start: Optional[date] = None,
        project_id: Optional[UUID] = None,
    ) -> list[TimesheetEntry]:
        q = select(TimesheetEntry).options(
            selectinload(TimesheetEntry.user),
            selectinload(TimesheetEntry.project),
        )

        if manager.role not in (UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN):
            managed_dept_ids = select(Department.id).where(
                Department.manager_user_id == manager.id
            )
            visible_user_ids = select(User.id).where(User.dept_id.in_(managed_dept_ids))
            q = q.where(TimesheetEntry.user_id.in_(visible_user_ids))
        elif dept_id:
            dept_user_ids = select(User.id).where(User.dept_id == dept_id)
            q = q.where(TimesheetEntry.user_id.in_(dept_user_ids))

        if week_start:
            week_end = date.fromordinal(week_start.toordinal() + 6)
            q = q.where(
                TimesheetEntry.work_date >= week_start,
                TimesheetEntry.work_date <= week_end,
            )
        if project_id:
            q = q.where(TimesheetEntry.project_id == project_id)

        q = q.order_by(TimesheetEntry.work_date.asc())
        return list((await self.db.execute(q)).scalars().all())

    async def get_weekly_summaries(
        self,
        manager: User,
        *,
        week_start: Optional[date] = None,
        dept_id: Optional[UUID] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> tuple[list[TimesheetWeeklySummary], int]:
        q = select(TimesheetWeeklySummary).options(
            selectinload(TimesheetWeeklySummary.user),
            selectinload(TimesheetWeeklySummary.project),
        )

        if manager.role not in (UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN):
            managed_dept_ids = select(Department.id).where(
                Department.manager_user_id == manager.id
            )
            visible_user_ids = select(User.id).where(User.dept_id.in_(managed_dept_ids))
            q = q.where(TimesheetWeeklySummary.user_id.in_(visible_user_ids))
        elif dept_id:
            dept_user_ids = select(User.id).where(User.dept_id == dept_id)
            q = q.where(TimesheetWeeklySummary.user_id.in_(dept_user_ids))

        if week_start:
            q = q.where(TimesheetWeeklySummary.week_start == week_start)

        q = q.order_by(TimesheetWeeklySummary.week_start.desc())

        total = (
            await self.db.execute(select(func.count()).select_from(q.subquery()))
        ).scalar_one()
        rows = (
            await self.db.execute(q.offset((page - 1) * per_page).limit(per_page))
        ).scalars().all()

        return list(rows), total

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _get_or_404(self, entry_id: UUID) -> TimesheetEntry:
        entry = await self.db.get(TimesheetEntry, entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Timesheet entry not found")
        return entry

    async def _get_own_or_404(self, entry_id: UUID, user: User) -> TimesheetEntry:
        entry = await self._get_or_404(entry_id)
        if entry.user_id != user.id:
            raise HTTPException(status_code=403, detail="Not your timesheet entry")
        return entry

    async def _check_manager_can_act(self, entry: TimesheetEntry, manager: User) -> None:
        if manager.role in (UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN):
            return
        if manager.role != UserRoleEnum.MANAGER:
            raise HTTPException(
                status_code=403, detail="Only managers or admins can approve/reject timesheets"
            )
        # Check if entry owner is in a dept managed by this manager
        owner = await self.db.get(User, entry.user_id)
        if not owner or not owner.dept_id:
            raise HTTPException(
                status_code=403, detail="Cannot determine entry owner's department"
            )
        dept = await self.db.get(Department, owner.dept_id)
        if not dept or dept.manager_user_id != manager.id:
            raise HTTPException(
                status_code=403,
                detail="You can only approve timesheets for employees in your department",
            )
