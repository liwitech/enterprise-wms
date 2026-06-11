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

_AUTH = {401: {"description": "Chưa xác thực"}}
_AUTH_403 = {401: {"description": "Chưa xác thực"}, 403: {"description": "Không có quyền"}}
_NOT_FOUND = {404: {"description": "Bản ghi chấm công không tồn tại"}}


# ── Employee: CRUD ────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=ApiResponse[list[TimesheetEntryRead]],
    summary="Danh sách chấm công",
    description=(
        "Lấy danh sách bản ghi chấm công của người dùng hiện tại. "
        "Có thể lọc theo tuần, tháng, dự án, trạng thái."
    ),
    responses={**_AUTH, 422: {"description": "Tham số không hợp lệ"}},
)
async def list_entries(
    week_start: Optional[date] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    project_id: Optional[UUID] = None,
    status: Optional[TimesheetStatusEnum] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
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
    summary="Tạo bản ghi chấm công",
    description=(
        "Tạo bản ghi giờ làm việc cho task. "
        "Ràng buộc: `work_date` ≤ hôm nay; 0 < `hours_logged` ≤ 16; "
        "tổng giờ trong ngày ≤ 16h. Trạng thái ban đầu: DRAFT."
    ),
    responses={
        **_AUTH,
        400: {"description": "Ngày tương lai hoặc tổng giờ ngày vượt 16h"},
        422: {"description": "Dữ liệu không hợp lệ"},
    },
)
async def create_entry(
    data: TimesheetEntryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = await TimesheetService(db).create_entry(data, user)
    return ok(TimesheetEntryRead.model_validate(entry), message="Timesheet entry created")


@router.put(
    "/{entry_id}",
    response_model=ApiResponse[TimesheetEntryRead],
    summary="Cập nhật bản ghi",
    description=(
        "Cập nhật bản ghi chấm công. Chỉ được sửa khi trạng thái là DRAFT hoặc REJECTED. "
        "Sửa bản ghi REJECTED tự động reset về DRAFT và xóa `reject_reason`."
    ),
    responses={
        **_AUTH,
        **_NOT_FOUND,
        400: {"description": "Không thể sửa khi trạng thái SUBMITTED hoặc APPROVED"},
        422: {"description": "Dữ liệu không hợp lệ"},
    },
)
async def update_entry(
    entry_id: UUID,
    data: TimesheetEntryUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = await TimesheetService(db).update_entry(entry_id, data, user)
    return ok(TimesheetEntryRead.model_validate(entry))


@router.delete(
    "/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Xóa bản ghi",
    description="Xóa bản ghi chấm công. Chỉ được xóa khi trạng thái DRAFT.",
    responses={
        **_AUTH,
        **_NOT_FOUND,
        400: {"description": "Không thể xóa khi trạng thái không phải DRAFT"},
    },
)
async def delete_entry(
    entry_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await TimesheetService(db).delete_entry(entry_id, user)


# ── Employee: batch submit ────────────────────────────────────────────────────

@router.post(
    "/submit",
    response_model=ApiResponse[list[TimesheetEntryRead]],
    summary="Nộp chấm công hàng loạt",
    description=(
        "Chuyển các bản ghi DRAFT sang SUBMITTED để manager duyệt. "
        "Tất cả entry_ids phải thuộc người dùng hiện tại và ở trạng thái DRAFT."
    ),
    responses={
        **_AUTH,
        400: {"description": "Bản ghi không ở trạng thái DRAFT hoặc không thuộc người dùng"},
        422: {"description": "Danh sách entry_ids rỗng"},
    },
)
async def submit_entries(
    data: TimesheetSubmitRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entries = await TimesheetService(db).submit_batch(data.entry_ids, user)
    return ok([TimesheetEntryRead.model_validate(e) for e in entries], message="Entries submitted")


# ── Employee: summary ─────────────────────────────────────────────────────────

@router.get(
    "/summary",
    response_model=ApiResponse[TimesheetSummaryResponse],
    summary="Tóm tắt chấm công theo tháng",
    description=(
        "Trả về tổng giờ theo dự án, theo ngày, và theo tuần cho tháng được chỉ định. "
        "Chỉ tính bản ghi APPROVED."
    ),
    responses={**_AUTH, 422: {"description": "year/month bắt buộc"}},
)
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
    summary="Danh sách chờ duyệt (Manager)",
    description=(
        "Lấy các bản ghi SUBMITTED chờ manager phê duyệt. "
        "Manager chỉ thấy bản ghi của nhân viên trong phòng ban mình. "
        "Admin/Super-admin thấy tất cả."
    ),
    responses={**_AUTH_403},
)
async def get_pending(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
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
    summary="Duyệt bản ghi",
    description=(
        "Duyệt bản ghi SUBMITTED → APPROVED. "
        "Tự động cộng `hours_logged` vào `actual_hours` của task. "
        "Manager chỉ duyệt được bản ghi thuộc phòng ban mình."
    ),
    responses={
        **_AUTH_403,
        **_NOT_FOUND,
        400: {"description": "Bản ghi không ở trạng thái SUBMITTED"},
    },
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
    summary="Từ chối bản ghi",
    description=(
        "Từ chối bản ghi SUBMITTED → REJECTED với lý do cụ thể. "
        "Nhân viên có thể sửa và nộp lại."
    ),
    responses={
        **_AUTH_403,
        **_NOT_FOUND,
        400: {"description": "Bản ghi không ở trạng thái SUBMITTED"},
        422: {"description": "reject_reason bắt buộc"},
    },
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
    summary="Duyệt hàng loạt",
    description=(
        "Duyệt nhiều bản ghi SUBMITTED cùng lúc. "
        "Chỉ duyệt được bản ghi trong phạm vi quyền (Manager: dept mình; Admin: tất cả)."
    ),
    responses={
        **_AUTH_403,
        400: {"description": "Một hoặc nhiều bản ghi không hợp lệ"},
    },
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
