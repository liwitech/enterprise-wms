from sqlalchemy import Column, String, Text, Enum, Float, Date, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.models.base import UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin
from app.models.enums import ProjectTypeEnum, ProjectStatusEnum, PriorityEnum


class Project(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "projects"
    __table_args__ = (
        Index("ix_projects_status", "status"),
        Index("ix_projects_org_id", "org_id"),
        Index("ix_projects_dept_id", "dept_id"),
    )

    org_id = Column(PGUUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    dept_id = Column(PGUUID(as_uuid=True), ForeignKey("departments.id"), nullable=True)
    code = Column(String(50), nullable=False, unique=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    project_type = Column(Enum(ProjectTypeEnum, name="projecttypeenum"), nullable=False, default=ProjectTypeEnum.WATERFALL)
    status = Column(Enum(ProjectStatusEnum, name="projectstatusenum"), nullable=False, default=ProjectStatusEnum.PLANNING)
    priority = Column(Enum(PriorityEnum, name="priorityenum"), nullable=False, default=PriorityEnum.MEDIUM)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    progress_percent = Column(Float, default=0.0, nullable=False)
    owner_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_by = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    organization = relationship("Organization", back_populates="projects")
    department = relationship("Department", back_populates="projects")
    owner = relationship("User", foreign_keys=[owner_user_id])
    creator = relationship("User", foreign_keys=[created_by])
    members = relationship("ProjectMember", back_populates="project")
    sprints = relationship("Sprint", back_populates="project")
    milestones = relationship("Milestone", back_populates="project")
    task_groups = relationship("TaskGroup", back_populates="project")
    tasks = relationship("Task", back_populates="project")
    timesheet_entries = relationship("TimesheetEntry", back_populates="project")
