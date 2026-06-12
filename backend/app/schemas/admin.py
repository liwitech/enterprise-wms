from uuid import UUID
from pydantic import BaseModel, EmailStr, HttpUrl
from app.models.enums import UserRoleEnum, DeptTypeEnum


class AdminDeptCreate(BaseModel):
    name: str
    code: str
    dept_type: DeptTypeEnum = DeptTypeEnum.PHONG
    parent_dept_id: UUID | None = None
    manager_user_id: UUID | None = None


class AdminDeptUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    dept_type: DeptTypeEnum | None = None
    parent_dept_id: UUID | None = None
    manager_user_id: UUID | None = None


class AdminUserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    dept_id: UUID | None = None
    employee_code: str | None = None
    role: UserRoleEnum = UserRoleEnum.EMPLOYEE


class AdminUserUpdate(BaseModel):
    full_name: str | None = None
    dept_id: UUID | None = None
    employee_code: str | None = None
    role: UserRoleEnum | None = None
    is_active: bool | None = None
    password: str | None = None


class SsoConfigRead(BaseModel):
    sso_enabled: bool
    sso_provider_url: str | None
    sso_client_id: str | None
    sso_redirect_uri: str | None
    sso_verify_ssl: bool
    # client_secret is intentionally omitted from read response

    model_config = {"from_attributes": True}


class SsoConfigUpdate(BaseModel):
    sso_enabled: bool | None = None
    sso_provider_url: str | None = None
    sso_client_id: str | None = None
    sso_client_secret: str | None = None
    sso_redirect_uri: str | None = None
    sso_verify_ssl: bool | None = None
