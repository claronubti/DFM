"""
SLA Repositories package.
"""

from app.modules.sla.repositories.sla_config_repo import SLAConfigRepository
from app.modules.sla.repositories.sla_incident_repo import SLAIncidentRepository

__all__ = [
    "SLAConfigRepository",
    "SLAIncidentRepository",
]
