from sqlalchemy import Column, Text, Date, Numeric, Enum, DateTime, ForeignKey, Index, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.models.base import UUIDPrimaryKeyMixin, CreatedAtMixin
from app.models.enums import TimesheetStatusEnum


class TimesheetEntry(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "timesheet_entries"
    __table_args__ = (
        Index("ix_timesheet_user_date", "user_id", "work_date"),
        Index("ix_timesheet_project_id", "project_id"),
        CheckConstraint("hours_logged > 0 AND hours_logged <= 16", name="ck_hours_logged_range"),
    )

    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    task_id = Column(PGUUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False, index=True)
    project_id = Column(PGUUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    work_date = Column(Date, nullable=False)
    hours_logged = Column(Numeric(4, 2), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(TimesheetStatusEnum, name="timesheetstatusenum"), nullable=False, default=TimesheetStatusEnum.DRAFT)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    approved_by = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    reject_reason = Column(Text, nullable=True)

    user = relationship("User", foreign_keys=[user_id], back_populates="timesheet_entries")
    task = relationship("Task", back_populates="timesheet_entries")
    project = relationship("Project", back_populates="timesheet_entries")
    approver = relationship("User", foreign_keys=[approved_by], back_populates="approved_timesheets")
