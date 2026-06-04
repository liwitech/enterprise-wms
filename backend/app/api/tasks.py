from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.enums import PriorityEnum, TaskStatusEnum
from app.models.user import User
from app.schemas.common import ApiResponse, ok, paginated
from app.schemas.task import (
    TaskCommentCreate,
    TaskCommentReadExtended,
    TaskCreate,
    TaskDetailRead,
    TaskRead,
    TaskStatusUpdate,
    TaskUpdate,
)
from app.services.task_service import TaskService

router = APIRouter(prefix="/tasks", tags=["tasks"])


# ── Tasks ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=ApiResponse[list[TaskRead]])
async def list_tasks(
    project_id: Optional[UUID] = None,
    assignee_user_id: Optional[UUID] = None,
    status: Optional[TaskStatusEnum] = None,
    priority: Optional[PriorityEnum] = None,
    sprint_id: Optional[UUID] = None,
    due_date_from: Optional[date] = None,
    due_date_to: Optional[date] = None,
    is_overdue: Optional[bool] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = TaskService(db)
    tasks, total = await svc.list_tasks(
        user,
        project_id=project_id,
        assignee_user_id=assignee_user_id,
        status=status,
        priority=priority,
        sprint_id=sprint_id,
        due_date_from=due_date_from,
        due_date_to=due_date_to,
        is_overdue=is_overdue,
        page=page,
        per_page=per_page,
    )
    return paginated([TaskRead.model_validate(t) for t in tasks], page, per_page, total)


@router.post(
    "",
    response_model=ApiResponse[TaskRead],
    status_code=status.HTTP_201_CREATED,
)
async def create_task(
    data: TaskCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = await TaskService(db).create_task(data, user)
    return ok(TaskRead.model_validate(task), message="Task created")


@router.get("/{task_id}", response_model=ApiResponse[TaskDetailRead])
async def get_task(
    task_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = TaskService(db)
    task = await svc.get_task(task_id, user)
    timesheet_summary = await svc.get_timesheet_summary(task_id)
    detail = TaskDetailRead.model_validate(task)
    detail.timesheet_summary = timesheet_summary
    return ok(detail)


@router.put("/{task_id}", response_model=ApiResponse[TaskRead])
async def update_task(
    task_id: UUID,
    data: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = await TaskService(db).update_task(task_id, data, user)
    return ok(TaskRead.model_validate(task))


@router.patch("/{task_id}/status", response_model=ApiResponse[TaskRead])
async def update_task_status(
    task_id: UUID,
    data: TaskStatusUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = await TaskService(db).update_task_status(task_id, data, user)
    return ok(TaskRead.model_validate(task))


# ── Comments ──────────────────────────────────────────────────────────────────

@router.post(
    "/{task_id}/comments",
    response_model=ApiResponse[TaskCommentReadExtended],
    status_code=status.HTTP_201_CREATED,
)
async def add_comment(
    task_id: UUID,
    data: TaskCommentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    comment = await TaskService(db).add_comment(task_id, data.content, user)
    return ok(TaskCommentReadExtended.model_validate(comment), message="Comment added")


@router.get(
    "/{task_id}/comments",
    response_model=ApiResponse[list[TaskCommentReadExtended]],
)
async def list_comments(
    task_id: UUID,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = TaskService(db)
    comments, total = await svc.list_comments(task_id, user, page=page, per_page=per_page)
    return paginated(
        [TaskCommentReadExtended.model_validate(c) for c in comments],
        page,
        per_page,
        total,
    )
