from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, func
from sqlalchemy.orm import declared_attr, relationship


class AuditMixin:
    """SQLAlchemy model mixin adding audit timestamps and user attribution tracking."""
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    @declared_attr
    def created_by_id(cls):
        """Declare foreign key column linking record creation to a User ID."""
        return Column(String(36), ForeignKey("user.id"), nullable=True)

    @declared_attr
    def created_by(cls):
        """Declare eager relationship mapping to the User model."""
        return relationship("User", foreign_keys=[cls.created_by_id], lazy="selectin")


class SoftDeleteMixin:
    """SQLAlchemy model mixin adding soft-deletion flag."""
    is_deleted = Column(Boolean, default=False, nullable=False)
