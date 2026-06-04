from sqlalchemy import Column, String, Text, Enum, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.models.base import UUIDPrimaryKeyMixin, CreatedAtMixin
from app.models.enums import SprintStatusEnum


class Sprint(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "sprints"

    project_id = Column(PGUUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    goal = Column(Text, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    status = Column(Enum(SprintStatusEnum, name="sprintstatusenum"), nullable=False, default=SprintStatusEnum.PLANNING)

    project = relationship("Project", back_populates="sprints")
    tasks = relationship("Task", back_populates="sprint")
