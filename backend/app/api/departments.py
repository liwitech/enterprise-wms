from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.department import Department
from app.models.user import User
from app.schemas.common import ApiResponse, ok
from app.schemas.dashboard import DepartmentBrief

router = APIRouter(prefix="/departments", tags=["departments"])


@router.get("", response_model=ApiResponse[list[DepartmentBrief]])
async def list_departments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[DepartmentBrief]]:
    rows = (
        await db.execute(
            select(Department)
            .where(Department.org_id == current_user.org_id)
            .order_by(Department.name)
        )
    ).scalars().all()
    return ok([DepartmentBrief(id=str(d.id), name=d.name, code=d.code) for d in rows])
