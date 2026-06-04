import uuid
from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.models.base import CreatedAtMixin


class Department(CreatedAtMixin, Base):
    __tablename__ = "departments"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(PGUUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    parent_dept_id = Column(PGUUID(as_uuid=True), ForeignKey("departments.id"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), nullable=False)
    manager_user_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", use_alter=True, name="fk_dept_manager"),
        nullable=True,
    )

    organization = relationship("Organization", back_populates="departments")
    parent = relationship(
        "Department",
        back_populates="children",
        foreign_keys=[parent_dept_id],
        remote_side=[id],
    )
    children = relationship("Department", back_populates="parent", foreign_keys=[parent_dept_id])
    manager = relationship("User", foreign_keys=[manager_user_id], lazy="select")
    users = relationship("User", foreign_keys="[User.dept_id]", back_populates="department", lazy="select")
    projects = relationship("Project", back_populates="department", lazy="select")
