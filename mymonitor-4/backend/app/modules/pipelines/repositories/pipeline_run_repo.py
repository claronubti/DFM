import datetime
import json
import logging
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy import func, or_, select

from app.db.session import async_session_maker
from app.modules.pipelines.helpers import nest_activity_runs
from app.modules.pipelines.models.activity_run import ActivityRun
from app.modules.pipelines.models.pipeline_run import PipelineRun
from app.modules.pipelines.repositories.base import normalize_iso_utc
from app.shared.constants import DEFAULT_PIPELINE_NAME
from app.shared.utils import calculate_duration_ms

logger = logging.getLogger("fabric_monitor.pipelines.repo.run")


class PipelineRunRepository:
    """Repository handling pipeline execution runs, granular activity runs, and run history."""

    async def get_known_cached_run_ids(self, workspace_id: str) -> Set[str]:
        """Returns run IDs that are completed/failed and already have activity runs stored with all child pipelines resolved."""
        async with async_session_maker() as session:
            # Subquery for runs that have unresolved child pipeline data
            unresolved_subq = (
                select(ActivityRun.pipeline_run_id)
                .where(
                    or_(
                        func.lower(ActivityRun.activity_type).like("%executepipeline%"),
                        func.lower(ActivityRun.activity_type).like("%invokepipeline%"),
                    ),
                    ActivityRun.child_pipeline_data.is_(None),
                )
                .distinct()
            )

            # Subquery for runs that still have in-progress or non-finalized activity runs
            in_progress_acts_subq = (
                select(ActivityRun.pipeline_run_id)
                .where(
                    or_(
                        func.lower(ActivityRun.status).in_(["inprogress", "running", "queued", "pending"]),
                        ActivityRun.end_time.is_(None),
                    )
                )
                .distinct()
            )

            stmt = (
                select(PipelineRun.id)
                .join(ActivityRun, PipelineRun.id == ActivityRun.pipeline_run_id)
                .where(
                    PipelineRun.workspace_id == workspace_id,
                    PipelineRun.status.in_(["Completed", "Failed", "Cancelled"]),
                    PipelineRun.id.not_in(unresolved_subq),
                    PipelineRun.id.not_in(in_progress_acts_subq),
                )
                .distinct()
            )

            result = await session.execute(stmt)
            return {row[0] for row in result.all() if row[0]}

    async def get_pipelines_with_real_runs(self, workspace_id: str) -> Set[str]:
        """Returns pipeline IDs that have actual execution history (not 'No Runs' or norun- placeholders)."""
        async with async_session_maker() as session:
            stmt = (
                select(PipelineRun.pipeline_id)
                .where(
                    PipelineRun.workspace_id == workspace_id,
                    PipelineRun.status != "No Runs",
                    ~PipelineRun.id.like("norun-%"),
                )
                .distinct()
            )
            rows = (await session.execute(stmt)).all()
            return {str(row[0]).strip().lower() for row in rows if row[0]}

    async def get_pipeline_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a single pipeline run by ID from SQLite."""
        async with async_session_maker() as session:
            run = await session.get(PipelineRun, run_id)
            if not run:
                return None
            st_norm = normalize_iso_utc(run.start_time)
            et_norm = normalize_iso_utc(run.end_time)
            dur_ms = calculate_duration_ms(st_norm, et_norm, run.duration_in_ms)
            return {
                "id": run.id,
                "pipelineId": run.pipeline_id,
                "pipelineName": run.pipeline_name,
                "workspaceId": run.workspace_id,
                "status": run.status,
                "startTime": st_norm,
                "endTime": et_norm,
                "durationInMs": dur_ms,
                "invokeType": run.invoke_type,
                "isChild": bool(run.is_child),
                "parentRunId": run.parent_run_id,
                "parentActivityName": run.parent_activity_name,
            }

    async def save_pipeline_runs(
        self,
        workspace_id: str,
        runs: List[Dict[str, Any]],
        updated_at: Optional[str] = None,
    ) -> None:
        """Persists pipeline run executions into local SQLite cache using SQLAlchemy ORM upsert."""
        if not runs:
            return
        if not updated_at:
            updated_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        # Deduplicate incoming runs by ID
        unique_runs = {}
        for r in runs:
            rid = r.get("id")
            if rid:
                unique_runs[rid] = r

        async with async_session_maker() as session:
            run_ids = list(unique_runs.keys())
            stmt = select(PipelineRun).where(PipelineRun.id.in_(run_ids))
            existing_map = {r.id: r for r in (await session.execute(stmt)).scalars().all()}

            for run_id, r in unique_runs.items():
                pid = r.get("pipelineId") or r.get("itemId")
                pname = r.get("pipelineName") or r.get("itemDisplayName") or DEFAULT_PIPELINE_NAME
                status = r.get("status") or "Unknown"
                if str(status).lower() in ("notstarted", "not started", "queued") and (r.get("startTimeUtc") or r.get("startTime")):
                    status = "InProgress"
                st = r.get("startTimeUtc") or r.get("startTime") or (
                    updated_at if str(status).lower() in ("inprogress", "running", "notstarted") else None
                )
                et = r.get("endTimeUtc") or r.get("endTime")
                st = normalize_iso_utc(st)
                et = normalize_iso_utc(et)
                dur = r.get("durationInMs")
                invoke = r.get("invokeType", "Manual")
                is_child = 1 if r.get("isChild") else 0
                parent_run_id = r.get("parentRunId")
                parent_act = r.get("parentActivityName")
                fail_raw = r.get("failureReason") or r.get("error")
                fail_str = json.dumps(fail_raw) if fail_raw else None

                dur = calculate_duration_ms(st, et, dur)

                if run_id in existing_map:
                    existing = existing_map[run_id]
                    existing.status = status
                    existing.start_time = st
                    existing.end_time = et
                    existing.duration_in_ms = dur
                    existing.is_child = is_child
                    existing.parent_run_id = parent_run_id
                    existing.parent_activity_name = parent_act
                    existing.failure_reason = fail_str
                    existing.updated_at = updated_at
                else:
                    new_run = PipelineRun(
                        id=run_id,
                        pipeline_id=pid,
                        workspace_id=workspace_id,
                        pipeline_name=pname,
                        status=status,
                        start_time=st,
                        end_time=et,
                        duration_in_ms=dur,
                        invoke_type=invoke,
                        is_child=is_child,
                        parent_run_id=parent_run_id,
                        parent_activity_name=parent_act,
                        failure_reason=fail_str,
                        updated_at=updated_at,
                    )
                    session.add(new_run)
            try:
                await session.commit()
            except Exception:
                await session.rollback()
                async with async_session_maker() as retry_session:
                    for run_id, r in unique_runs.items():
                        obj = await retry_session.get(PipelineRun, run_id)
                        if obj:
                            obj.status = r.get("status") or "Unknown"
                            obj.updated_at = updated_at
                    try:
                        await retry_session.commit()
                    except Exception:
                        await retry_session.rollback()

    async def save_activity_runs(
        self,
        run_id: str,
        activities: List[Dict[str, Any]],
        updated_at: Optional[str] = None,
    ) -> None:
        """Persists granular activity run records and child pipeline linkage for a pipeline run."""
        if not activities:
            return
        if not updated_at:
            updated_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        # Deduplicate incoming activities by ID
        unique_acts = {}
        for a in activities:
            act_id = a.get("activityRunId") or a.get("id") or f"{run_id}-{a.get('activityName')}"
            if act_id:
                unique_acts[act_id] = a

        async with async_session_maker() as session:
            act_ids = list(unique_acts.keys())
            stmt = select(ActivityRun).where(ActivityRun.activity_run_id.in_(act_ids))
            existing_map = {a.activity_run_id: a for a in (await session.execute(stmt)).scalars().all()}

            for act_id, a in unique_acts.items():
                name = a.get("activityName", "Unknown Activity")
                atype = a.get("activityType", "General")
                status = a.get("status", "Unknown")
                st = a.get("activityRunStart") or a.get("startTime")
                et = a.get("activityRunEnd") or a.get("endTime")
                st = normalize_iso_utc(st)
                et = normalize_iso_utc(et)
                dur = calculate_duration_ms(st, et, a.get("durationInMs"))
                err = a.get("error")
                err_str = json.dumps(err) if err else None
                out = a.get("output")
                out_str = json.dumps(out) if out else None

                child_run_id = None
                if isinstance(out, dict):
                    child_run_id = out.get("pipelineRunId") or out.get("runId") or out.get("childPipelineRunId")

                child_pipe = a.get("childPipeline")
                child_pipe_str = json.dumps(child_pipe) if child_pipe else None
                p_run_id = a.get("pipelineRunId") or run_id

                if act_id in existing_map:
                    existing = existing_map[act_id]
                    existing.pipeline_run_id = p_run_id
                    existing.activity_name = name
                    existing.activity_type = atype
                    existing.status = status
                    existing.start_time = st
                    existing.end_time = et
                    existing.duration_in_ms = dur
                    existing.error = err_str
                    existing.output = out_str
                    existing.child_pipeline_run_id = str(child_run_id) if child_run_id else None
                    existing.child_pipeline_data = child_pipe_str
                    existing.updated_at = updated_at
                else:
                    new_act = ActivityRun(
                        activity_run_id=act_id,
                        pipeline_run_id=p_run_id,
                        activity_name=name,
                        activity_type=atype,
                        status=status,
                        start_time=st,
                        end_time=et,
                        duration_in_ms=dur,
                        error=err_str,
                        output=out_str,
                        child_pipeline_run_id=str(child_run_id) if child_run_id else None,
                        child_pipeline_data=child_pipe_str,
                        updated_at=updated_at,
                    )
                    session.add(new_act)
            try:
                await session.commit()
            except Exception:
                await session.rollback()

    async def get_activities_for_run(self, run_id: str) -> List[Dict[str, Any]]:
        """Fetches stored activities for a given run from SQLite with parsed childPipeline."""
        async with async_session_maker() as session:
            stmt = select(ActivityRun).where(ActivityRun.pipeline_run_id == run_id).order_by(ActivityRun.start_time.asc())
            rows = (await session.execute(stmt)).scalars().all()
            results = []
            for row in rows:
                err_val = None
                if row.error:
                    try:
                        err_val = json.loads(row.error)
                    except Exception:
                        err_val = None
                out_val = None
                if row.output:
                    try:
                        out_val = json.loads(row.output)
                    except Exception:
                        out_val = None

                child_pipe = None
                if row.child_pipeline_data:
                    try:
                        child_pipe = json.loads(row.child_pipeline_data)
                    except Exception:
                        child_pipe = None

                st = normalize_iso_utc(row.start_time)
                et = normalize_iso_utc(row.end_time)
                dur = calculate_duration_ms(st, et, row.duration_in_ms)

                results.append({
                    "activityRunId": row.activity_run_id,
                    "pipelineRunId": row.pipeline_run_id,
                    "activityName": row.activity_name,
                    "activityType": row.activity_type,
                    "status": row.status,
                    "activityRunStart": st,
                    "activityRunEnd": et,
                    "durationInMs": dur,
                    "error": err_val,
                    "output": out_val,
                    "childPipelineRunId": row.child_pipeline_run_id,
                    "childPipeline": child_pipe,
                })
            return results

    async def get_pipeline_history_paginated(
        self,
        workspace_id: str,
        pipeline_id: str,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Returns historical runs for a specific pipeline with inner activities and total count."""
        async with async_session_maker() as session:
            count_stmt = (
                select(func.count())
                .select_from(PipelineRun)
                .where(
                    PipelineRun.workspace_id == workspace_id,
                    PipelineRun.pipeline_id == pipeline_id,
                )
            )
            total = (await session.execute(count_stmt)).scalar() or 0

            stmt = (
                select(PipelineRun)
                .where(
                    PipelineRun.workspace_id == workspace_id,
                    PipelineRun.pipeline_id == pipeline_id,
                )
                .order_by(PipelineRun.start_time.desc())
            )
            if page is not None and page_size is not None and page > 0 and page_size > 0:
                stmt = stmt.offset((page - 1) * page_size).limit(page_size)

            runs = (await session.execute(stmt)).scalars().all()

        results = []
        run_ids = [r.id for r in runs]
        acts_by_run: Dict[str, List[Dict[str, Any]]] = {rid: [] for rid in run_ids}
        if run_ids:
            async with async_session_maker() as act_session:
                stmt_acts = (
                    select(ActivityRun)
                    .where(ActivityRun.pipeline_run_id.in_(run_ids))
                    .order_by(ActivityRun.start_time.asc())
                )
                act_rows = (await act_session.execute(stmt_acts)).scalars().all()
                for row in act_rows:
                    err_val = None
                    if row.error:
                        try:
                            err_val = json.loads(row.error)
                        except Exception:
                            err_val = None
                    out_val = None
                    if row.output:
                        try:
                            out_val = json.loads(row.output)
                        except Exception:
                            out_val = None
                    child_pipe = None
                    if row.child_pipeline_data:
                        try:
                            child_pipe = json.loads(row.child_pipeline_data)
                        except Exception:
                            child_pipe = None
                    st = normalize_iso_utc(row.start_time)
                    et = normalize_iso_utc(row.end_time)
                    dur = calculate_duration_ms(st, et, row.duration_in_ms)
                    acts_by_run.setdefault(row.pipeline_run_id, []).append({
                        "activityRunId": row.activity_run_id,
                        "pipelineRunId": row.pipeline_run_id,
                        "activityName": row.activity_name,
                        "activityType": row.activity_type,
                        "status": row.status,
                        "activityRunStart": st,
                        "activityRunEnd": et,
                        "durationInMs": dur,
                        "error": err_val,
                        "output": out_val,
                        "childPipelineRunId": row.child_pipeline_run_id,
                        "childPipeline": child_pipe,
                    })

        for r in runs:
            run_id = r.id
            activities = acts_by_run.get(run_id, [])

            fail_val = None
            if r.failure_reason:
                try:
                    fail_val = json.loads(r.failure_reason)
                except Exception:
                    fail_val = None

            st_norm = normalize_iso_utc(r.start_time)
            et_norm = normalize_iso_utc(r.end_time)
            dur_ms = calculate_duration_ms(st_norm, et_norm, r.duration_in_ms)
            if (dur_ms is None or dur_ms == 0) and activities:
                act_sum = sum(a.get("durationInMs") or 0 for a in activities)
                if act_sum > 0:
                    dur_ms = act_sum

            results.append({
                "id": r.id,
                "pipelineId": r.pipeline_id,
                "pipelineName": r.pipeline_name,
                "workspaceId": r.workspace_id,
                "status": r.status,
                "startTime": st_norm,
                "endTime": et_norm,
                "durationInMs": dur_ms,
                "invokeType": r.invoke_type,
                "isChild": bool(r.is_child),
                "parentRunId": r.parent_run_id,
                "parentActivityName": r.parent_activity_name,
                "error": fail_val,
                "activities": nest_activity_runs(activities),
                "childPipelines": [],
            })
        return results, total

    async def get_pipeline_history(self, workspace_id: str, pipeline_id: str) -> List[Dict[str, Any]]:
        """Returns all historical runs for a specific pipeline with inner activities."""
        results, _ = await self.get_pipeline_history_paginated(workspace_id, pipeline_id)
        return results
