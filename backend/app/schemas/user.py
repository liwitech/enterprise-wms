from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr
from app.models.enums import UserRoleEnum, ProjectMemberRoleEnum


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    org_id: UUID
    dept_id: UUID | None = None
    avatar_url: str | None = None
    employee_code: str | None = None
    role: UserRoleEnum = UserRoleEnum.EMPLOYEE


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    full_name: str | None = None
    dept_id: UUID | None = None
    avatar_url: str | None = None
    employee_code: str | None = None
    role: UserRoleEnum | None = None
    is_active: bool | None = None


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserReadPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    email: str
    avatar_url: str | None = None
    role: UserRoleEnum


# ── /auth/me response ─────────────────────────────────────────────────────────

class ProjectRoleInfo(BaseModel):
    project_id: UUID
    role: ProjectMemberRoleEnum


class UserMeRead(BaseModel):
    id: UUID
    email: str
    full_name: str
    org_id: UUID
    dept_id: UUID | None = None
    avatar_url: str | None = None
    employee_code: str | None = None
    role: UserRoleEnum
    is_active: bool
    created_at: datetime
    updated_at: datetime
    permissions: list[str]
    project_roles: list[ProjectRoleInfo] = []
