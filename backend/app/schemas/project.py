from uuid import UUID
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict
from app.models.enums import (
    ProjectTypeEnum, ProjectStatusEnum, PriorityEnum,
    ProjectMemberRoleEnum, SprintStatusEnum, MilestoneStatusEnum,
)


# ── Shared ────────────────────────────────────────────────────────────────────

class UserBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    email: str
    avatar_url: str | None = None


# ── Project ───────────────────────────────────────────────────────────────────

class ProjectBase(BaseModel):
    org_id: UUID
    dept_id: UUID | None = None
    code: str
    name: str
    description: str | None = None
    project_type: ProjectTypeEnum = ProjectTypeEnum.WATERFALL
    status: ProjectStatusEnum = ProjectStatusEnum.PLANNING
    priority: PriorityEnum = PriorityEnum.MEDIUM
    start_date: date | None = None
    end_date: date | None = None
    owner_user_id: UUID


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    project_type: ProjectTypeEnum | None = None
    status: ProjectStatusEnum | None = None
    priority: PriorityEnum | None = None
    start_date: date | None = None
    end_date: date | None = None
    owner_user_id: UUID | None = None
    dept_id: UUID | None = None


class ProjectRead(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    progress_percent: float
    created_by: UUID
    created_at: datetime
    updated_at: datetime


# ── Project Member ────────────────────────────────────────────────────────────

class ProjectMemberCreate(BaseModel):
    user_id: UUID
    role: ProjectMemberRoleEnum = ProjectMemberRoleEnum.MEMBER


class ProjectMemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    user_id: UUID
    role: ProjectMemberRoleEnum
    joined_at: datetime


class ProjectMemberReadExtended(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    user_id: UUID
    role: ProjectMemberRoleEnum
    joined_at: datetime
    user: UserBrief


# ── Sprint ────────────────────────────────────────────────────────────────────

class SprintBase(BaseModel):
    project_id: UUID
    name: str
    goal: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: SprintStatusEnum = SprintStatusEnum.PLANNING


class SprintCreate(SprintBase):
    pass


class SprintUpdate(BaseModel):
    name: str | None = None
    goal: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: SprintStatusEnum | None = None


class SprintRead(SprintBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime


# ── Milestone ─────────────────────────────────────────────────────────────────

class MilestoneBase(BaseModel):
    project_id: UUID
    name: str
    due_date: date | None = None
    status: MilestoneStatusEnum = MilestoneStatusEnum.PENDING
    description: str | None = None


class MilestoneCreate(MilestoneBase):
    pass


class MilestoneUpdate(BaseModel):
    name: str | None = None
    due_date: date | None = None
    status: MilestoneStatusEnum | None = None
    description: str | None = None


class MilestoneRead(MilestoneBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime


# ── Project Detail (GET /{id}) ────────────────────────────────────────────────

class ProjectDetailRead(ProjectRead):
    members: list[ProjectMemberReadExtended] = []
    milestones: list[MilestoneRead] = []
    task_summary: dict[str, int] = {}


# ── Dashboard ─────────────────────────────────────────────────────────────────

class MemberWorkload(BaseModel):
    user_id: UUID
    full_name: str
    email: str
    task_count: int
    in_progress: int
    done: int


class RecentActivity(BaseModel):
    message: str
    timestamp: datetime


class ProjectDashboard(BaseModel):
    project_id: UUID
    progress_percent: float
    tasks_by_status: dict[str, int]
    overdue_count: int
    upcoming_milestones: list[MilestoneRead]
    member_workload: list[MemberWorkload]
    recent_activities: list[RecentActivity]
