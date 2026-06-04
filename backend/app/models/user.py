from sqlalchemy import Column, String, Boolean, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.models.base import UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin
from app.models.enums import UserRoleEnum


class User(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "users"

    org_id = Column(PGUUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    dept_id = Column(PGUUID(as_uuid=True), ForeignKey("departments.id"), nullable=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    avatar_url = Column(String(500), nullable=True)
    employee_code = Column(String(50), nullable=True, unique=True)
    role = Column(Enum(UserRoleEnum, name="userroleenum"), nullable=False, default=UserRoleEnum.EMPLOYEE)
    is_active = Column(Boolean, default=True, nullable=False)

    organization = relationship("Organization", back_populates="users")
    department = relationship("Department", foreign_keys=[dept_id], back_populates="users")
    user_roles = relationship("UserRole", back_populates="user")
    assigned_tasks = relationship("Task", foreign_keys="[Task.assignee_user_id]", back_populates="assignee")
    reported_tasks = relationship("Task", foreign_keys="[Task.reporter_user_id]", back_populates="reporter")
    timesheet_entries = relationship("TimesheetEntry", foreign_keys="[TimesheetEntry.user_id]", back_populates="user")
    approved_timesheets = relationship("TimesheetEntry", foreign_keys="[TimesheetEntry.approved_by]", back_populates="approver")
    project_memberships = relationship("ProjectMember", back_populates="user")
    comments = relationship("TaskComment", back_populates="user")
    attachments = relationship("TaskAttachment", back_populates="user")
