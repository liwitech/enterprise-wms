from sqlalchemy import Column, String, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.models.base import UUIDPrimaryKeyMixin, CreatedAtMixin


class TaskAttachment(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "task_attachments"

    task_id = Column(PGUUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False, index=True)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_url = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=True)

    task = relationship("Task", back_populates="attachments")
    user = relationship("User", back_populates="attachments")
