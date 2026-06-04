from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_validator


class OrganizationBase(BaseModel):
    name: str
    code: str
    logo_url: str | None = None


class OrganizationCreate(OrganizationBase):
    pass


class OrganizationUpdate(BaseModel):
    name: str | None = None
    logo_url: str | None = None


class OrganizationRead(OrganizationBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
