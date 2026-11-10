"""
Core SLA domain service managing thresholds, incident resolution, and assignment lookups.
"""

import asyncio
import datetime
import logging
from typing import Any, Dict, List, Optional

from app.modules.sla.repository import sla_repository
from app.modules.sla.schema import SlaConfigPayload, TestEmailRequest
from app.modules.sla.services.alert_service import AlertService, alert_service
from app.modules.websocket.connection_manager import connection_manager
from app.shared.constants import DEFAULT_SLA1_MINUTES, DEFAULT_SLA2_MINUTES

logger = logging.getLogger("fabric_monitor.sla.services.core")


class SlaService:
    """Service providing high-level operations for SLA thresholds, incidents, and dispatches."""

    def __init__(self, alert_mgr: AlertService):
        self._alert = alert_mgr

    async def get_sla_config(self, workspace_id: str, pipeline_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve SLA configuration and email assignees for a pipeline."""
        return await sla_repository.get_sla_config(workspace_id, pipeline_id)

    async def save_sla_config(self, workspace_id: str, pipeline_id: str, payload: SlaConfigPayload, assigned_by: str = "") -> Dict[str, Any]:
        """Save SLA 1 and SLA 2 thresholds and assignee contact details for a pipeline."""
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        sla1 = payload.sla1Minutes if payload.sla1Minutes is not None else (payload.slaMinutes or DEFAULT_SLA1_MINUTES)
        sla2 = payload.sla2Minutes if payload.sla2Minutes is not None else (payload.slaMinutes or DEFAULT_SLA2_MINUTES)
        l1_email = (payload.l1Email or "").strip()
        l2_email = (payload.l2Email or "").strip()
        l1_name = (payload.l1Name or "").strip()
        l2_name = (payload.l2Name or "").strip()
        pipeline_name = (payload.pipelineName or "").strip()
        domain = (payload.domain or "").strip()

        await sla_repository.save_sla_config(
            workspace_id=workspace_id,
            pipeline_id=pipeline_id,
            l1_email=l1_email,
            l2_email=l2_email,
            l1_name=l1_name,
            l2_name=l2_name,
            sla_minutes=sla1,
            updated_at=now_iso,
            sla1_minutes=sla1,
            sla2_minutes=sla2,
            pipeline_name=pipeline_name,
            assigned_by=assigned_by,
            domain=domain,
        )

        try:
            from app.modules.users.service import users_service
            await users_service.ensure_assignment_users(l1_email, l2_email)
        except Exception as exc:
            logger.warning(f"Could not record user roles for SLA config: {exc}")

        asyncio.create_task(self._alert.rearm_and_notify_l1(
            workspace_id=workspace_id,
            pipeline_id=pipeline_id,
            l1_email=l1_email,
            sla_minutes=sla1,
        ))

        return {
            "status": "success",
            "pipelineId": pipeline_id,
            "l1Email": l1_email,
            "l1Name": l1_name,
            "l2Email": l2_email,
            "l2Name": l2_name,
            "slaMinutes": sla1,
            "sla1Minutes": sla1,
            "sla2Minutes": sla2,
            "domain": domain,
        }

    async def get_workspace_incidents(self, workspace_id: str) -> List[Dict[str, Any]]:
        """Retrieve active and escalated SLA incidents for a specific workspace."""
        return await sla_repository.get_active_incidents(workspace_id)

    async def get_all_incidents(self) -> List[Dict[str, Any]]:
        """Retrieve all unresolved SLA incidents across the tenant."""
        return await sla_repository.get_active_incidents()

    async def resolve_incident(self, incident_id: str, resolved_by: str = "Operator", workspace_id: Optional[str] = None) -> Dict[str, Any]:
        """Mark an incident as resolved and broadcast update over WebSocket."""
        result = await self._alert.resolve_incident(incident_id, resolved_by=resolved_by)
        effective_ws_id = workspace_id or (result.get("workspaceId") if isinstance(result, dict) else None)
        if effective_ws_id:
            await connection_manager.broadcast_to_workspace(effective_ws_id, {
                "type": "INCIDENT_RESOLVED",
                "workspaceId": effective_ws_id,
                "incidentId": incident_id,
                "pipelineId": result.get("pipelineId") if isinstance(result, dict) else None,
                "resolvedBy": resolved_by,
                "resolvedAt": result.get("resolvedAt") if isinstance(result, dict) else None,
            })
        return result or {}

    async def send_test_email(self, payload: TestEmailRequest) -> bool:
        """Trigger a test verification email via Azure Function."""
        return await self._alert.send_test_email(
            to_email=payload.email.strip(),
            role=payload.role,
            pipeline_name=payload.pipelineName or "Data Pipeline",
        )

    async def notify_pipeline_recovered(self, workspace_id: str, pipeline_id: str, pipeline_name: str, run_id: str) -> None:
        """Handles pipeline recovery and resolves active incidents."""
        await self._alert.notify_pipeline_recovered(
            workspace_id=workspace_id,
            pipeline_id=pipeline_id,
            pipeline_name=pipeline_name,
            run_id=run_id,
        )


sla_service = SlaService(alert_mgr=alert_service)

__all__ = [
    "SlaService",
    "sla_service",
]
