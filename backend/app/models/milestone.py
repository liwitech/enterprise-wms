from sqlalchemy import Column, String, Text, Enum, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.models.base import UUIDPrimaryKeyMixin, CreatedAtMixin
from app.models.enums import MilestoneStatusEnum


class Milestone(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "milestones"

    project_id = Column(PGUUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    due_date = Column(Date, nullable=True)
    status = Column(Enum(MilestoneStatusEnum, name="milestonestatusenum"), nullable=False, default=MilestoneStatusEnum.PENDING)
    description = Column(Text, nullable=True)

    project = relationship("Project", back_populates="milestones")
