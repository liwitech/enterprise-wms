from sqlalchemy import Column, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.models.base import UUIDPrimaryKeyMixin, CreatedAtMixin


class TaskComment(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "task_comments"

    task_id = Column(PGUUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False, index=True)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    content = Column(Text, nullable=False)

    task = relationship("Task", back_populates="comments")
    user = relationship("User", back_populates="comments")
