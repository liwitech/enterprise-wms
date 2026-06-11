from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.common import ApiResponse, ok
from app.schemas.user import UserRead

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=ApiResponse[list[UserRead]])
async def list_org_users(
    search: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Danh sách người dùng trong cùng tổ chức — dùng để chọn thành viên dự án."""
    q = select(User).where(
        User.org_id == current_user.org_id,
        User.deleted_at.is_(None),
        User.is_active == True,  # noqa: E712
    )
    if search:
        q = q.where(or_(
            User.full_name.ilike(f"%{search}%"),
            User.email.ilike(f"%{search}%"),
        ))
    rows = (await db.execute(
        q.order_by(User.full_name).offset((page - 1) * per_page).limit(per_page)
    )).scalars().all()
    return ok([UserRead.model_validate(u) for u in rows])
