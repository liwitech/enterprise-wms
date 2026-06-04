from sqlalchemy import Column, String, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.models.base import UUIDPrimaryKeyMixin, CreatedAtMixin


class TaskGroup(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "task_groups"

    project_id = Column(PGUUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    order_index = Column(Integer, default=0, nullable=False)
    color = Column(String(20), nullable=True)

    project = relationship("Project", back_populates="task_groups")
    tasks = relationship("Task", back_populates="task_group")
