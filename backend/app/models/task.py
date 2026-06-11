import uuid
from sqlalchemy import Boolean, Column, Integer, String, Text, Enum, Float, Date, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.models.base import TimestampMixin, SoftDeleteMixin
from app.models.enums import TaskStatusEnum, PriorityEnum


class Task(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_project_status", "project_id", "status"),
        Index("ix_tasks_parent_task_id", "parent_task_id"),
        Index("ix_tasks_assignee_user_id", "assignee_user_id"),
    )

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_code = Column(String(20), nullable=False, unique=True)
    project_id = Column(PGUUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    task_group_id = Column(PGUUID(as_uuid=True), ForeignKey("task_groups.id"), nullable=True)
    sprint_id = Column(PGUUID(as_uuid=True), ForeignKey("sprints.id"), nullable=True)
    parent_task_id = Column(PGUUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(TaskStatusEnum, name="taskstatusenum"), nullable=False, default=TaskStatusEnum.TODO)
    priority = Column(Enum(PriorityEnum, name="priorityenum", create_type=False), nullable=False, default=PriorityEnum.MEDIUM)
    assignee_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    reporter_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    start_date = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)
    estimated_hours = Column(Float, nullable=True)
    actual_hours = Column(Float, default=0.0, nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    tags = Column(JSONB, nullable=True)

    # Recurrence
    is_recurring = Column(Boolean, nullable=False, default=False, server_default='false')
    recurrence_type = Column(String(20), nullable=True)       # DAILY | WEEKLY | MONTHLY | YEARLY
    recurrence_interval = Column(Integer, nullable=True, default=1)
    recurrence_days = Column(JSONB, nullable=True)             # [0..6] weekday list for WEEKLY
    recurrence_end_type = Column(String(10), nullable=True)    # NEVER | COUNT | UNTIL
    recurrence_count = Column(Integer, nullable=True)
    recurrence_until = Column(Date, nullable=True)
    recurrence_parent_id = Column(PGUUID(as_uuid=True), ForeignKey('tasks.id', ondelete='SET NULL'), nullable=True)

    project = relationship("Project", back_populates="tasks")
    task_group = relationship("TaskGroup", back_populates="tasks")
    sprint = relationship("Sprint", back_populates="tasks")
    parent = relationship(
        "Task",
        back_populates="subtasks",
        foreign_keys=[parent_task_id],
        remote_side=[id],
    )
    subtasks = relationship("Task", back_populates="parent", foreign_keys=[parent_task_id])
    assignee = relationship("User", foreign_keys=[assignee_user_id], back_populates="assigned_tasks")
    reporter = relationship("User", foreign_keys=[reporter_user_id], back_populates="reported_tasks")
    comments = relationship("TaskComment", back_populates="task")
    attachments = relationship("TaskAttachment", back_populates="task")
    timesheet_entries = relationship("TimesheetEntry", back_populates="task")
