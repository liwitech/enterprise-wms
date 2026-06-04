from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.enums import UserRoleEnum, ProjectMemberRoleEnum
from app.models.user import User
from app.models.project_member import ProjectMember

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)

_ROLE_ORDER = {
    ProjectMemberRoleEnum.VIEWER: 0,
    ProjectMemberRoleEnum.MEMBER: 1,
    ProjectMemberRoleEnum.PM: 2,
}


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_access_token(token)
    if not payload:
        raise _UNAUTHORIZED

    user_id: str | None = payload.get("sub")
    if not user_id:
        raise _UNAUTHORIZED

    result = await db.execute(
        select(User).where(User.id == UUID(user_id), User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise _UNAUTHORIZED

    return user


def require_role(*roles: UserRoleEnum):
    """Dependency factory — raises 403 if user's system role is not in `roles`."""

    async def _check(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role(s): {', '.join(r.value for r in roles)}",
            )
        return user

    return _check


def require_project_access(min_role: ProjectMemberRoleEnum = ProjectMemberRoleEnum.VIEWER):
    """
    Dependency factory for project-level RBAC.
    Reads `project_id` from the path parameter of the calling endpoint.
    SUPER_ADMIN and ADMIN bypass the check automatically.
    """

    async def _check(
        project_id: UUID,
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        if current_user.role in (UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN):
            return current_user

        result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == current_user.id,
            )
        )
        member = result.scalar_one_or_none()

        if not member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not a member of this project",
            )

        if _ROLE_ORDER[member.role] < _ROLE_ORDER[min_role]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires project role >= {min_role.value}",
            )

        return current_user

    return _check
