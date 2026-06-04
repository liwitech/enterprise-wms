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


# ── Projects ──────────────────────────────────────────────────────────────────

@router.get("", response_model=ApiResponse[list[ProjectRead]])
async def list_projects(
    dept_id: Optional[UUID] = None,
    status: Optional[ProjectStatusEnum] = None,
    priority: Optional[PriorityEnum] = None,
    owner_user_id: Optional[UUID] = None,
    search: Optional[str] = None,
    sort: str = Query("created_at", pattern="^(deadline|progress|created_at)$"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
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


@router.get("/{project_id}", response_model=ApiResponse[ProjectDetailRead])
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


@router.put("/{project_id}", response_model=ApiResponse[ProjectRead])
async def update_project(
    project_id: UUID,
    data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = ProjectService(db)
    project = await svc.update_project(project_id, data, user)
    return ok(ProjectRead.model_validate(project))


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(
        require_role(UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN)
    ),
):
    svc = ProjectService(db)
    await svc.delete_project(project_id, user)


@router.get("/{project_id}/dashboard", response_model=ApiResponse[ProjectDashboard])
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

@router.get("/{project_id}/sprints", response_model=ApiResponse[list[SprintRead]])
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
)
async def activate_sprint(
    project_id: UUID,
    sprint_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sprint = await SprintService(db).activate_sprint(project_id, sprint_id, user)
    return ok(SprintRead.model_validate(sprint))
