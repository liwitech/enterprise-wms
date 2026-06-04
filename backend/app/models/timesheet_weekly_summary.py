import uuid
from sqlalchemy import Column, Date, Integer, Numeric, ForeignKey, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.models.base import CreatedAtMixin


class TimesheetWeeklySummary(CreatedAtMixin, Base):
    __tablename__ = "timesheet_weekly_summaries"
    __table_args__ = (
        UniqueConstraint("user_id", "project_id", "week_start", name="uq_weekly_summary"),
        Index("ix_weekly_summary_user_id", "user_id"),
        Index("ix_weekly_summary_project_id", "project_id"),
        Index("ix_weekly_summary_week_start", "week_start"),
    )

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    project_id = Column(PGUUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    week_start = Column(Date, nullable=False)
    total_hours = Column(Numeric(6, 2), nullable=False, default=0)
    entry_count = Column(Integer, nullable=False, default=0)

    user = relationship("User", foreign_keys=[user_id])
    project = relationship("Project", foreign_keys=[project_id])
