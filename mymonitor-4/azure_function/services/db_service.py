import datetime
import logging
from typing import Any, Dict, List, Optional
from sqlalchemy import select, update
from core.config import settings
from db.models import SLAConfig, SLAIncident
from db.session import async_session_maker

logger = logging.getLogger("azure_watchdog.db_service")


class DatabaseService:
    """
    Asynchronous database operations for incident tracking and SLA configurations
    against the shared Azure SQL Database instance.
    """

    async def get_configured_sla_pipelines(self) -> List[Dict[str, Any]]:
        """
        Fetches all pipelines with L1 or L2 support personnel configured in sla_configs table.
        Only returns records where either l1_email or l2_email is non-empty.
        """
        try:
            async with async_session_maker() as session:
                stmt = select(SLAConfig).where(
                    (
                        (SLAConfig.l1_email != None) & (SLAConfig.l1_email != "")
                    ) | (
                        (SLAConfig.l2_email != None) & (SLAConfig.l2_email != "")
                    )
                )
                res = await session.execute(stmt)
                rows = res.scalars().all()
                results = []
                for cfg in rows:
                    if not cfg.pipeline_id or not cfg.workspace_id:
                        continue
                    results.append({
                        "pipelineId": cfg.pipeline_id,
                        "workspaceId": cfg.workspace_id,
                        "pipelineName": cfg.pipeline_name or "Data Pipeline",
                        "l1Email": (cfg.l1_email or "").strip(),
                        "l2Email": (cfg.l2_email or "").strip(),
                        "l1Name": (cfg.l1_name or "").strip(),
                        "l2Name": (cfg.l2_name or "").strip(),
                        "sla1Minutes": cfg.sla1_minutes or cfg.sla_minutes or settings.DEFAULT_SLA1_MINUTES,
                        "sla2Minutes": cfg.sla2_minutes or settings.DEFAULT_SLA2_MINUTES,
                        "domain": cfg.domain or "",
                    })
                return results
        except Exception as e:
            logger.error(f"Error querying configured SLA pipelines from database: {e}")
            return []

    async def get_sla_config(self, workspace_id: str, pipeline_id: str) -> Dict[str, Any]:
        """
        Fetches SLA thresholds and assigned L1/L2 emails for a pipeline from sla_configs table.
        Falls back to default settings if no custom SLA configuration is found.
        """
        try:
            async with async_session_maker() as session:
                stmt = select(SLAConfig).where(SLAConfig.pipeline_id == pipeline_id)
                res = await session.execute(stmt)
                cfg = res.scalar_one_or_none()
                if cfg:
                    return {
                        "pipelineId": cfg.pipeline_id,
                        "workspaceId": cfg.workspace_id,
                        "pipelineName": cfg.pipeline_name,
                        "l1Email": (cfg.l1_email or "").strip(),
                        "l2Email": (cfg.l2_email or "").strip(),
                        "sla1Minutes": cfg.sla1_minutes or cfg.sla_minutes or settings.DEFAULT_SLA1_MINUTES,
                        "sla2Minutes": cfg.sla2_minutes or settings.DEFAULT_SLA2_MINUTES,
                    }
        except Exception as e:
            logger.warning(f"Could not load SLA config from database: {e}")

        return {
            "pipelineId": pipeline_id,
            "workspaceId": workspace_id,
            "l1Email": "",
            "l2Email": "",
            "sla1Minutes": settings.DEFAULT_SLA1_MINUTES,
            "sla2Minutes": settings.DEFAULT_SLA2_MINUTES,
        }

    async def get_incident_for_run(self, pipeline_run_id: str) -> Optional[Dict[str, Any]]:
        """
        Queries if an SLA incident already exists for a specific pipeline execution run.
        Checks both pipeline_run_id field and standardized id format (inc_{pipeline_run_id}).
        """
        try:
            async with async_session_maker() as session:
                stmt = select(SLAIncident).where(
                    (SLAIncident.pipeline_run_id == pipeline_run_id) |
                    (SLAIncident.id == f"inc_{pipeline_run_id}")
                )
                res = await session.execute(stmt)
                inc = res.scalar_one_or_none()
                if inc:
                    return self.convert_incident_to_dict(inc)
        except Exception as e:
            logger.warning(f"Error querying incident for run {pipeline_run_id}: {e}")
        return None

    async def get_active_incident_for_pipeline(self, workspace_id: str, pipeline_id: str) -> Optional[Dict[str, Any]]:
        """
        Queries for any active or escalated unresolved SLA incident for a pipeline.
        Matches by pipeline_id where status is not RESOLVED.
        """
        try:
            async with async_session_maker() as session:
                stmt = select(SLAIncident).where(
                    SLAIncident.pipeline_id == pipeline_id,
                    SLAIncident.status != "RESOLVED",
                )
                res = await session.execute(stmt)
                inc = res.scalar_one_or_none()
                if inc:
                    return self.convert_incident_to_dict(inc)
        except Exception as e:
            logger.warning(f"Error querying active incident for pipeline {pipeline_id}: {e}")
        return None

    async def create_incident(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Inserts a new SLA incident into the database and commits the transaction.
        """
        try:
            async with async_session_maker() as session:
                inc = SLAIncident(
                    id=data["id"],
                    pipeline_id=data.get("pipelineId"),
                    pipeline_name=data.get("pipelineName"),
                    pipeline_run_id=data.get("pipelineRunId"),
                    workspace_id=data.get("workspaceId"),
                    status=data.get("status", "ACTIVE"),
                    failed_at=data.get("failedAt"),
                    sla_target_time=data.get("slaTargetTime"),
                    l1_notified_at=data.get("l1NotifiedAt"),
                    l2_escalated_at=data.get("l2EscalatedAt"),
                    resolved_at=data.get("resolvedAt"),
                    resolved_by=data.get("resolvedBy"),
                    error_message=data.get("errorMessage"),
                    updated_at=data.get("updatedAt"),
                )
                session.add(inc)
                await session.commit()
                return self.convert_incident_to_dict(inc)
        except Exception as e:
            logger.error(f"Failed to create incident {data.get('id')} in database: {e}")
            return None

    async def update_incident(self, incident_id: str, updates: Dict[str, Any]) -> bool:
        """
        Updates fields of an existing incident record by its incident ID.
        Supports both snake_case and camelCase field keys.
        """
        try:
            async with async_session_maker() as session:
                db_updates = {}
                key_mapping = {
                    "pipeline_run_id": "pipeline_run_id",
                    "pipelineRunId": "pipeline_run_id",
                    "status": "status",
                    "error_message": "error_message",
                    "errorMessage": "error_message",
                    "updated_at": "updated_at",
                    "updatedAt": "updated_at",
                    "l1_notified_at": "l1_notified_at",
                    "l1NotifiedAt": "l1_notified_at",
                    "l2_escalated_at": "l2_escalated_at",
                    "l2EscalatedAt": "l2_escalated_at",
                    "sla_target_time": "sla_target_time",
                    "slaTargetTime": "sla_target_time",
                    "failed_at": "failed_at",
                    "failedAt": "failed_at",
                    "resolved_at": "resolved_at",
                    "resolvedAt": "resolved_at",
                    "resolved_by": "resolved_by",
                    "resolvedBy": "resolved_by",
                }
                for k, v in updates.items():
                    if k in key_mapping:
                        db_updates[getattr(SLAIncident, key_mapping[k])] = v

                if db_updates:
                    stmt = update(SLAIncident).where(SLAIncident.id == incident_id).values(db_updates)
                    await session.execute(stmt)
                    await session.commit()
                    return True
        except Exception as e:
            logger.error(f"Failed to update incident {incident_id}: {e}")
        return False

    async def resolve_incidents_for_pipeline(
        self, workspace_id: Optional[str], pipeline_id: str, resolved_by: str = "Autonomous Watchdog"
    ) -> int:
        """
        Marks all active/escalated unresolved incidents for a pipeline as RESOLVED.
        Returns the number of incidents marked resolved.
        """
        now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
        try:
            async with async_session_maker() as session:
                conditions = [
                    SLAIncident.pipeline_id == pipeline_id,
                    SLAIncident.status != "RESOLVED",
                ]
                if workspace_id:
                    conditions.append(SLAIncident.workspace_id == workspace_id)

                query = select(SLAIncident).where(*conditions)
                res = await session.execute(query)
                unresolved = res.scalars().all()
                count = len(unresolved)
                if count > 0:
                    stmt = (
                        update(SLAIncident)
                        .where(*conditions)
                        .values({
                            SLAIncident.status: "RESOLVED",
                            SLAIncident.resolved_at: now_str,
                            SLAIncident.resolved_by: resolved_by,
                            SLAIncident.updated_at: now_str,
                        })
                    )
                    await session.execute(stmt)
                    await session.commit()
                return count
        except Exception as e:
            logger.error(f"Failed to auto-resolve incidents for pipeline {pipeline_id}: {e}")
            return 0

    async def get_all_unresolved_incidents(self) -> List[Dict[str, Any]]:
        """
        Returns all incidents currently in ACTIVE, ESCALATED_L2, or CRITICAL_UNRESOLVED state.
        Used by the watchdog engine to evaluate SLA deadlines and recurring reminders.
        """
        try:
            async with async_session_maker() as session:
                stmt = select(SLAIncident).where(SLAIncident.status != "RESOLVED")
                res = await session.execute(stmt)
                incidents = res.scalars().all()
                return [self.convert_incident_to_dict(i) for i in incidents]
        except Exception as e:
            logger.warning(f"Error retrieving unresolved incidents: {e}")
            return []

    async def get_watchdog_incident_summary(self) -> Dict[str, int]:
        """Returns counts of active failures, manually resolved failures, alert milestones, and pending loop reminder mails."""
        summary = {
            "activeFailures": 0,
            "manuallyResolved": 0,
            "l1AlertsTotal": 0,
            "l2AlertsTotal": 0,
            "sla2BreachesTotal": 0,
            "loopMailsPending": 0,
        }
        try:
            async with async_session_maker() as session:
                res = await session.execute(select(SLAIncident))
                all_incidents = res.scalars().all()
                for inc in all_incidents:
                    st = (inc.status or "").upper()
                    res_by = str(inc.resolved_by or "")
                    if st in ("ACTIVE", "ESCALATED_L2", "CRITICAL_UNRESOLVED"):
                        summary["activeFailures"] += 1
                    elif st == "RESOLVED":
                        if res_by and not res_by.startswith("Auto-Resolved"):
                            summary["manuallyResolved"] += 1

                    if inc.l1_notified_at:
                        summary["l1AlertsTotal"] += 1
                    if inc.l2_escalated_at:
                        summary["l2AlertsTotal"] += 1
                    if st == "CRITICAL_UNRESOLVED":
                        summary["sla2BreachesTotal"] += 1
                        summary["loopMailsPending"] += 1
        except Exception as e:
            logger.warning(f"Error querying watchdog incident summary: {e}")
        return summary

    def convert_incident_to_dict(self, inc: SLAIncident) -> Dict[str, Any]:
        """
        Serializes an SLAIncident SQLAlchemy model instance into a standard dictionary format.
        """
        return {
            "id": inc.id,
            "pipelineId": inc.pipeline_id,
            "pipelineName": inc.pipeline_name,
            "pipelineRunId": inc.pipeline_run_id,
            "workspaceId": inc.workspace_id,
            "status": inc.status,
            "failedAt": inc.failed_at,
            "slaTargetTime": inc.sla_target_time,
            "l1NotifiedAt": inc.l1_notified_at,
            "l2EscalatedAt": inc.l2_escalated_at,
            "resolvedAt": inc.resolved_at,
            "resolvedBy": inc.resolved_by,
            "errorMessage": inc.error_message,
            "updatedAt": inc.updated_at,
        }


db_service = DatabaseService()
