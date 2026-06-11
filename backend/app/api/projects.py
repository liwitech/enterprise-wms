from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.enums import PriorityEnum, ProjectStatusEnum, UserRoleEnum
from app.models.user import User
from app.schemas.common import ApiResponse, ok, paginated
from app.schemas.project import (
    MilestoneRead,
    ProjectCreate,
    ProjectDashboard,
    ProjectDetailRead,
    ProjectMemberCreate,
    ProjectMemberRead,
    ProjectRead,
    ProjectUpdate,
    SprintCreate,
    SprintRead,
)
from app.services.project_service import ProjectService
from app.services.sprint_service import SprintService

router = APIRouter(prefix="/projects", tags=["projects"])

_AUTH = {401: {"description": "Chưa xác thực"}}
_AUTH_403 = {401: {"description": "Chưa xác thực"}, 403: {"description": "Không có quyền"}}
_NOT_FOUND = {404: {"description": "Dự án không tồn tại"}}


# ── Projects ──────────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=ApiResponse[list[ProjectRead]],
    summary="Danh sách dự án",
    description=(
        "Lấy danh sách dự án có phân trang. Admin/Super-admin thấy tất cả; "
        "Manager/Employee chỉ thấy dự án mình tham gia."
    ),
    responses={**_AUTH, 422: {"description": "Tham số không hợp lệ"}},
)
async def list_projects(
    dept_id: Optional[UUID] = None,
    status: Optional[ProjectStatusEnum] = None,
    priority: Optional[PriorityEnum] = None,
    owner_user_id: Optional[UUID] = None,
    search: Optional[str] = None,
    sort: str = Query("created_at", pattern="^(deadline|progress|created_at)$"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = ProjectService(db)
    projects, total = await svc.list_projects(
        user,
        dept_id=dept_id,
        status=status,
        priority=priority,
        owner_user_id=owner_user_id,
        search=search,
        sort=sort,
        page=page,
        per_page=per_page,
    )
    return paginated(
        [ProjectRead.model_validate(p) for p in projects], page, per_page, total
    )


@router.post(
    "",
    response_model=ApiResponse[ProjectRead],
    status_code=status.HTTP_201_CREATED,
    summary="Tạo dự án mới",
    description=(
        "Tạo dự án và tự động thêm người tạo vào danh sách thành viên với vai trò **PM**. "
        "Yêu cầu role: SUPER_ADMIN, ADMIN, hoặc MANAGER."
    ),
    responses={
        **_AUTH_403,
        400: {"description": "Mã dự án (code) đã tồn tại"},
        422: {"description": "Dữ liệu không hợp lệ"},
    },
)
async def create_project(
    data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(
        require_role(UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN, UserRoleEnum.MANAGER)
    ),
):
    svc = ProjectService(db)
    project = await svc.create_project(data, user)
    return ok(ProjectRead.model_validate(project), message="Project created")


@router.get(
    "/{project_id}",
    response_model=ApiResponse[ProjectDetailRead],
    summary="Chi tiết dự án",
    description="Trả về thông tin đầy đủ: thành viên, milestone, tóm tắt task theo trạng thái.",
    responses={**_AUTH_403, **_NOT_FOUND},
)
async def get_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = ProjectService(db)
    project = await svc.get_project(project_id, user)
    task_summary = await svc.get_task_summary(project_id)
    detail = ProjectDetailRead.model_validate(project)
    detail.task_summary = task_summary
    return ok(detail)


@router.put(
    "/{project_id}",
    response_model=ApiResponse[ProjectRead],
    summary="Cập nhật dự án",
    description=(
        "Cập nhật thông tin dự án. Chỉ PM, Admin, Super-admin mới có quyền. "
        "Tất cả trường đều optional (PATCH semantics)."
    ),
    responses={**_AUTH_403, **_NOT_FOUND, 422: {"description": "Dữ liệu không hợp lệ"}},
)
async def update_project(
    project_id: UUID,
    data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = ProjectService(db)
    project = await svc.update_project(project_id, data, user)
    return ok(ProjectRead.model_validate(project))


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Xóa dự án (soft delete)",
    description="Đánh dấu dự án là đã xóa (soft delete). Chỉ SUPER_ADMIN và ADMIN.",
    responses={**_AUTH_403, **_NOT_FOUND},
)
async def delete_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(
        require_role(UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN)
    ),
):
    svc = ProjectService(db)
    await svc.delete_project(project_id, user)


@router.get(
    "/{project_id}/dashboard",
    response_model=ApiResponse[ProjectDashboard],
    summary="Dashboard dự án",
    description=(
        "Trả về metrics tổng hợp: tiến độ, task theo trạng thái, milestone sắp đến hạn, "
        "khối lượng công việc thành viên, hoạt động gần đây. Kết quả được cache 5 phút."
    ),
    responses={**_AUTH_403, **_NOT_FOUND},
)
async def get_dashboard(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = ProjectService(db)
    dashboard = await svc.get_dashboard(project_id, user)
    return ok(dashboard)


# ── Members ───────────────────────────────────────────────────────────────────

@router.post(
    "/{project_id}/members",
    response_model=ApiResponse[ProjectMemberRead],
    status_code=status.HTTP_201_CREATED,
    summary="Thêm thành viên",
    description="Thêm người dùng vào dự án với vai trò PM, MEMBER, hoặc VIEWER. Chỉ PM/Admin.",
    responses={
        **_AUTH_403,
        **_NOT_FOUND,
        400: {"description": "Người dùng đã là thành viên"},
    },
)
async def add_member(
    project_id: UUID,
    data: ProjectMemberCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = ProjectService(db)
    member = await svc.add_member(project_id, data, user)
    return ok(ProjectMemberRead.model_validate(member), message="Member added")


@router.delete(
    "/{project_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Xóa thành viên",
    description="Xóa người dùng khỏi dự án. Chỉ PM/Admin. Không thể xóa chính mình nếu là PM duy nhất.",
    responses={**_AUTH_403, **_NOT_FOUND},
)
async def remove_member(
    project_id: UUID,
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = ProjectService(db)
    await svc.remove_member(project_id, user_id, user)


# ── Sprints ───────────────────────────────────────────────────────────────────

@router.get(
    "/{project_id}/sprints",
    response_model=ApiResponse[list[SprintRead]],
    summary="Danh sách sprint",
    description="Lấy tất cả sprint của dự án, sắp xếp theo ngày tạo.",
    responses={**_AUTH_403, **_NOT_FOUND},
)
async def list_sprints(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ProjectService(db).check_project_access(project_id, user)
    sprints = await SprintService(db).list_sprints(project_id)
    return ok([SprintRead.model_validate(s) for s in sprints])


@router.post(
    "/{project_id}/sprints",
    response_model=ApiResponse[SprintRead],
    status_code=status.HTTP_201_CREATED,
    summary="Tạo sprint",
    description="Tạo sprint mới với trạng thái PLANNING. Chỉ PM/Admin.",
    responses={**_AUTH_403, **_NOT_FOUND, 422: {"description": "Dữ liệu không hợp lệ"}},
)
async def create_sprint(
    project_id: UUID,
    data: SprintCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sprint = await SprintService(db).create_sprint(project_id, data, user)
    return ok(SprintRead.model_validate(sprint), message="Sprint created")


@router.put(
    "/{project_id}/sprints/{sprint_id}/activate",
    response_model=ApiResponse[SprintRead],
    summary="Kích hoạt sprint",
    description=(
        "Chuyển sprint sang ACTIVE. Tự động chuyển sprint ACTIVE hiện tại về COMPLETED. "
        "Mỗi dự án chỉ có một sprint ACTIVE tại một thời điểm."
    ),
    responses={**_AUTH_403, 404: {"description": "Sprint hoặc dự án không tồn tại"}},
)
async def activate_sprint(
    project_id: UUID,
    sprint_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sprint = await SprintService(db).activate_sprint(project_id, sprint_id, user)
    return ok(SprintRead.model_validate(sprint))
