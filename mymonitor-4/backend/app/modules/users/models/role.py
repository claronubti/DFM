from sqlalchemy import Column, String
from sqlalchemy.orm import relationship

from app.db.base import Base


class Role(Base):
    """SQLAlchemy model representing an RBAC permission role (admin, l1, l2)."""
    __tablename__ = "roles"

    id = Column(String(50), primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(String(500), nullable=True)
    created_at = Column(String(100), nullable=True)

    users = relationship("User", back_populates="role")
