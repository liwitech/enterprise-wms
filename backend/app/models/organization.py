from sqlalchemy import Column, String
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.models.base import UUIDPrimaryKeyMixin, CreatedAtMixin


class Organization(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "organizations"

    name = Column(String(255), nullable=False)
    code = Column(String(50), unique=True, nullable=False, index=True)
    logo_url = Column(String(500), nullable=True)

    departments = relationship("Department", back_populates="organization", lazy="select")
    users = relationship("User", back_populates="organization", lazy="select")
    projects = relationship("Project", back_populates="organization", lazy="select")
