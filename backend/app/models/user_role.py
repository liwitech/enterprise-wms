from sqlalchemy import Column, String, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.models.base import UUIDPrimaryKeyMixin, CreatedAtMixin
from app.models.enums import ScopeTypeEnum


class UserRole(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "user_roles"

    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    role_type = Column(String(50), nullable=False)
    scope_type = Column(Enum(ScopeTypeEnum, name="scopetypeenum"), nullable=False)
    scope_id = Column(PGUUID(as_uuid=True), nullable=False)

    user = relationship("User", back_populates="user_roles")
