import datetime
import json
import logging
from typing import Any, Dict, List, Optional, Set

from sqlalchemy import func, or_, select, update

from app.db.session import async_session_maker
from app.modules.pipelines.models.activity_run import ActivityRun
from app.modules.pipelines.models.pipeline import Pipeline
from app.modules.pipelines.models.pipeline_run import PipelineRun
from app.shared.constants import DEFAULT_PIPELINE_NAME

logger = logging.getLogger("fabric_monitor.pipelines.repo.def")


class PipelineDefRepository:
    """Repository handling pipeline catalog definitions, metadata, and master/child role resolution."""

    async def save_pipelines(
        self,
        workspace_id: str,
        pipelines: List[Dict[str, Any]],
        updated_at: Optional[str] = None,
    ) -> None:
        """Saves pipelines from Fabric. Defaults to parent level (is_master=1) until dynamic child linking."""
        if not pipelines:
            return
        if not updated_at:
            updated_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        # Deduplicate incoming pipelines by ID
        unique_pipelines = {}
        for p in pipelines:
            pid = p.get("id")
            if pid:
                unique_pipelines[pid] = p

        async with async_session_maker() as session:
            stmt = select(Pipeline).where(Pipeline.workspace_id == workspace_id)
            existing_map = {p.id: p for p in (await session.execute(stmt)).scalars().all()}

            for pid, p in unique_pipelines.items():
                name = p.get("displayName") or p.get("name") or DEFAULT_PIPELINE_NAME
                parts = name.split("_")
                prefix = f"{parts[0]}_{parts[1]}".lower() if len(parts) >= 2 else ""
                is_m = int(p["is_master"]) if ("is_master" in p and p["is_master"] is not None) else None

                if pid in existing_map:
                    ep = existing_map[pid]
                    ep.displayName = name
                    ep.prefix = prefix
                    ep.updated_at = updated_at
                    if is_m is not None:
                        ep.is_master = is_m
                else:
                    new_pipe = Pipeline(
                        id=pid,
                        workspace_id=workspace_id,
                        displayName=name,
                        is_master=is_m if is_m is not None else 1,
                        prefix=prefix,
                        updated_at=updated_at,
                    )
                    session.add(new_pipe)
            try:
                await session.commit()
            except Exception:
                await session.rollback()
                async with async_session_maker() as retry_session:
                    for pid, p in unique_pipelines.items():
                        name = p.get("displayName") or p.get("name") or DEFAULT_PIPELINE_NAME
                        parts = name.split("_")
                        prefix = f"{parts[0]}_{parts[1]}".lower() if len(parts) >= 2 else ""
                        is_m = int(p["is_master"]) if ("is_master" in p and p["is_master"] is not None) else None
                        obj = await retry_session.get(Pipeline, pid)
                        if obj:
                            obj.displayName = name
                            obj.prefix = prefix
                            obj.updated_at = updated_at
                            if is_m is not None:
                                obj.is_master = is_m
                        else:
                            retry_session.add(Pipeline(
                                id=pid,
                                workspace_id=workspace_id,
                                displayName=name,
                                is_master=is_m if is_m is not None else 1,
                                prefix=prefix,
                                updated_at=updated_at,
                            ))
                    try:
                        await retry_session.commit()
                    except Exception:
                        await retry_session.rollback()

    async def update_child_pipeline_flags(
        self, workspace_id: str, invoked_child_ids: Set[str], invoked_child_names: Set[str]
    ) -> None:
        """
        Dynamic pipeline role resolution:
        Any pipeline that is invoked by an ExecutePipeline activity or has runs marked
        as is_child / parent_run_id is flagged as a child pipeline (is_master = 0).
        Parent and independent pipelines remain flagged with is_master = 1.
        """
        child_ids = {str(i).strip().lower() for i in invoked_child_ids if i}
        child_names = {str(n).strip().lower() for n in invoked_child_names if n}

        def extract_child_meta(data: Any) -> None:
            """Recursively extracts child pipeline identifiers and names from nested activity JSON."""
            if not data or not isinstance(data, dict):
                return
            pid = data.get("pipelineId")
            pname = data.get("pipelineName")
            if pid:
                child_ids.add(str(pid).strip().lower())
            if pname:
                child_names.add(str(pname).strip().lower())
            for act in data.get("activities", []):
                if isinstance(act, dict) and "childPipeline" in act and act["childPipeline"]:
                    extract_child_meta(act["childPipeline"])
            for cp in data.get("childPipelines", []):
                extract_child_meta(cp)

        async with async_session_maker() as session:
            # 1. Discover child pipelines from activity_runs JSON and child_pipeline_run_id
            stmt1 = select(ActivityRun.child_pipeline_data, ActivityRun.output, ActivityRun.child_pipeline_run_id).where(
                or_(
                    ActivityRun.child_pipeline_data.isnot(None),
                    ActivityRun.child_pipeline_run_id.isnot(None),
                    ActivityRun.output.like("%pipeline%"),
                    ActivityRun.output.like("%runId%"),
                )
            )
            act_rows = (await session.execute(stmt1)).all()
            for r_data, r_out, r_crun in act_rows:
                if r_data:
                    try:
                        d = json.loads(r_data)
                        extract_child_meta(d)
                    except Exception:
                        pass
                if r_out:
                    try:
                        o = json.loads(r_out)
                        if isinstance(o, dict):
                            p_ref = o.get("pipelineName") or o.get("pipelineId")
                            if p_ref:
                                p_ref_str = str(p_ref).strip().lower()
                                child_ids.add(p_ref_str)
                                child_names.add(p_ref_str)
                            c_rid = o.get("pipelineRunId") or o.get("runId") or o.get("childPipelineRunId")
                            if c_rid:
                                child_ids.add(str(c_rid).strip().lower())
                    except Exception:
                        pass

            # 2. Discover child runs from child_pipeline_run_id
            stmt2 = select(ActivityRun.child_pipeline_run_id).where(
                ActivityRun.child_pipeline_run_id.isnot(None)
            ).distinct()
            child_run_ids = {row[0] for row in (await session.execute(stmt2)).all() if row[0]}

            if child_run_ids:
                stmt_pipes = select(PipelineRun.pipeline_id, PipelineRun.pipeline_name).where(
                    PipelineRun.id.in_(child_run_ids),
                    PipelineRun.workspace_id == workspace_id,
                )
                found_pipes = (await session.execute(stmt_pipes)).all()
                for f_pid, f_pname in found_pipes:
                    if f_pid:
                        child_ids.add(str(f_pid).strip().lower())
                    if f_pname:
                        child_names.add(str(f_pname).strip().lower())

            # 3. Check pipeline_runs where is_child = 1 or parent_run_id IS NOT NULL
            stmt3 = select(PipelineRun.pipeline_id, PipelineRun.pipeline_name).where(
                PipelineRun.workspace_id == workspace_id,
                or_(PipelineRun.is_child == 1, PipelineRun.parent_run_id.isnot(None)),
            ).distinct()
            invoked_rows = (await session.execute(stmt3)).all()
            for i_pid, i_pname in invoked_rows:
                if i_pid:
                    child_ids.add(str(i_pid).strip().lower())
                if i_pname:
                    child_names.add(str(i_pname).strip().lower())

            # 4. Update all pipelines for this workspace
            stmt_all = select(Pipeline).where(Pipeline.workspace_id == workspace_id)
            all_pipes = (await session.execute(stmt_all)).scalars().all()

            for p in all_pipes:
                pid_clean = str(p.id).strip().lower()
                pname_clean = str(p.displayName or "").strip().lower()
                is_child = pid_clean in child_ids or pname_clean in child_names
                p.is_master = 0 if is_child else 1

            # 5. Mark child runs in pipeline_runs table
            if child_ids or child_names:
                conditions = []
                if child_ids:
                    conditions.append(PipelineRun.pipeline_id.in_(list(child_ids)))
                if child_names:
                    conditions.append(func.lower(PipelineRun.pipeline_name).in_(list(child_names)))
                if conditions:
                    stmt_runs = (
                        update(PipelineRun)
                        .where(
                            PipelineRun.workspace_id == workspace_id,
                            or_(*conditions),
                        )
                        .values(is_child=1)
                    )
                    await session.execute(stmt_runs)

            await session.commit()

    async def get_all_pipelines(self, workspace_id: str) -> List[Dict[str, Any]]:
        """Returns all pipelines for a workspace from the pipelines cache."""
        async with async_session_maker() as session:
            stmt = select(Pipeline).where(
                Pipeline.workspace_id == workspace_id
            ).order_by(Pipeline.displayName.asc())
            rows = (await session.execute(stmt)).scalars().all()
            return [
                {
                    "id": r.id,
                    "pipelineId": r.id,
                    "displayName": r.displayName,
                    "pipelineName": r.displayName,
                    "is_master": r.is_master,
                    "workspace_id": r.workspace_id,
                }
                for r in rows
            ]

    async def get_parent_pipelines(self, workspace_id: str) -> List[Dict[str, Any]]:
        """Returns parent (master) pipelines for a workspace from the pipelines cache."""
        async with async_session_maker() as session:
            stmt = select(Pipeline).where(
                Pipeline.workspace_id == workspace_id,
                Pipeline.is_master == 1,
            ).order_by(Pipeline.displayName.asc())
            rows = (await session.execute(stmt)).scalars().all()
            if not rows:
                stmt_all = select(Pipeline).where(Pipeline.workspace_id == workspace_id).order_by(Pipeline.displayName.asc())
                rows = (await session.execute(stmt_all)).scalars().all()
            return [
                {
                    "pipelineId": r.id,
                    "pipelineName": r.displayName,
                    "id": r.id,
                    "displayName": r.displayName,
                    "is_master": r.is_master,
                }
                for r in rows
            ]
