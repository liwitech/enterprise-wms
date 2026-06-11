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

_AUTH = {401: {"description": "Chưa xác thực"}}
_AUTH_403 = {401: {"description": "Chưa xác thực"}, 403: {"description": "Không có quyền"}}
_NOT_FOUND = {404: {"description": "Task không tồn tại"}}


# ── Tasks ─────────────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=ApiResponse[list[TaskRead]],
    summary="Danh sách task",
    description=(
        "Lấy danh sách task có phân trang và bộ lọc đa chiều. "
        "Employee chỉ thấy task trong dự án mình tham gia."
    ),
    responses={**_AUTH, 422: {"description": "Tham số không hợp lệ"}},
)
async def list_tasks(
    project_id: Optional[UUID] = None,
    assignee_user_id: Optional[UUID] = None,
    status: Optional[TaskStatusEnum] = None,
    priority: Optional[PriorityEnum] = None,
    sprint_id: Optional[UUID] = None,
    due_date_from: Optional[date] = None,
    due_date_to: Optional[date] = None,
    is_overdue: Optional[bool] = None,
    include_subtasks: bool = False,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
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
        include_subtasks=include_subtasks,
        page=page,
        per_page=per_page,
    )
    return paginated([TaskRead.model_validate(t) for t in tasks], page, per_page, total)


@router.post(
    "",
    response_model=ApiResponse[TaskRead],
    status_code=status.HTTP_201_CREATED,
    summary="Tạo task",
    description=(
        "Tạo task mới trong dự án. Người tạo tự động trở thành `reporter`. "
        "Người tạo phải là thành viên của dự án."
    ),
    responses={
        **_AUTH_403,
        404: {"description": "Dự án không tồn tại"},
        422: {"description": "Dữ liệu không hợp lệ"},
    },
)
async def create_task(
    data: TaskCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = await TaskService(db).create_task(data, user)
    return ok(TaskRead.model_validate(task), message="Task created")


@router.get(
    "/{task_id}",
    response_model=ApiResponse[TaskDetailRead],
    summary="Chi tiết task",
    description=(
        "Trả về task kèm subtasks, bình luận, đính kèm và tóm tắt giờ chấm công. "
        "Chỉ thành viên dự án mới xem được."
    ),
    responses={**_AUTH_403, **_NOT_FOUND},
)
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


@router.put(
    "/{task_id}",
    response_model=ApiResponse[TaskRead],
    summary="Cập nhật task",
    description="Cập nhật thông tin task. Thành viên dự án có thể cập nhật; PATCH semantics.",
    responses={**_AUTH_403, **_NOT_FOUND, 422: {"description": "Dữ liệu không hợp lệ"}},
)
async def update_task(
    task_id: UUID,
    data: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = await TaskService(db).update_task(task_id, data, user)
    return ok(TaskRead.model_validate(task))


@router.patch(
    "/{task_id}/status",
    response_model=ApiResponse[TaskRead],
    summary="Cập nhật trạng thái task (Kanban move)",
    description=(
        "Thay đổi trạng thái task: TODO → IN_PROGRESS → IN_REVIEW → DONE / CANCELLED. "
        "Tự động phát sự kiện Redis pub/sub và vô hiệu cache dashboard."
    ),
    responses={
        **_AUTH_403,
        **_NOT_FOUND,
        422: {"description": "Trạng thái không hợp lệ"},
    },
)
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
    summary="Thêm bình luận",
    description="Thêm bình luận vào task. Chỉ thành viên dự án.",
    responses={
        **_AUTH_403,
        **_NOT_FOUND,
        422: {"description": "Nội dung không được để trống"},
    },
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
    summary="Danh sách bình luận",
    description="Lấy bình luận của task, sắp xếp mới nhất trước.",
    responses={**_AUTH_403, **_NOT_FOUND},
)
async def list_comments(
    task_id: UUID,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
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
