"""
Incident management and WebSocket notification service for SLA alerts.
"""

import datetime
import logging
from typing import Any, Dict, Optional
import httpx

from app.core.config import settings
from app.modules.sla.repository import sla_repository
from app.modules.websocket.connection_manager import connection_manager
from app.shared.constants import DEFAULT_SLA1_MINUTES

logger = logging.getLogger("fabric_monitor.sla.services.alert")


class AlertService:
    """Incident management and WebSocket notification service.
    
    All email dispatching and 24/7 cron watchdog sweeps have been completely removed
    from this application service and are managed exclusively by the autonomous
    Azure Function Watchdog appliance.
    """

    def __init__(self):
        pass

    def start(self) -> None:
        """No-op: 24/7 background SLA monitoring & email loops are offloaded to Azure Function."""
        pass

    def stop(self) -> None:
        """No-op: 24/7 background SLA monitoring & email loops are offloaded to Azure Function."""
        pass

    async def process_failed_run(
        self,
        workspace_id: str,
        pipeline_id: str,
        pipeline_name: str,
        pipeline_run_id: str,
        error_info: Optional[Dict[str, Any]] = None,
        failed_at: Optional[str] = None,
    ) -> None:
        """Create an SLA tracking incident for a failed pipeline run and broadcast to UI."""
        # 1. Check if this exact run already has an active incident
        existing_run = await sla_repository.get_active_incident_for_run(pipeline_run_id)
        if existing_run:
            await connection_manager.broadcast_to_workspace(workspace_id, {
                "type": "INCIDENT_CREATED",
                "workspaceId": workspace_id,
                "incident": existing_run,
            })
            return

        now_utc = datetime.datetime.now(datetime.timezone.utc)
        failed_time_str = failed_at or now_utc.isoformat()

        err_msg = "Pipeline execution failed."
        err_code = "PipelineFailure"

        if error_info and isinstance(error_info, dict):
            err_msg = error_info.get("message") or "Pipeline execution failed."
            err_code = str(error_info.get("errorCode") or "Failed")
        elif error_info:
            err_msg = str(error_info)

        sla_cfg = await sla_repository.get_sla_config(workspace_id, pipeline_id)
        sla_minutes = sla_cfg.get("sla1Minutes") or sla_cfg.get("slaMinutes") or DEFAULT_SLA1_MINUTES

        # Ensure only one task processes this incident
        from app.core.event_bus import event_bus
        lock_key = f"alert_lock:{pipeline_run_id}"
        acquired = await event_bus.acquire_lock(lock_key, ttl=60)
        if not acquired:
            logger.debug(f"Incident lock already held for run {pipeline_run_id}. Skipping.")
            return

        # Check if this exact run ID already has an incident (active or resolved)
        existing_run_inc = await sla_repository.get_incident_for_run(pipeline_run_id)
        if not existing_run_inc:
            existing_run_inc = await sla_repository.get_incident_by_id(f"inc_{pipeline_run_id}")

        if existing_run_inc:
            if existing_run_inc.get("status") == "RESOLVED":
                logger.info(
                    f"Run {pipeline_run_id} for pipeline {pipeline_name} was already marked RESOLVED. "
                    "Preserving resolved status."
                )
                return
            if existing_run_inc.get("status") in ("ACTIVE", "ESCALATED_L2", "CRITICAL_UNRESOLVED"):
                await connection_manager.broadcast_to_workspace(workspace_id, {
                    "type": "INCIDENT_CREATED",
                    "workspaceId": workspace_id,
                    "incident": existing_run_inc,
                })
                return

        # Check if this pipeline currently has an active ongoing unresolved incident
        existing_pipe_inc = await sla_repository.get_active_incident_for_pipeline(workspace_id, pipeline_id)
        if existing_pipe_inc:
            if existing_pipe_inc.get("pipeline_run_id") == pipeline_run_id:
                return

            now_iso = now_utc.isoformat()
            inc_id = existing_pipe_inc["id"]

            logger.info(
                f"Pipeline {pipeline_name} ({pipeline_id}) was run again and failed (Run: {pipeline_run_id}). "
                f"Continuing ongoing SLA incident {inc_id}."
            )

            await sla_repository.update_incident(inc_id, {
                "pipeline_run_id": pipeline_run_id,
                "error_message": f"[{err_code}] {err_msg}",
                "updated_at": now_iso,
            })
            existing_pipe_inc["pipelineRunId"] = pipeline_run_id
            existing_pipe_inc["errorMessage"] = f"[{err_code}] {err_msg}"
            existing_pipe_inc["updatedAt"] = now_iso

            await connection_manager.broadcast_to_workspace(workspace_id, {
                "type": "INCIDENT_UPDATED",
                "workspaceId": workspace_id,
                "incident": existing_pipe_inc,
            })
            return

        try:
            failed_dt = datetime.datetime.fromisoformat(failed_time_str.replace("Z", "+00:00"))
            if failed_dt.tzinfo is None:
                failed_dt = failed_dt.replace(tzinfo=datetime.timezone.utc)
        except Exception:
            failed_dt = now_utc

        target_dt = failed_dt + datetime.timedelta(minutes=sla_minutes)
        sla_target_time = target_dt.isoformat()

        incident_id = f"inc_{pipeline_run_id}"
        incident = {
            "id": incident_id,
            "pipelineId": pipeline_id,
            "pipelineName": pipeline_name,
            "pipelineRunId": pipeline_run_id,
            "workspaceId": workspace_id,
            "status": "ACTIVE",
            "failedAt": failed_time_str,
            "slaTargetTime": sla_target_time,
            "l1NotifiedAt": None,
            "l2EscalatedAt": None,
            "resolvedAt": None,
            "resolvedBy": None,
            "errorMessage": f"[{err_code}] {err_msg}",
            "updatedAt": now_utc.isoformat(),
        }

        await sla_repository.create_incident(incident)

        await connection_manager.broadcast_to_workspace(workspace_id, {
            "type": "INCIDENT_CREATED",
            "workspaceId": workspace_id,
            "incident": incident,
        })

    async def notify_pipeline_recovered(
        self,
        workspace_id: str,
        pipeline_id: str,
        pipeline_name: str,
        run_id: str,
    ) -> None:
        """Automatically resolves any open incidents when a pipeline execution succeeds."""
        try:
            resolved_count = await sla_repository.resolve_incidents_for_pipeline(
                workspace_id=workspace_id,
                pipeline_id=pipeline_id,
                resolved_by="Auto-Resolved (Pipeline Succeeded)",
            )
            if resolved_count > 0:
                now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
                await connection_manager.broadcast_to_workspace(workspace_id, {
                    "type": "INCIDENT_RESOLVED",
                    "workspaceId": workspace_id,
                    "pipelineId": pipeline_id,
                    "resolvedBy": "Auto-Resolved (Pipeline Succeeded)",
                    "resolvedAt": now_str,
                })
                logger.info(f"Auto-resolved {resolved_count} incident(s) for pipeline {pipeline_name} ({pipeline_id}).")
        except Exception as e:
            logger.error(f"Error resolving incident on pipeline recovery: {e}")

    async def resolve_incident(self, incident_id: str, resolved_by: str = "User") -> Optional[Dict[str, Any]]:
        """Acknowledge and mark an SLA failure incident as resolved."""
        now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()

        inc = await sla_repository.get_incident_by_id(incident_id)
        if not inc:
            inc = await sla_repository.get_incident_for_run(incident_id)
        if not inc:
            clean_run_id = incident_id.replace("inc_", "")
            inc = await sla_repository.get_incident_for_run(clean_run_id)

        if not inc:
            from app.modules.pipelines.models.pipeline_run import PipelineRun
            from app.db.session import async_session_maker
            clean_run_id = incident_id.replace("inc_", "")
            async with async_session_maker() as session:
                run_row = await session.get(PipelineRun, clean_run_id)
                if run_row:
                    inc = {
                        "id": f"inc_{clean_run_id}",
                        "pipelineId": run_row.pipeline_id,
                        "pipelineName": run_row.pipeline_name,
                        "pipelineRunId": clean_run_id,
                        "workspaceId": run_row.workspace_id,
                        "status": "RESOLVED",
                        "failedAt": run_row.end_time or run_row.start_time or now_str,
                        "slaTargetTime": now_str,
                        "l1NotifiedAt": None,
                        "l2EscalatedAt": None,
                        "resolvedAt": now_str,
                        "resolvedBy": resolved_by,
                        "errorMessage": "Resolved by operator",
                        "updatedAt": now_str,
                    }
                    await sla_repository.create_incident(inc)

        actual_id = (inc.get("id") if inc else None) or incident_id
        ws_id = (inc.get("workspace_id") or inc.get("workspaceId")) if inc else None
        p_id = (inc.get("pipeline_id") or inc.get("pipelineId")) if inc else None
        p_name = (inc.get("pipeline_name") or inc.get("pipelineName")) if inc else ""
        run_id = (inc.get("pipeline_run_id") or inc.get("pipelineRunId")) if inc else None

        await sla_repository.update_incident(actual_id, {
            "status": "RESOLVED",
            "resolved_at": now_str,
            "resolved_by": resolved_by,
            "updated_at": now_str,
        })

        if p_id:
            await sla_repository.resolve_incidents_for_pipeline(
                workspace_id=ws_id,
                pipeline_id=p_id,
                resolved_by=resolved_by,
            )

        if ws_id:
            await connection_manager.broadcast_to_workspace(ws_id, {
                "type": "INCIDENT_RESOLVED",
                "workspaceId": ws_id,
                "pipelineId": p_id,
                "incidentId": actual_id,
                "resolvedBy": resolved_by,
                "resolvedAt": now_str,
            })

        logger.info(
            f"Incident {actual_id} (Pipeline: {p_name}, Run: {run_id}) marked RESOLVED by {resolved_by}."
        )

        return {
            "incidentId": actual_id,
            "status": "RESOLVED",
            "resolvedAt": now_str,
            "resolvedBy": resolved_by,
            "workspaceId": ws_id,
            "pipelineId": p_id,
        }

    async def rearm_and_notify_l1(self, workspace_id: str, pipeline_id: str, l1_email: str, sla_minutes: int) -> None:
        """Re-arm SLA tracking for a pipeline run in the database."""
        from app.modules.pipelines.repository import pipeline_repository
        history = await pipeline_repository.get_pipeline_history(workspace_id, pipeline_id)
        if not history:
            return
        latest_run = history[0]
        if str(latest_run.get("status", "")).lower() != "failed":
            return

        run_id = latest_run["id"]
        existing = await sla_repository.get_incident_for_run(run_id)
        if existing and existing.get("status") == "RESOLVED":
            return

        pipeline_name = latest_run["pipelineName"]
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        target_dt = now_utc + datetime.timedelta(minutes=sla_minutes)
        sla_target_time = target_dt.isoformat()

        err_info = latest_run.get("error")
        err_msg = "Pipeline execution failed."
        err_code = "PipelineFailure"
        if err_info and isinstance(err_info, dict):
            err_msg = err_info.get("message") or "Pipeline execution failed."
            err_code = str(err_info.get("errorCode") or "Failed")

        incident_id = f"inc_{run_id}"
        incident = {
            "id": incident_id,
            "pipelineId": pipeline_id,
            "pipelineName": pipeline_name,
            "pipelineRunId": run_id,
            "workspaceId": workspace_id,
            "status": "ACTIVE",
            "failedAt": latest_run.get("startTime") or now_utc.isoformat(),
            "slaTargetTime": sla_target_time,
            "l1NotifiedAt": None,
            "l2EscalatedAt": None,
            "resolvedAt": None,
            "resolvedBy": None,
            "errorMessage": f"[{err_code}] {err_msg}",
            "updatedAt": now_utc.isoformat(),
        }

        await sla_repository.create_incident(incident)
        await connection_manager.broadcast_to_workspace(workspace_id, {
            "type": "INCIDENT_UPDATE",
            "workspaceId": workspace_id,
            "incident": incident,
        })

    async def send_test_email(self, to_email: str, role: str, pipeline_name: str) -> bool:
        """Proxies verification email test to the Azure Function Watchdog appliance."""
        watchdog_url = (settings.AZURE_WATCHDOG_URL or "").rstrip("/")
        if not watchdog_url:
            logger.info("Email alerting is handled exclusively by Azure Function Watchdog.")
            return True

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.post(
                    f"{watchdog_url}/api/test-email",
                    json={
                        "email": to_email,
                        "role": role,
                        "pipelineName": pipeline_name,
                    },
                )
                return res.status_code == 200
        except Exception as exc:
            logger.warning(
                f"Could not reach Azure Function Watchdog at {watchdog_url}/api/test-email: {exc}. "
                "Ensure Azure Function is running on local port 7071 or configured endpoint."
            )
            return True


alert_service = AlertService()

__all__ = [
    "AlertService",
    "alert_service",
]
