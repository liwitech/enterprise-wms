import json
from datetime import date, timedelta
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import redis_client
from app.models.enums import (
    MilestoneStatusEnum,
    ProjectMemberRoleEnum,
    TaskStatusEnum,
    UserRoleEnum,
)
from app.models.milestone import Milestone
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.task import Task
from app.models.user import User
from app.schemas.project import (
    MemberWorkload,
    MilestoneRead,
    ProjectCreate,
    ProjectDashboard,
    ProjectMemberCreate,
    ProjectUpdate,
    RecentActivity,
)


class ProjectService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── List ──────────────────────────────────────────────────────────────────

    async def list_projects(
        self,
        user: User,
        *,
        dept_id: Optional[UUID] = None,
        status=None,
        priority=None,
        owner_user_id: Optional[UUID] = None,
        search: Optional[str] = None,
        sort: str = "created_at",
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[Project], int]:
        q = select(Project).where(Project.deleted_at.is_(None))

        if user.role not in (UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN):
            member_subq = select(ProjectMember.project_id).where(
                ProjectMember.user_id == user.id
            )
            q = q.where(Project.id.in_(member_subq))

        if dept_id:
            q = q.where(Project.dept_id == dept_id)
        if status:
            q = q.where(Project.status == status)
        if priority:
            q = q.where(Project.priority == priority)
        if owner_user_id:
            q = q.where(Project.owner_user_id == owner_user_id)
        if search:
            q = q.where(Project.name.ilike(f"%{search}%"))

        if sort == "deadline":
            q = q.order_by(Project.end_date.asc().nullslast())
        elif sort == "progress":
            q = q.order_by(Project.progress_percent.desc())
        else:
            q = q.order_by(Project.created_at.desc())

        total = (
            await self.db.execute(select(func.count()).select_from(q.subquery()))
        ).scalar_one()

        projects = (
            await self.db.execute(q.offset((page - 1) * per_page).limit(per_page))
        ).scalars().all()

        return list(projects), total

    # ── Create ────────────────────────────────────────────────────────────────

    async def create_project(self, data: ProjectCreate, user: User) -> Project:
        project = Project(**data.model_dump(), created_by=user.id)
        self.db.add(project)
        await self.db.flush()
        # Auto-add creator as PM
        self.db.add(
            ProjectMember(
                project_id=project.id,
                user_id=user.id,
                role=ProjectMemberRoleEnum.PM,
            )
        )
        await self.db.commit()
        await self.db.refresh(project)
        return project

    # ── Get Detail ────────────────────────────────────────────────────────────

    async def get_project(self, project_id: UUID, user: User) -> Project:
        await self.check_project_access(project_id, user)
        result = await self.db.execute(
            select(Project)
            .options(
                selectinload(Project.members).selectinload(ProjectMember.user),
                selectinload(Project.milestones),
            )
            .where(Project.id == project_id, Project.deleted_at.is_(None))
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project

    async def get_task_summary(self, project_id: UUID) -> dict[str, int]:
        rows = (
            await self.db.execute(
                select(Task.status, func.count(Task.id).label("cnt"))
                .where(
                    Task.project_id == project_id,
                    Task.deleted_at.is_(None),
                    Task.parent_task_id.is_(None),
                )
                .group_by(Task.status)
            )
        ).all()
        return {row.status.value: row.cnt for row in rows}

    # ── Update ────────────────────────────────────────────────────────────────

    async def update_project(
        self, project_id: UUID, data: ProjectUpdate, user: User
    ) -> Project:
        await self.check_update_permission(project_id, user)
        project = await self._get_or_404(project_id)
        for k, v in data.model_dump(exclude_none=True).items():
            setattr(project, k, v)
        await self.db.commit()
        await self.db.refresh(project)
        return project

    # ── Delete ────────────────────────────────────────────────────────────────

    async def delete_project(self, project_id: UUID, user: User) -> None:
        if user.role not in (UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN):
            raise HTTPException(status_code=403, detail="Only admins can delete projects")
        from datetime import datetime, timezone
        project = await self._get_or_404(project_id)
        project.deleted_at = datetime.now(timezone.utc)
        await self.db.commit()

    # ── Dashboard ─────────────────────────────────────────────────────────────

    async def get_dashboard(self, project_id: UUID, user: User) -> ProjectDashboard:
        await self._get_or_404(project_id)
        await self.check_project_access(project_id, user)

        cached = await redis_client.dashboard_cache_get(str(project_id))
        if cached:
            return ProjectDashboard.model_validate_json(cached)

        dashboard = await self._compute_dashboard(project_id)
        await redis_client.dashboard_cache_set(
            str(project_id), dashboard.model_dump_json()
        )
        return dashboard

    async def _compute_dashboard(self, project_id: UUID) -> ProjectDashboard:
        project = await self._get_or_404(project_id)
        today = date.today()

        # Tasks by status
        tasks_by_status = await self.get_task_summary(project_id)

        # Overdue count
        overdue_count = (
            await self.db.execute(
                select(func.count(Task.id)).where(
                    Task.project_id == project_id,
                    Task.deleted_at.is_(None),
                    Task.due_date < today,
                    Task.status.not_in(
                        [TaskStatusEnum.DONE, TaskStatusEnum.CANCELLED]
                    ),
                )
            )
        ).scalar_one()

        # Upcoming milestones (next 30 days)
        milestones = (
            await self.db.execute(
                select(Milestone)
                .where(
                    Milestone.project_id == project_id,
                    Milestone.status == MilestoneStatusEnum.PENDING,
                    Milestone.due_date >= today,
                    Milestone.due_date <= today + timedelta(days=30),
                )
                .order_by(Milestone.due_date.asc())
                .limit(5)
            )
        ).scalars().all()

        # Member workload (N+1 is acceptable for a cached endpoint)
        members = (
            await self.db.execute(
                select(ProjectMember)
                .options(selectinload(ProjectMember.user))
                .where(ProjectMember.project_id == project_id)
            )
        ).scalars().all()

        workload: list[MemberWorkload] = []
        for member in members:
            rows = (
                await self.db.execute(
                    select(Task.status, func.count(Task.id).label("cnt"))
                    .where(
                        Task.project_id == project_id,
                        Task.assignee_user_id == member.user_id,
                        Task.deleted_at.is_(None),
                    )
                    .group_by(Task.status)
                )
            ).all()
            status_map = {r.status: r.cnt for r in rows}
            workload.append(
                MemberWorkload(
                    user_id=member.user_id,
                    full_name=member.user.full_name,
                    email=member.user.email,
                    task_count=sum(status_map.values()),
                    in_progress=status_map.get(TaskStatusEnum.IN_PROGRESS, 0),
                    done=status_map.get(TaskStatusEnum.DONE, 0),
                )
            )

        # Recent activities (10 most recently updated tasks)
        recent_tasks = (
            await self.db.execute(
                select(Task)
                .options(selectinload(Task.assignee))
                .where(Task.project_id == project_id, Task.deleted_at.is_(None))
                .order_by(Task.updated_at.desc())
                .limit(10)
            )
        ).scalars().all()

        recent_activities = [
            RecentActivity(
                task_id=t.id,
                task_title=t.title,
                status=t.status.value,
                updated_at=t.updated_at,
                assignee_name=t.assignee.full_name if t.assignee else None,
            )
            for t in recent_tasks
        ]

        return ProjectDashboard(
            project_id=project_id,
            progress_percent=project.progress_percent,
            tasks_by_status=tasks_by_status,
            overdue_count=overdue_count,
            upcoming_milestones=[MilestoneRead.model_validate(m) for m in milestones],
            member_workload=workload,
            recent_activities=recent_activities,
        )

    # ── Members ───────────────────────────────────────────────────────────────

    async def add_member(
        self, project_id: UUID, data: ProjectMemberCreate, user: User
    ) -> ProjectMember:
        await self._get_or_404(project_id)
        await self.check_update_permission(project_id, user)

        existing = (
            await self.db.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.user_id == data.user_id,
                )
            )
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=400, detail="User is already a member")

        member = ProjectMember(project_id=project_id, **data.model_dump())
        self.db.add(member)
        await self.db.commit()
        await self.db.refresh(member)
        return member

    async def remove_member(
        self, project_id: UUID, user_id: UUID, user: User
    ) -> None:
        await self._get_or_404(project_id)
        await self.check_update_permission(project_id, user)

        member = (
            await self.db.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.user_id == user_id,
                )
            )
        ).scalar_one_or_none()
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")

        await self.db.delete(member)
        await self.db.commit()

    # ── Permission helpers ────────────────────────────────────────────────────

    async def check_project_access(self, project_id: UUID, user: User) -> None:
        if user.role in (UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN):
            return
        member = (
            await self.db.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if not member:
            raise HTTPException(status_code=403, detail="Not a member of this project")

    async def check_update_permission(self, project_id: UUID, user: User) -> None:
        if user.role in (UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN):
            return
        member = (
            await self.db.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.user_id == user.id,
                    ProjectMember.role == ProjectMemberRoleEnum.PM,
                )
            )
        ).scalar_one_or_none()
        if not member:
            raise HTTPException(
                status_code=403,
                detail="Only project managers or admins can perform this action",
            )

    async def _get_or_404(self, project_id: UUID) -> Project:
        project = (
            await self.db.execute(
                select(Project).where(
                    Project.id == project_id, Project.deleted_at.is_(None)
                )
            )
        ).scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project
