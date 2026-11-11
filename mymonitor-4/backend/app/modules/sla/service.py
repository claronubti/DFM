"""
Aggregator domain service facade for SLA management and incident alerts.
Re-exports AlertService and SlaService.
"""

from app.modules.sla.services.alert_service import AlertService, alert_service
from app.modules.sla.services.sla_core_service import SlaService, sla_service

__all__ = [
    "AlertService",
    "alert_service",
    "SlaService",
    "sla_service",
]
