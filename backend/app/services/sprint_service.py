from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import ProjectMemberRoleEnum, SprintStatusEnum, UserRoleEnum
from app.models.project_member import ProjectMember
from app.models.sprint import Sprint
from app.models.user import User
from app.schemas.project import SprintCreate


class SprintService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_sprints(self, project_id: UUID) -> list[Sprint]:
        return (
            await self.db.execute(
                select(Sprint)
                .where(Sprint.project_id == project_id)
                .order_by(Sprint.created_at.desc())
            )
        ).scalars().all()

    async def create_sprint(
        self, project_id: UUID, data: SprintCreate, user: User
    ) -> Sprint:
        await self._check_pm(project_id, user)
        sprint = Sprint(project_id=project_id, **data.model_dump(exclude={"project_id"}))
        self.db.add(sprint)
        await self.db.commit()
        await self.db.refresh(sprint)
        return sprint

    async def activate_sprint(
        self, project_id: UUID, sprint_id: UUID, user: User
    ) -> Sprint:
        await self._check_pm(project_id, user)

        sprint = (
            await self.db.execute(
                select(Sprint).where(
                    Sprint.id == sprint_id, Sprint.project_id == project_id
                )
            )
        ).scalar_one_or_none()
        if not sprint:
            raise HTTPException(status_code=404, detail="Sprint not found")
        if sprint.status == SprintStatusEnum.COMPLETED:
            raise HTTPException(status_code=400, detail="Cannot activate a completed sprint")

        # Deactivate any currently active sprint in the same project
        await self.db.execute(
            update(Sprint)
            .where(
                Sprint.project_id == project_id,
                Sprint.id != sprint_id,
                Sprint.status == SprintStatusEnum.ACTIVE,
            )
            .values(status=SprintStatusEnum.PLANNING)
        )

        sprint.status = SprintStatusEnum.ACTIVE
        await self.db.commit()
        await self.db.refresh(sprint)
        return sprint

    async def _check_pm(self, project_id: UUID, user: User) -> None:
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
                detail="Only project managers or admins can manage sprints",
            )
