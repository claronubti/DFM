from typing import Optional
from pydantic import BaseModel


class SlaConfigPayload(BaseModel):
    """Payload schema for saving L1/L2 escalation personnel and SLA1/SLA2 threshold targets."""
    pipelineName: Optional[str] = None
    l1Email: str = ""
    l1Name: Optional[str] = None
    l2Email: str = ""
    l2Name: Optional[str] = None
    slaMinutes: Optional[int] = 30
    sla1Minutes: Optional[int] = None
    sla2Minutes: Optional[int] = None
    domain: Optional[str] = None
    enabled: Optional[bool] = True
    assignedBy: Optional[str] = None


class IncidentResolveRequest(BaseModel):
    """Payload schema for operator-initiated SLA incident resolution."""
    resolvedBy: Optional[str] = "Operator"


class TestEmailRequest(BaseModel):
    """Payload schema for verifying SMTP alert delivery configuration."""
    email: str
    role: str = "L1"
    pipelineName: Optional[str] = None
