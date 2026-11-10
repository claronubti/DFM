"""
Repository for SLA incident lifecycle tracking and escalation records.
"""

import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import select, update

from app.db.session import async_session_maker
from app.modules.sla.models.sla_incident import SLAIncident
from app.shared.utils import normalize_iso_utc


class SLAIncidentRepository:
    """Data access layer for SLA incidents, recovery resolution, and lifecycle updates."""

    async def get_active_incident_for_run(self, pipeline_run_id: str) -> Optional[Dict[str, Any]]:
        """Gets active incident for a run if any exists."""
        async with async_session_maker() as session:
            result = await session.execute(
                select(SLAIncident)
                .where(
                    SLAIncident.pipeline_run_id == pipeline_run_id,
                    SLAIncident.status.in_(["ACTIVE", "ESCALATED_L2", "CRITICAL_UNRESOLVED"]),
                )
                .order_by(SLAIncident.failed_at.desc())
                .limit(1)
            )
            inc = result.scalar_one_or_none()
            if not inc:
                return None
            return self._incident_to_dict(inc)

    async def get_incident_for_run(self, pipeline_run_id: str) -> Optional[Dict[str, Any]]:
        """Gets any incident for a run regardless of status (ACTIVE, RESOLVED, etc.)."""
        async with async_session_maker() as session:
            result = await session.execute(
                select(SLAIncident)
                .where(SLAIncident.pipeline_run_id == pipeline_run_id)
                .order_by(SLAIncident.failed_at.desc())
                .limit(1)
            )
            inc = result.scalar_one_or_none()
            if not inc:
                return None
            return self._incident_to_dict(inc)

    async def get_active_incident_for_pipeline(self, workspace_id: str, pipeline_id: str) -> Optional[Dict[str, Any]]:
        """Gets the most recent unresolved incident for a pipeline (ACTIVE, ESCALATED_L2, CRITICAL_UNRESOLVED)."""
        async with async_session_maker() as session:
            result = await session.execute(
                select(SLAIncident)
                .where(
                    SLAIncident.workspace_id == workspace_id,
                    SLAIncident.pipeline_id == pipeline_id,
                    SLAIncident.status.in_(["ACTIVE", "ESCALATED_L2", "CRITICAL_UNRESOLVED"]),
                )
                .order_by(SLAIncident.failed_at.desc())
                .limit(1)
            )
            inc = result.scalar_one_or_none()
            if not inc:
                return None
            return self._incident_to_dict(inc)

    async def resolve_incidents_for_pipeline(
        self,
        workspace_id: Optional[str],
        pipeline_id: str,
        resolved_by: str = "Auto-Resolved (Pipeline Succeeded)"
    ) -> int:
        """Resolves all active/escalated/critical incidents for a specific pipeline when it succeeds."""
        now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
        async with async_session_maker() as session:
            stmt = (
                update(SLAIncident)
                .where(
                    SLAIncident.pipeline_id == pipeline_id,
                    SLAIncident.status.in_(["ACTIVE", "ESCALATED_L2", "CRITICAL_UNRESOLVED"]),
                )
            )
            if workspace_id:
                stmt = stmt.where(SLAIncident.workspace_id == workspace_id)
            stmt = stmt.values(
                status="RESOLVED",
                resolved_at=now_str,
                resolved_by=resolved_by,
                updated_at=now_str,
            )
            result = await session.execute(stmt)
            await session.commit()
            return result.rowcount

    async def get_active_incidents(self, workspace_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retrieves active or escalated SLA incidents, optionally filtered by workspace."""
        async with async_session_maker() as session:
            stmt = select(SLAIncident)
            if workspace_id:
                stmt = stmt.where(SLAIncident.workspace_id == workspace_id)
            stmt = stmt.order_by(SLAIncident.failed_at.desc())

            result = await session.execute(stmt)
            rows = result.scalars().all()
            return [self._incident_to_dict(r) for r in rows]

    async def get_all_unresolved_incidents(self) -> List[Dict[str, Any]]:
        """Returns all ACTIVE, ESCALATED_L2 and CRITICAL_UNRESOLVED incidents across all workspaces."""
        async with async_session_maker() as session:
            result = await session.execute(
                select(SLAIncident)
                .where(SLAIncident.status.in_(["ACTIVE", "ESCALATED_L2", "CRITICAL_UNRESOLVED"]))
                .order_by(SLAIncident.failed_at.desc())
            )
            rows = result.scalars().all()
            return [self._incident_to_dict(r) for r in rows]

    async def create_incident(self, incident: Dict[str, Any]) -> None:
        """Creates or updates an SLA tracking incident for a pipeline execution."""
        async with async_session_maker() as session:
            existing = await session.get(SLAIncident, incident["id"])
            if existing:
                if existing.status != "RESOLVED":
                    existing.pipeline_id = incident.get("pipelineId")
                    existing.pipeline_name = incident.get("pipelineName")
                    existing.pipeline_run_id = incident.get("pipelineRunId")
                    existing.workspace_id = incident.get("workspaceId")
                    existing.status = incident.get("status", "ACTIVE")
                    existing.failed_at = incident.get("failedAt")
                    existing.sla_target_time = incident.get("slaTargetTime")
                    existing.l1_notified_at = incident.get("l1NotifiedAt")
                    existing.l2_escalated_at = incident.get("l2EscalatedAt")
                    existing.resolved_at = incident.get("resolvedAt")
                    existing.resolved_by = incident.get("resolvedBy")
                    existing.error_message = incident.get("errorMessage")
                    existing.updated_at = incident.get("updatedAt")
            else:
                inc = SLAIncident(
                    id=incident["id"],
                    pipeline_id=incident.get("pipelineId"),
                    pipeline_name=incident.get("pipelineName"),
                    pipeline_run_id=incident.get("pipelineRunId"),
                    workspace_id=incident.get("workspaceId"),
                    status=incident.get("status", "ACTIVE"),
                    failed_at=incident.get("failedAt"),
                    sla_target_time=incident.get("slaTargetTime"),
                    l1_notified_at=incident.get("l1NotifiedAt"),
                    l2_escalated_at=incident.get("l2EscalatedAt"),
                    resolved_at=incident.get("resolvedAt"),
                    resolved_by=incident.get("resolvedBy"),
                    error_message=incident.get("errorMessage"),
                    updated_at=incident.get("updatedAt"),
                )
                session.add(inc)
            await session.commit()

    async def get_incident_by_id(self, incident_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single incident by its primary identifier."""
        async with async_session_maker() as session:
            r = await session.get(SLAIncident, incident_id)
            if not r:
                return None
            return self._incident_to_dict(r)

    async def update_incident(self, incident_id: str, updates: Dict[str, Any]) -> None:
        """Updates specific columns of an existing SLA incident record."""
        async with async_session_maker() as session:
            await session.execute(
                update(SLAIncident)
                .where(SLAIncident.id == incident_id)
                .values(**updates)
            )
            await session.commit()

    @staticmethod
    def _incident_to_dict(r: SLAIncident) -> Dict[str, Any]:
        """Helper to convert an SLAIncident ORM row to a dictionary."""
        f_at = normalize_iso_utc(r.failed_at)
        sla_t = normalize_iso_utc(r.sla_target_time)
        res_at = normalize_iso_utc(r.resolved_at)
        l1_not = normalize_iso_utc(r.l1_notified_at)
        l2_esc = normalize_iso_utc(r.l2_escalated_at)
        up_at = normalize_iso_utc(r.updated_at)

        return {
            "id": r.id,
            "pipeline_id": r.pipeline_id,
            "pipelineId": r.pipeline_id,
            "pipeline_name": r.pipeline_name,
            "pipelineName": r.pipeline_name,
            "pipeline_run_id": r.pipeline_run_id,
            "pipelineRunId": r.pipeline_run_id,
            "workspace_id": r.workspace_id,
            "workspaceId": r.workspace_id,
            "status": r.status,
            "failed_at": f_at,
            "failedAt": f_at,
            "sla_target_time": sla_t,
            "slaTargetTime": sla_t,
            "l1_notified_at": l1_not,
            "l1NotifiedAt": l1_not,
            "l2_escalated_at": l2_esc,
            "l2EscalatedAt": l2_esc,
            "resolved_at": res_at,
            "resolvedAt": res_at,
            "resolved_by": r.resolved_by,
            "resolvedBy": r.resolved_by,
            "error_message": r.error_message,
            "errorMessage": r.error_message,
            "updated_at": up_at,
            "updatedAt": up_at,
        }
