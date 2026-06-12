from sqlalchemy import Boolean, Column, String
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.models.base import UUIDPrimaryKeyMixin, CreatedAtMixin


class Organization(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "organizations"

    name = Column(String(255), nullable=False)
    code = Column(String(50), unique=True, nullable=False, index=True)
    logo_url = Column(String(500), nullable=True)

    # SSO / WSO2 configuration
    sso_enabled = Column(Boolean, nullable=False, default=False)
    sso_provider_url = Column(String(500), nullable=True)
    sso_client_id = Column(String(255), nullable=True)
    sso_client_secret = Column(String(500), nullable=True)
    sso_redirect_uri = Column(String(500), nullable=True)
    sso_verify_ssl = Column(Boolean, nullable=False, default=False)

    departments = relationship("Department", back_populates="organization", lazy="select")
    users = relationship("User", back_populates="organization", lazy="select")
    projects = relationship("Project", back_populates="organization", lazy="select")
