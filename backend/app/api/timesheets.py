from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.enums import TimesheetStatusEnum, UserRoleEnum
from app.models.user import User
from app.schemas.common import ApiResponse, ok, paginated
from app.schemas.timesheet import (
    TimesheetBatchApproveRequest,
    TimesheetEntryCreate,
    TimesheetEntryExtended,
    TimesheetEntryRead,
    TimesheetEntryUpdate,
    TimesheetRejectRequest,
    TimesheetSubmitRequest,
    TimesheetSummaryResponse,
)
from app.services.timesheet_service import TimesheetService

router = APIRouter(prefix="/timesheets", tags=["timesheets"])


# ── Employee: CRUD ────────────────────────────────────────────────────────────

@router.get("", response_model=ApiResponse[list[TimesheetEntryRead]])
async def list_entries(
    week_start: Optional[date] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    project_id: Optional[UUID] = None,
    status: Optional[TimesheetStatusEnum] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = TimesheetService(db)
    entries, total = await svc.list_entries(
        user,
        week_start=week_start,
        year=year,
        month=month,
        project_id=project_id,
        status=status,
        page=page,
        per_page=per_page,
    )
    return paginated([TimesheetEntryRead.model_validate(e) for e in entries], page, per_page, total)


@router.post(
    "",
    response_model=ApiResponse[TimesheetEntryRead],
    status_code=status.HTTP_201_CREATED,
)
async def create_entry(
    data: TimesheetEntryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = await TimesheetService(db).create_entry(data, user)
    return ok(TimesheetEntryRead.model_validate(entry), message="Timesheet entry created")


@router.put("/{entry_id}", response_model=ApiResponse[TimesheetEntryRead])
async def update_entry(
    entry_id: UUID,
    data: TimesheetEntryUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = await TimesheetService(db).update_entry(entry_id, data, user)
    return ok(TimesheetEntryRead.model_validate(entry))


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(
    entry_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await TimesheetService(db).delete_entry(entry_id, user)


# ── Employee: batch submit ────────────────────────────────────────────────────

@router.post("/submit", response_model=ApiResponse[list[TimesheetEntryRead]])
async def submit_entries(
    data: TimesheetSubmitRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entries = await TimesheetService(db).submit_batch(data.entry_ids, user)
    return ok([TimesheetEntryRead.model_validate(e) for e in entries], message="Entries submitted")


# ── Employee: summary ─────────────────────────────────────────────────────────

@router.get("/summary", response_model=ApiResponse[TimesheetSummaryResponse])
async def get_summary(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    summary = await TimesheetService(db).get_summary(user, year, month)
    return ok(summary)


# ── Manager: pending list ─────────────────────────────────────────────────────

@router.get(
    "/pending",
    response_model=ApiResponse[list[TimesheetEntryExtended]],
)
async def get_pending(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(
        require_role(
            UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN, UserRoleEnum.MANAGER
        )
    ),
):
    entries, total = await TimesheetService(db).get_pending(user, page=page, per_page=per_page)
    return paginated(
        [TimesheetEntryExtended.model_validate(e) for e in entries], page, per_page, total
    )


# ── Manager: approve / reject ─────────────────────────────────────────────────

@router.post(
    "/{entry_id}/approve",
    response_model=ApiResponse[TimesheetEntryRead],
)
async def approve_entry(
    entry_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(
        require_role(
            UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN, UserRoleEnum.MANAGER
        )
    ),
):
    entry = await TimesheetService(db).approve_entry(entry_id, user)
    return ok(TimesheetEntryRead.model_validate(entry), message="Entry approved")


@router.post(
    "/{entry_id}/reject",
    response_model=ApiResponse[TimesheetEntryRead],
)
async def reject_entry(
    entry_id: UUID,
    data: TimesheetRejectRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(
        require_role(
            UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN, UserRoleEnum.MANAGER
        )
    ),
):
    entry = await TimesheetService(db).reject_entry(entry_id, data.reject_reason, user)
    return ok(TimesheetEntryRead.model_validate(entry), message="Entry rejected")


@router.post(
    "/approve-batch",
    response_model=ApiResponse[list[TimesheetEntryRead]],
)
async def approve_batch(
    data: TimesheetBatchApproveRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(
        require_role(
            UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN, UserRoleEnum.MANAGER
        )
    ),
):
    entries = await TimesheetService(db).approve_batch(data.entry_ids, user)
    return ok(
        [TimesheetEntryRead.model_validate(e) for e in entries],
        message=f"Approved {len(entries)} entries",
    )
