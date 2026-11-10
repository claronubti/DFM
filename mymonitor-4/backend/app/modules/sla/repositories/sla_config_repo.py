"""
Repository for SLA configurations and pipeline assignee contact mappings.
"""

from typing import Any, Dict, List, Optional
from sqlalchemy import func, or_, select, update

from app.db.session import async_session_maker
from app.modules.sla.models.sla_config import SLAConfig


class SLAConfigRepository:
    """Data access layer for SLA configurations, assignee routing, and domain ownership."""

    async def get_sla_config(self, workspace_id: str, pipeline_id: str) -> Dict[str, Any]:
        """Gets SLA configuration for a pipeline, or defaults if not configured."""
        async with async_session_maker() as session:
            result = await session.execute(
                select(SLAConfig).where(
                    SLAConfig.workspace_id == workspace_id,
                    SLAConfig.pipeline_id == pipeline_id,
                )
            )
            cfg = result.scalar_one_or_none()
            if cfg:
                s1 = cfg.sla1_minutes if cfg.sla1_minutes is not None else cfg.sla_minutes
                s2 = cfg.sla2_minutes if cfg.sla2_minutes is not None else cfg.sla_minutes
                return {
                    "pipelineId": cfg.pipeline_id,
                    "workspaceId": cfg.workspace_id,
                    "pipelineName": cfg.pipeline_name or "",
                    "l1Email": cfg.l1_email or "",
                    "l1Name": cfg.l1_name or "",
                    "l2Email": cfg.l2_email or "",
                    "l2Name": cfg.l2_name or "",
                    "slaMinutes": cfg.sla_minutes,
                    "sla1Minutes": s1,
                    "sla2Minutes": s2,
                    "domain": cfg.domain or "",
                    "assignedBy": cfg.assigned_by or "",
                }
            return {
                "pipelineId": pipeline_id,
                "workspaceId": workspace_id,
                "pipelineName": "",
                "l1Email": "",
                "l1Name": "",
                "l2Email": "",
                "l2Name": "",
                "slaMinutes": 30,
                "sla1Minutes": 30,
                "sla2Minutes": 60,
                "domain": "",
                "assignedBy": "",
            }

    async def save_sla_config(
        self,
        workspace_id: str,
        pipeline_id: str,
        l1_email: str,
        l2_email: str,
        sla_minutes: int,
        updated_at: str,
        sla1_minutes: Optional[int] = None,
        sla2_minutes: Optional[int] = None,
        l1_name: Optional[str] = None,
        l2_name: Optional[str] = None,
        pipeline_name: Optional[str] = None,
        assigned_by: Optional[str] = None,
        domain: Optional[str] = None,
    ) -> None:
        """Upserts SLA configuration for a pipeline into local SQLite."""
        s1 = sla1_minutes if sla1_minutes is not None else sla_minutes
        s2 = sla2_minutes if sla2_minutes is not None else sla_minutes
        l1_clean = (l1_email or "").strip()
        l2_clean = (l2_email or "").strip()
        l1_n_clean = (l1_name or "").strip()
        l2_n_clean = (l2_name or "").strip()
        pname_clean = (pipeline_name or "").strip()
        assigned_by_clean = (assigned_by or "").strip()
        domain_clean = (domain or "").strip()

        async with async_session_maker() as session:
            existing = await session.execute(
                select(SLAConfig).where(
                    SLAConfig.workspace_id == workspace_id,
                    SLAConfig.pipeline_id == pipeline_id,
                )
            )
            cfg = existing.scalar_one_or_none()
            if cfg:
                await session.execute(
                    update(SLAConfig)
                    .where(
                        SLAConfig.workspace_id == workspace_id,
                        SLAConfig.pipeline_id == pipeline_id,
                    )
                    .values(
                        l1_email=l1_clean,
                        l2_email=l2_clean,
                        l1_name=l1_n_clean,
                        l2_name=l2_n_clean,
                        sla_minutes=s1,
                        sla1_minutes=s1,
                        sla2_minutes=s2,
                        pipeline_name=pname_clean or cfg.pipeline_name,
                        assigned_by=assigned_by_clean or cfg.assigned_by,
                        domain=domain_clean or cfg.domain,
                        updated_at=updated_at,
                    )
                )
            else:
                cfg = SLAConfig(
                    workspace_id=workspace_id,
                    pipeline_id=pipeline_id,
                    pipeline_name=pname_clean,
                    l1_email=l1_clean,
                    l2_email=l2_clean,
                    l1_name=l1_n_clean,
                    l2_name=l2_n_clean,
                    sla_minutes=s1,
                    sla1_minutes=s1,
                    sla2_minutes=s2,
                    assigned_by=assigned_by_clean,
                    domain=domain_clean,
                    updated_at=updated_at,
                )
                session.add(cfg)
            await session.commit()

    async def get_sla_configs_for_workspace(self, workspace_id: str) -> Dict[str, Dict[str, Any]]:
        """Returns map of pipeline_id -> SLA config dict for a workspace."""
        async with async_session_maker() as session:
            result = await session.execute(
                select(SLAConfig).where(SLAConfig.workspace_id == workspace_id)
            )
            rows = result.scalars().all()
            return {
                r.pipeline_id: {
                    "l1Email": r.l1_email or "",
                    "l1Name": r.l1_name or "",
                    "l2Email": r.l2_email or "",
                    "l2Name": r.l2_name or "",
                    "slaMinutes": r.sla_minutes,
                    "sla1Minutes": r.sla1_minutes if r.sla1_minutes is not None else r.sla_minutes,
                    "sla2Minutes": r.sla2_minutes if r.sla2_minutes is not None else r.sla_minutes,
                    "pipelineName": r.pipeline_name or "",
                    "domain": r.domain or "",
                    "assignedBy": r.assigned_by or "",
                }
                for r in rows
            }

    async def get_all_sla_configs(self) -> List[Dict[str, Any]]:
        """Returns all configured SLA rows across all workspaces."""
        async with async_session_maker() as session:
            result = await session.execute(select(SLAConfig))
            rows = result.scalars().all()
            return [
                {
                    "pipelineId": r.pipeline_id,
                    "workspaceId": r.workspace_id,
                    "pipelineName": r.pipeline_name or "",
                    "l1Email": r.l1_email or "",
                    "l1Name": r.l1_name or "",
                    "l2Email": r.l2_email or "",
                    "l2Name": r.l2_name or "",
                    "slaMinutes": r.sla_minutes,
                    "sla1Minutes": r.sla1_minutes if r.sla1_minutes is not None else r.sla_minutes,
                    "sla2Minutes": r.sla2_minutes if r.sla2_minutes is not None else r.sla_minutes,
                    "domain": r.domain or "",
                    "assignedBy": r.assigned_by or "",
                    "updatedAt": r.updated_at,
                }
                for r in rows
            ]

    async def delete_sla_config(self, workspace_id: str, pipeline_id: str) -> None:
        """Deletes SLA configuration for a pipeline."""
        async with async_session_maker() as session:
            result = await session.execute(
                select(SLAConfig).where(
                    SLAConfig.workspace_id == workspace_id,
                    SLAConfig.pipeline_id == pipeline_id,
                )
            )
            cfg = result.scalar_one_or_none()
            if cfg:
                await session.delete(cfg)
                await session.commit()

    async def get_assigned_workspace_ids_for_user(self, email: str) -> List[str]:
        """Returns distinct workspace IDs where the user is L1 or L2 on at least one pipeline."""
        e = (email or "").strip().lower()
        if not e:
            return []
        async with async_session_maker() as session:
            result = await session.execute(
                select(SLAConfig.workspace_id)
                .where(
                    or_(
                        func.lower(func.coalesce(SLAConfig.l1_email, "")) == e,
                        func.lower(func.coalesce(SLAConfig.l2_email, "")) == e,
                    )
                )
                .distinct()
            )
            return [row[0] for row in result.all() if row[0]]

    async def get_assigned_pipeline_ids_for_user(self, email: str) -> List[str]:
        """Returns distinct pipeline IDs across all workspaces where the user is L1 or L2."""
        e = (email or "").strip().lower()
        if not e:
            return []
        async with async_session_maker() as session:
            result = await session.execute(
                select(SLAConfig.pipeline_id)
                .where(
                    or_(
                        func.lower(func.coalesce(SLAConfig.l1_email, "")) == e,
                        func.lower(func.coalesce(SLAConfig.l2_email, "")) == e,
                    ),
                    SLAConfig.pipeline_id.isnot(None),
                    SLAConfig.pipeline_id != "",
                )
                .distinct()
            )
            return [row[0] for row in result.all() if row[0]]

    async def get_configs_for_user(self, email: str) -> List[Dict[str, Any]]:
        """Returns all SLA configs where the user is L1 or L2 assignee."""
        e = (email or "").strip().lower()
        if not e:
            return []
        async with async_session_maker() as session:
            result = await session.execute(
                select(SLAConfig)
                .where(
                    or_(
                        func.lower(func.coalesce(SLAConfig.l1_email, "")) == e,
                        func.lower(func.coalesce(SLAConfig.l2_email, "")) == e,
                    )
                )
                .order_by(SLAConfig.workspace_id.asc(), SLAConfig.pipeline_name.asc())
            )
            rows = result.scalars().all()
            return [
                {
                    "pipeline_id": r.pipeline_id,
                    "workspace_id": r.workspace_id,
                    "pipeline_name": r.pipeline_name or "",
                    "l1_email": r.l1_email or "",
                    "l2_email": r.l2_email or "",
                    "l1_name": r.l1_name or "",
                    "l2_name": r.l2_name or "",
                    "sla1_minutes": r.sla1_minutes if r.sla1_minutes is not None else r.sla_minutes,
                    "sla2_minutes": r.sla2_minutes if r.sla2_minutes is not None else r.sla_minutes,
                    "assigned_by": r.assigned_by or "",
                    "updated_at": r.updated_at,
                }
                for r in rows
            ]
