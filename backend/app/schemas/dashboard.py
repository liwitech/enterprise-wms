from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel


class ProjectHealth(str, Enum):
    ON_TRACK = "ON_TRACK"
    AT_RISK = "AT_RISK"
    OVERDUE = "OVERDUE"


class AlertType(str, Enum):
    OVERDUE = "OVERDUE"
    DELAYED = "DELAYED"
    UNASSIGNED_TASKS = "UNASSIGNED_TASKS"


class AlertSeverity(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"


class OwnerBrief(BaseModel):
    id: str
    name: str
    avatar_url: Optional[str] = None


class DashboardSummary(BaseModel):
    total_projects: int
    projects_on_track: int
    projects_delayed: int
    projects_overdue: int
    total_tasks_open: int
    tasks_due_soon: int
    total_employees_active: int


class ProjectBrief(BaseModel):
    id: str
    name: str
    dept_name: Optional[str] = None
    owner: OwnerBrief
    status: str
    health: ProjectHealth
    progress_percent: float
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    days_remaining: Optional[int] = None
    tasks_total: int
    tasks_done: int


class Alert(BaseModel):
    project_id: str
    project_name: str
    alert_type: AlertType
    message: str
    severity: AlertSeverity


class WorkloadItem(BaseModel):
    user_id: str
    name: str
    avatar_url: Optional[str] = None
    tasks_assigned: int
    tasks_overdue: int
    capacity_percent: float


class DepartmentBrief(BaseModel):
    id: str
    name: str
    code: str


class ExecutiveDashboardResponse(BaseModel):
    summary: DashboardSummary
    projects: list[ProjectBrief]
    alerts: list[Alert]
    workload: list[WorkloadItem]
    timesheet_pending_count: int
