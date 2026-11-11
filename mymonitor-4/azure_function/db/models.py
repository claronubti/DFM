from sqlalchemy import Column, Integer, String, Text
from .base import Base


class SLAIncident(Base):
    """SQLAlchemy model tracking live lifecycle states, escalation milestones, and resolution for SLA incidents."""
    __tablename__ = "sla_incidents"

    id = Column(String(255), primary_key=True)
    pipeline_id = Column(String(255), index=True, nullable=True)
    pipeline_name = Column(String(255), nullable=True)
    pipeline_run_id = Column(String(255), nullable=True)
    workspace_id = Column(String(255), index=True, nullable=True)
    status = Column(String(50), index=True, default="ACTIVE")
    failed_at = Column(String(100), nullable=True)
    sla_target_time = Column(String(100), nullable=True)
    l1_notified_at = Column(String(100), nullable=True)
    l2_escalated_at = Column(String(100), nullable=True)
    resolved_at = Column(String(100), nullable=True)
    resolved_by = Column(String(255), nullable=True)
    error_message = Column(Text, nullable=True)
    updated_at = Column(String(100), nullable=True)


class SLAConfig(Base):
    """SQLAlchemy model persisting SLA escalation configuration and assigned personnel per pipeline."""
    __tablename__ = "sla_configs"

    pipeline_id = Column(String(255), primary_key=True)
    workspace_id = Column(String(255), index=True, nullable=True)
    pipeline_name = Column(String(255), nullable=True)
    l1_email = Column(String(255), nullable=True)
    l2_email = Column(String(255), nullable=True)
    l1_name = Column(String(255), nullable=True)
    l2_name = Column(String(255), nullable=True)
    sla_minutes = Column(Integer, default=30)
    sla1_minutes = Column(Integer, default=30)
    sla2_minutes = Column(Integer, default=60)
    domain = Column(String(255), nullable=True)
    assigned_by = Column(String(255), nullable=True)
    updated_at = Column(String(100), nullable=True)
