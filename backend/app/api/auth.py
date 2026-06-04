from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.redis_client import (
    check_rate_limit,
    revoke_refresh_token,
    store_refresh_token,
    verify_refresh_token,
)
from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.models.enums import UserRoleEnum, ProjectMemberRoleEnum
from app.models.project_member import ProjectMember
from app.models.user import User
from app.schemas.user import UserMeRead, ProjectRoleInfo

router = APIRouter(prefix="/auth", tags=["auth"])

# ── Permission map ────────────────────────────────────────────────────────────

_PERMISSIONS: dict[UserRoleEnum, list[str]] = {
    UserRoleEnum.SUPER_ADMIN: [
        "org:manage", "user:manage", "dept:manage",
        "project:manage", "project:view_all",
        "task:manage", "timesheet:approve", "timesheet:view_all",
    ],
    UserRoleEnum.ADMIN: [
        "user:manage", "dept:manage",
        "project:view_all", "task:manage", "timesheet:view_all",
    ],
    UserRoleEnum.MANAGER: [
        "project:create", "project:manage_own",
        "task:manage", "timesheet:approve",
    ],
    UserRoleEnum.EMPLOYEE: [
        "project:view_assigned", "task:create",
        "task:update_own", "timesheet:create",
    ],
}


# ── Schemas ───────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenPairResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenPairResponse)
async def login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again in 1 minute.",
            headers={"Retry-After": "60"},
        )

    result = await db.execute(
        select(User).where(User.email == body.email, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is inactive",
        )

    access_token = create_access_token(str(user.id))
    refresh_token = await store_refresh_token(str(user.id))

    return TokenPairResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh(body: RefreshRequest):
    user_id = await verify_refresh_token(body.refresh_token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )
    return AccessTokenResponse(access_token=create_access_token(user_id))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    body: RefreshRequest,
    _: User = Depends(get_current_user),
):
    await revoke_refresh_token(body.refresh_token)


@router.get("/me", response_model=UserMeRead)
async def me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectMember).where(ProjectMember.user_id == current_user.id)
    )
    memberships = result.scalars().all()

    project_roles = [
        ProjectRoleInfo(project_id=m.project_id, role=m.role)
        for m in memberships
    ]

    return UserMeRead(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        org_id=current_user.org_id,
        dept_id=current_user.dept_id,
        avatar_url=current_user.avatar_url,
        employee_code=current_user.employee_code,
        role=current_user.role,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
        updated_at=current_user.updated_at,
        permissions=_PERMISSIONS.get(current_user.role, []),
        project_roles=project_roles,
    )
