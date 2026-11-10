"""
Aggregator repository facade for the SLA module.
Combines sub-repositories for SLA configurations and incident management.
"""

from app.modules.sla.repositories.sla_config_repo import SLAConfigRepository
from app.modules.sla.repositories.sla_incident_repo import SLAIncidentRepository


class SLARepository(
    SLAConfigRepository,
    SLAIncidentRepository,
):
    """
    Data access layer for SLA configurations, incident tracking, and escalation audit records.
    Aggregates modular sub-repositories into a unified repository interface.
    """

    def __init__(self):
        super().__init__()


# Global singleton instance for backwards compatibility
sla_repository = SLARepository()

__all__ = [
    "SLARepository",
    "sla_repository",
    "SLAConfigRepository",
    "SLAIncidentRepository",
]
