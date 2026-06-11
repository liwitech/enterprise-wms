from uuid import UUID
from pydantic import BaseModel, EmailStr
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
