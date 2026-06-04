from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class DepartmentBase(BaseModel):
    org_id: UUID
    name: str
    code: str
    parent_dept_id: UUID | None = None
    manager_user_id: UUID | None = None


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    parent_dept_id: UUID | None = None
    manager_user_id: UUID | None = None


class DepartmentRead(DepartmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime


class DepartmentTree(DepartmentRead):
    children: list["DepartmentTree"] = []
