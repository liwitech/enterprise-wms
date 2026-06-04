from uuid import UUID
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict
from app.models.enums import TaskStatusEnum, PriorityEnum


# ── Shared ────────────────────────────────────────────────────────────────────

class UserBriefForTask(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    email: str
    avatar_url: str | None = None


# ── Task Group ────────────────────────────────────────────────────────────────

class TaskGroupBase(BaseModel):
    project_id: UUID
    name: str
    order_index: int = 0
    color: str | None = None


class TaskGroupCreate(TaskGroupBase):
    pass


class TaskGroupUpdate(BaseModel):
    name: str | None = None
    order_index: int | None = None
    color: str | None = None


class TaskGroupRead(TaskGroupBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime


# ── Task ──────────────────────────────────────────────────────────────────────

class TaskBase(BaseModel):
    project_id: UUID
    task_group_id: UUID | None = None
    sprint_id: UUID | None = None
    parent_task_id: UUID | None = None
    title: str
    description: str | None = None
    status: TaskStatusEnum = TaskStatusEnum.TODO
    priority: PriorityEnum = PriorityEnum.MEDIUM
    assignee_user_id: UUID | None = None
    reporter_user_id: UUID | None = None
    start_date: date | None = None
    due_date: date | None = None
    estimated_hours: float | None = None
    tags: list[str] | None = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    task_group_id: UUID | None = None
    sprint_id: UUID | None = None
    title: str | None = None
    description: str | None = None
    status: TaskStatusEnum | None = None
    priority: PriorityEnum | None = None
    assignee_user_id: UUID | None = None
    start_date: date | None = None
    due_date: date | None = None
    estimated_hours: float | None = None
    tags: list[str] | None = None


class TaskRead(TaskBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    actual_hours: float | None
    created_at: datetime
    updated_at: datetime


class TaskStatusUpdate(BaseModel):
    status: TaskStatusEnum


# ── Task Comment ──────────────────────────────────────────────────────────────

class TaskCommentCreate(BaseModel):
    content: str


class TaskCommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    task_id: UUID
    user_id: UUID
    content: str
    created_at: datetime


class TaskCommentReadExtended(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    task_id: UUID
    user_id: UUID
    content: str
    created_at: datetime
    user: UserBriefForTask


# ── Task Attachment ───────────────────────────────────────────────────────────

class TaskAttachmentCreate(BaseModel):
    task_id: UUID
    file_name: str
    file_url: str
    file_size: int | None = None


class TaskAttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    task_id: UUID
    user_id: UUID
    file_name: str
    file_url: str
    file_size: int | None
    created_at: datetime


# ── Task Detail (GET /{task_id}) ──────────────────────────────────────────────

class TimesheetSummaryBrief(BaseModel):
    total_hours: float = 0.0
    entry_count: int = 0


class TaskDetailRead(TaskRead):
    subtasks: list[TaskRead] = []
    comments: list[TaskCommentReadExtended] = []
    attachments: list[TaskAttachmentRead] = []
    timesheet_summary: TimesheetSummaryBrief = TimesheetSummaryBrief()
