from __future__ import annotations

from datetime import date, timedelta
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.core.redis_client import _client
from app.db.session import get_db
from app.models.enums import UserRoleEnum
from app.models.user import User
from app.schemas.common import ApiResponse, ok
from app.schemas.dashboard import ExecutiveDashboardResponse
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

_EXEC_TTL = 600  # 10 minutes


def _cache_key(
    org_id: str,
    dept_id: str | None,
    period: str,
    d_from: str | None,
    d_to: str | None,
) -> str:
    return f"exec:{org_id}:{dept_id or 'all'}:{period}:{d_from or ''}:{d_to or ''}"


@router.get(
    "/executive",
    response_model=ApiResponse[ExecutiveDashboardResponse],
    summary="Dashboard điều hành",
    description=(
        "Trả về tổng quan toàn tổ chức cho cấp quản lý: KPI tổng hợp, "
        "danh sách dự án với health status (ON_TRACK/AT_RISK/OVERDUE), "
        "cảnh báo ưu tiên, phân bổ tải công việc nhân sự, "
        "và số lượng chấm công chờ duyệt. "
        "Kết quả được cache Redis 10 phút theo (org, dept, period). "
        "Manager tự động bị giới hạn về phòng ban của mình."
    ),
    responses={
        401: {"description": "Chưa xác thực"},
        403: {"description": "Yêu cầu role MANAGER, ADMIN, hoặc SUPER_ADMIN"},
        422: {"description": "period không hợp lệ"},
    },
)
async def executive_dashboard(
    dept_id: UUID | None = Query(None, description="Lọc theo phòng ban (Admin only)"),
    period: Literal["current_month", "current_quarter", "custom"] = Query(
        "current_month",
        description="Kỳ báo cáo: current_month, current_quarter, hoặc custom (cần date_from/date_to)",
    ),
    date_from: date | None = Query(None, description="Ngày bắt đầu (chỉ dùng khi period=custom)"),
    date_to: date | None = Query(None, description="Ngày kết thúc (chỉ dùng khi period=custom)"),
    current_user: User = Depends(
        require_role(UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN, UserRoleEnum.MANAGER)
    ),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ExecutiveDashboardResponse]:
    today = date.today()

    if period == "current_quarter":
        q = (today.month - 1) // 3
        date_from = date(today.year, q * 3 + 1, 1)
        nm = q * 3 + 4
        ny = today.year + (1 if nm > 12 else 0)
        date_to = date(ny, nm - 12 if nm > 12 else nm, 1) - timedelta(days=1)
    elif period == "current_month":
        date_from = today.replace(day=1)
        nm = today.month % 12 + 1
        ny = today.year + (1 if today.month == 12 else 0)
        date_to = date(ny, nm, 1) - timedelta(days=1)

    # Managers are scoped to their own department
    effective_dept: UUID | None = dept_id
    if current_user.role == UserRoleEnum.MANAGER:
        effective_dept = current_user.dept_id  # type: ignore[assignment]

    ck = _cache_key(
        str(current_user.org_id),
        str(effective_dept) if effective_dept else None,
        period,
        date_from.isoformat() if date_from else None,
        date_to.isoformat() if date_to else None,
    )

    async with _client() as r:
        cached = await r.get(ck)
    if cached:
        return ok(ExecutiveDashboardResponse.model_validate_json(cached))

    data = await DashboardService(db).get_executive(
        org_id=current_user.org_id,
        dept_id=effective_dept,
        date_from=date_from,
        date_to=date_to,
    )

    async with _client() as r:
        await r.setex(ck, _EXEC_TTL, data.model_dump_json())

    return ok(data)
