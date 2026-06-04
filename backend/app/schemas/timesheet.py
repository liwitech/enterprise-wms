from decimal import Decimal
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.enums import TimesheetStatusEnum


# ── Nested ────────────────────────────────────────────────────────────────────

class UserBriefForTimesheet(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    full_name: str
    email: str


class ProjectBriefForTimesheet(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    code: str


# ── Entry CRUD ────────────────────────────────────────────────────────────────

class TimesheetEntryCreate(BaseModel):
    task_id: UUID
    work_date: date
    hours_logged: Decimal
    description: str | None = None

    @field_validator("hours_logged")
    @classmethod
    def validate_hours(cls, v: Decimal) -> Decimal:
        if v <= 0 or v > 16:
            raise ValueError("hours_logged must be > 0 and <= 16")
        return v


class TimesheetEntryUpdate(BaseModel):
    work_date: date | None = None
    hours_logged: Decimal | None = None
    description: str | None = None

    @field_validator("hours_logged")
    @classmethod
    def validate_hours(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and (v <= 0 or v > 16):
            raise ValueError("hours_logged must be > 0 and <= 16")
        return v


class TimesheetEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    task_id: UUID
    project_id: UUID
    work_date: date
    hours_logged: Decimal
    description: str | None
    status: TimesheetStatusEnum
    submitted_at: datetime | None
    approved_by: UUID | None
    approved_at: datetime | None
    reject_reason: str | None
    created_at: datetime


class TimesheetEntryExtended(TimesheetEntryRead):
    user: UserBriefForTimesheet | None = None
    project: ProjectBriefForTimesheet | None = None


# ── Batch actions ─────────────────────────────────────────────────────────────

class TimesheetSubmitRequest(BaseModel):
    entry_ids: list[UUID]


class TimesheetRejectRequest(BaseModel):
    reject_reason: str


class TimesheetBatchApproveRequest(BaseModel):
    entry_ids: list[UUID]


# ── Summary ───────────────────────────────────────────────────────────────────

class SummaryByProject(BaseModel):
    project_id: UUID
    project_name: str
    total_hours: Decimal


class SummaryByDay(BaseModel):
    work_date: date
    total_hours: Decimal


class SummaryByWeek(BaseModel):
    week_start: date
    total_hours: Decimal


class TimesheetSummaryResponse(BaseModel):
    by_project: list[SummaryByProject]
    by_day: list[SummaryByDay]
    by_week: list[SummaryByWeek]


# ── Weekly snapshot (reports) ─────────────────────────────────────────────────

class WeeklySummaryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    project_id: UUID
    week_start: date
    total_hours: Decimal
    entry_count: int
    user: UserBriefForTimesheet | None = None
    project: ProjectBriefForTimesheet | None = None
