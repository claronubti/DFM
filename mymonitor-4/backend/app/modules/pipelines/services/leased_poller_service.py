"""
High-performance Leased Workspace Poller Engine for Fabric pipelines.
"""

import asyncio
import datetime
import json
import logging
import time
from typing import Any, Dict, List, Optional, Set, Tuple

from app.core.config import settings
from app.modules.pipelines.repository import pipeline_repository
from app.modules.pipelines.services.schedule_parser import _parse_schedules_payload
from app.modules.sla.repository import sla_repository
from app.modules.sla.service import alert_service
from app.modules.websocket.connection_manager import connection_manager
from app.shared.clients.fabric_client import fabric_client

logger = logging.getLogger("fabric_monitor.pipelines.services.leased_poller")


def extract_all_canvas_activities(activities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Recursively flattens activities from canvas JSON, including inside containers (ForEach, IfCondition, Switch, Until)."""
    flat = []
    for act in activities:
        flat.append(act)
        tp = act.get("typeProperties", {})
        if "activities" in tp and isinstance(tp["activities"], list):
            flat.extend(extract_all_canvas_activities(tp["activities"]))
        if "ifTrueActivities" in tp and isinstance(tp["ifTrueActivities"], list):
            flat.extend(extract_all_canvas_activities(tp["ifTrueActivities"]))
        if "ifFalseActivities" in tp and isinstance(tp["ifFalseActivities"], list):
            flat.extend(extract_all_canvas_activities(tp["ifFalseActivities"]))
        if "cases" in tp and isinstance(tp["cases"], list):
            for c in tp["cases"]:
                if "activities" in c and isinstance(c["activities"], list):
                    flat.extend(extract_all_canvas_activities(c["activities"]))
        if "defaultActivities" in tp and isinstance(tp["defaultActivities"], list):
            flat.extend(extract_all_canvas_activities(tp["defaultActivities"]))
    return flat


class LeasedWorkspacePoller:
    """High-Performance On-Demand Leased Background Poller.
    - Persistent SQLite snapshot caching (<15ms response).
    - Recursive activity and sub-pipeline execution tracing (Zero orphan rows).
    - Permanent caching of terminal runs and activity telemetry.
    - SLA Incident detection and automated L1/L2 escalation.
    - Differential per-pipeline polling: Active for running, Relaxed for idle.
    """

    def __init__(self):
        """Initializes the background poller worker with tracking sets and synchronization state."""
        self._is_running = False
        self._task: Optional[asyncio.Task] = None
        self._sync_in_progress: Set[str] = set()
        self._active_sync_tasks: Dict[str, asyncio.Task] = {}
        self._last_instance_check: Dict[str, float] = {}
        self._last_workspace_sync: Dict[str, float] = {}
        self._last_schedule_sync: Dict[str, float] = {}
        self._pipeline_definitions_cache: Dict[str, Dict[str, Any]] = {}
        self._last_def_check: Dict[str, float] = {}

    def start(self):
        """Starts the background worker polling loop."""
        if not self._is_running:
            self._is_running = True
            self._task = asyncio.create_task(self._poll_loop())
            logger.info("LeasedWorkspacePoller background worker started.")

    def stop(self):
        """Stops the background worker polling loop and cancels the runner task."""
        self._is_running = False
        if self._task:
            self._task.cancel()
            logger.info("LeasedWorkspacePoller background worker stopped.")

    async def fetch_workspace_snapshot(self, workspace_id: str, force_sync: bool = False) -> List[Dict[str, Any]]:
        """Ultra-fast snapshot delivery from SQLite or Fabric sync."""
        if not force_sync:
            cached_tree = await pipeline_repository.get_workspace_latest_tree(workspace_id)
            has_real_runs = any(
                p.get("status") not in ("No Runs", "Not Run", "None", "")
                and not str(p.get("id", "")).startswith("norun-")
                for p in (cached_tree or [])
            )
            if cached_tree and has_real_runs:
                if workspace_id not in self._sync_in_progress:
                    asyncio.create_task(self._background_sync(workspace_id))
                return cached_tree

        # With Celery enabled, if a worker is already actively syncing this workspace,
        # wait for it to finish and return the populated tree from SQLite.
        if settings.CELERY_ENABLED:
            from app.core.event_bus import event_bus
            if await event_bus.is_locked(f"poll:{workspace_id}"):
                logger.info(f"Celery worker is actively syncing workspace {workspace_id}. Waiting for completion...")
                for _ in range(35):  # wait up to 14 seconds
                    await asyncio.sleep(0.4)
                    if not await event_bus.is_locked(f"poll:{workspace_id}"):
                        break
                return await pipeline_repository.get_workspace_latest_tree(workspace_id)

        # But if cache is empty or has no real runs, sync inline first so caller gets populated status.
        return await self.sync_workspace_with_fabric(workspace_id, force_sync=force_sync)

    async def _background_sync(self, workspace_id: str):
        """Dispatches an asynchronous background synchronization without blocking the caller."""
        if settings.CELERY_ENABLED:
            try:
                from app.modules.pipelines.tasks import poll_workspace_task
                poll_workspace_task.delay(workspace_id, False)
                return
            except Exception as e:
                logger.error(f"Celery dispatch failed for {workspace_id}, syncing inline: {e}")
        try:
            await self.sync_workspace_with_fabric(workspace_id)
        except Exception as e:
            logger.error(f"Error in background sync for {workspace_id}: {e}", exc_info=True)

    async def _fetch_activity_tree(
        self,
        workspace_id: str,
        pipeline_id: str,
        run_id: str,
        start_utc: Optional[str],
        end_utc: Optional[str],
        pipeline_names: Dict[str, str],
        semaphore: asyncio.Semaphore,
        now_iso: str,
        enable_alerting: bool = True,
        depth: int = 0,
        max_depth: int = 3,
        discovered_child_ids: Optional[Set[str]] = None,
        discovered_child_names: Optional[Set[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Recursively queries and nests activities for an execution run.

        When ``enable_alerting`` is False (historical / non-latest runs) failures are
        parsed for history but do NOT create SLA incidents or dispatch alert emails.
        """
        if depth > max_depth or not run_id:
            return []

        async with semaphore:
            acts = await fabric_client.query_activity_runs(
                workspace_id, pipeline_id, run_id, start_utc, end_utc
            )

        parsed_acts: List[Dict[str, Any]] = []
        for a in acts:
            act_type = str(a.get("activityType") or "").lower()
            out = a.get("output") or {}
            if isinstance(out, str):
                try:
                    out = json.loads(out)
                except Exception:
                    out = {}
            inp = a.get("input") or {}
            if isinstance(inp, str):
                try:
                    inp = json.loads(inp)
                except Exception:
                    inp = {}

            child_run_id = (
                out.get("pipelineRunId")
                or out.get("runId")
                or out.get("childPipelineRunId")
            )
            child_pipe_ref = (
                inp.get("pipeline", {}).get("referenceName")
                or out.get("pipelineName")
                or out.get("pipelineId")
                or inp.get("pipelineName")
            )

            is_sub_pipe = child_run_id is not None or any(k in act_type for k in ["executepipeline", "invokepipeline"])

            child_obj = None
            if is_sub_pipe and child_run_id:
                name_to_guid = {str(name).strip().lower(): str(guid) for guid, name in pipeline_names.items() if name}
                ref_str = str(child_pipe_ref or "").strip()
                ref_lower = ref_str.lower()
                act_name = str(a.get("activityName") or "").strip()

                child_guid = None
                child_name = None

                if ref_str in pipeline_names:
                    child_guid = ref_str
                    child_name = pipeline_names[ref_str]
                elif ref_lower in name_to_guid:
                    child_guid = name_to_guid[ref_lower]
                    child_name = pipeline_names.get(child_guid) or ref_str
                elif act_name.lower() in name_to_guid:
                    child_guid = name_to_guid[act_name.lower()]
                    child_name = pipeline_names.get(child_guid) or act_name

                if not child_guid:
                    child_guid = ref_str or pipeline_id
                if not child_name:
                    child_name = pipeline_names.get(child_guid) or act_name or "Sub-pipeline"

                if discovered_child_ids is not None:
                    discovered_child_ids.add(str(child_guid).strip().lower())
                if discovered_child_names is not None:
                    discovered_child_names.add(str(child_name).strip().lower())
                    if ref_lower:
                        discovered_child_names.add(ref_lower)

                child_pipe_id_str = str(child_guid)

                inner_acts = await self._fetch_activity_tree(
                    workspace_id=workspace_id,
                    pipeline_id=child_pipe_id_str,
                    run_id=str(child_run_id),
                    start_utc=start_utc,
                    end_utc=end_utc,
                    pipeline_names=pipeline_names,
                    semaphore=semaphore,
                    now_iso=now_iso,
                    enable_alerting=enable_alerting,
                    depth=depth + 1,
                    max_depth=max_depth,
                    discovered_child_ids=discovered_child_ids,
                    discovered_child_names=discovered_child_names,
                )

                child_error = a.get("error")
                if not child_error and a.get("status") == "Failed":
                    for ia in inner_acts:
                        if ia.get("error"):
                            child_error = ia.get("error")
                            break

                child_obj = {
                    "id": str(child_run_id),
                    "pipelineId": child_pipe_id_str,
                    "pipelineName": child_name,
                    "status": a.get("status", "Unknown"),
                    "startTime": a.get("activityRunStart"),
                    "endTime": a.get("activityRunEnd"),
                    "durationInMs": a.get("durationInMs"),
                    "error": child_error,
                    "activities": inner_acts,
                    "childPipelines": [],
                }

            parsed_act = {
                "activityRunId": a.get("activityRunId") or a.get("id"),
                "pipelineRunId": run_id,
                "activityName": a.get("activityName", "Activity"),
                "activityType": a.get("activityType", "General"),
                "status": a.get("status", "Unknown"),
                "activityRunStart": a.get("activityRunStart") or a.get("startTime"),
                "activityRunEnd": a.get("activityRunEnd") or a.get("endTime"),
                "durationInMs": a.get("durationInMs"),
                "error": a.get("error"),
                "output": out,
                "childPipelineRunId": str(child_run_id) if child_run_id else None,
                "childPipeline": child_obj,
            }
            parsed_acts.append(parsed_act)

        if parsed_acts:
            await pipeline_repository.save_activity_runs(run_id, parsed_acts, now_iso)

        return parsed_acts

    async def sync_stage1_catalog_and_status(
        self,
        workspace_id: str,
        force_sync: bool = False,
        now_iso: Optional[str] = None,
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, str]]:
        """Stage 1: Fast Catalog & Status (< 2-3s).
        - Fetches all pipeline definitions in the workspace.
        - Parallel-fetches recent execution instances.
        - Persists catalog & runs to SQLite.
        - Broadcasts FULL_SNAPSHOT immediately so UI renders in ~2s.
        """
        t0 = time.time()
        now_iso = now_iso or datetime.datetime.now(datetime.timezone.utc).isoformat()
        ws_name = await fabric_client.resolve_workspace_name(workspace_id)
        latest_cached = await pipeline_repository.get_workspace_latest_tree(workspace_id)

        # 1. Discover all Data Pipelines
        pipelines = await fabric_client.get_pipelines(workspace_id)
        if not pipelines:
            logger.warning(f"[{ws_name}] No pipelines returned by Fabric, preserving database cache")
            return [], [], {}

        pipeline_names = {p.get("id"): p.get("displayName") for p in pipelines}
        await pipeline_repository.save_pipelines(workspace_id, pipelines, now_iso)

        try:
            await connection_manager.broadcast_to_workspace(workspace_id, {
                "type": "SYNC_PROGRESS",
                "workspaceId": workspace_id,
                "stage": "catalog_status",
                "message": f"Discovered {len(pipelines)} pipelines • Querying latest status...",
                "percent": 30,
            })
        except Exception:
            pass

        # 2. Concurrently fetch recent job instances
        known_status_by_pid = {p.get("pipelineId"): str(p.get("status") or "").lower() for p in latest_cached}
        semaphore = asyncio.Semaphore(settings.MAX_PARALLEL_FABRIC_REQUESTS)
        now_ts = time.time()

        pipelines_to_query = []
        for p in pipelines:
            pid = p.get("id")
            last_st = known_status_by_pid.get(pid, "")
            is_running = last_st in ("inprogress", "running")
            last_chk = self._last_instance_check.get(f"{workspace_id}:{pid}", 0)
            elapsed = now_ts - last_chk

            if force_sync or is_running or (elapsed >= settings.POLL_INTERVAL_IDLE_SECONDS):
                pipelines_to_query.append(p)
                self._last_instance_check[f"{workspace_id}:{pid}"] = now_ts

        all_runs: List[Dict[str, Any]] = []
        if pipelines_to_query:
            async def _fetch_instances(p: Dict[str, Any]) -> List[Dict[str, Any]]:
                """Fetches recent executions for a single pipeline from Fabric."""
                pid = p.get("id")
                p_name = p.get("displayName")
                async with semaphore:
                    instances = await fabric_client.get_job_instances(workspace_id, pid)
                if instances:
                    for inst in instances:
                        inst["pipelineId"] = pid
                        inst["pipelineName"] = p_name
                    return instances
                else:
                    return [{
                        "id": f"norun-{pid}",
                        "pipelineId": pid,
                        "pipelineName": p_name,
                        "itemId": pid,
                        "itemDisplayName": p_name,
                        "status": "No Runs",
                        "startTime": None,
                        "endTime": None,
                        "durationInMs": 0,
                        "invokeType": "None",
                    }]

            instance_batches = await asyncio.gather(*[_fetch_instances(p) for p in pipelines_to_query], return_exceptions=False)
            all_runs = [inst for batch in instance_batches for inst in batch]
            await pipeline_repository.save_pipeline_runs(workspace_id, all_runs, now_iso)

            # Broadcast Stage 1 snapshot to frontend immediately
            try:
                early_tree = await pipeline_repository.get_workspace_tree_by_date(workspace_id, date_preset="latest")
                if early_tree and early_tree.get("pipelines"):
                    await connection_manager.broadcast_to_workspace(workspace_id, {
                        "type": "FULL_SNAPSHOT",
                        "workspaceId": workspace_id,
                        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        "viewersCount": connection_manager.get_viewer_count(workspace_id),
                        "data": early_tree.get("pipelines", []),
                        "metrics": early_tree.get("metrics"),
                        "isSyncComplete": False,
                    })
            except Exception as early_err:
                logger.debug(f"Stage 1 snapshot broadcast skipped: {early_err}")

        elapsed_s = round(time.time() - t0, 2)
        logger.info(f"\033[96m[CELERY]\033[0m ⚡ [STAGE 1/4: CATALOG & STATUS] Discovered {len(pipelines)} pipelines and latest status in {elapsed_s}s (UI Snapshot Broadcasted)")
        return pipelines, all_runs, pipeline_names

    async def sync_stage2_activities(
        self,
        workspace_id: str,
        pipelines: List[Dict[str, Any]],
        all_runs: List[Dict[str, Any]],
        pipeline_names: Dict[str, str],
        now_iso: str,
        semaphore: asyncio.Semaphore,
    ) -> Tuple[Set[str], Set[str]]:
        """Stage 2: Latest Run Activities & Diagnostics (~3-4s).
        - Inspects strictly latest run per pipeline + running instances.
        - Resolves SLA incidents for successes and alerts on failures.
        - Caches terminal runs so duplicate calls are avoided.
        """
        t0 = time.time()
        try:
            await connection_manager.broadcast_to_workspace(workspace_id, {
                "type": "SYNC_PROGRESS",
                "workspaceId": workspace_id,
                "stage": "activities",
                "message": "Hydrating latest activities & SLA incidents...",
                "percent": 60,
            })
        except Exception:
            pass

        cached_terminal_run_ids = await pipeline_repository.get_known_cached_run_ids(workspace_id)
        discovered_child_ids: Set[str] = set()
        discovered_child_names: Set[str] = set()

        for r in all_runs:
            if r.get("isChild") or r.get("parentRunId"):
                if r.get("pipelineId"):
                    discovered_child_ids.add(str(r["pipelineId"]))
                if r.get("pipelineName"):
                    discovered_child_names.add(str(r["pipelineName"]))

        def _run_sort_key(run: Dict[str, Any]) -> str:
            return str(
                run.get("startTimeUtc") or run.get("startTime")
                or run.get("endTimeUtc") or run.get("endTime") or ""
            )

        latest_run_id_by_pid: Dict[str, str] = {}
        latest_key_by_pid: Dict[str, str] = {}
        for r in all_runs:
            rid = r.get("id")
            r_pid = r.get("pipelineId") or r.get("itemId")
            if not rid or not r_pid or str(rid).startswith("norun-") or r.get("status") == "No Runs":
                continue
            key = _run_sort_key(r)
            if r_pid not in latest_key_by_pid or key > latest_key_by_pid[r_pid]:
                latest_key_by_pid[r_pid] = key
                latest_run_id_by_pid[r_pid] = rid

        latest_alerting_run_ids: Set[str] = set(latest_run_id_by_pid.values())

        # Filter all_runs down to ONLY the latest run of each pipeline and currently active runs
        runs_to_process = [
            r for r in all_runs
            if r.get("id") in latest_alerting_run_ids
            or str(r.get("status", "")).lower() in ("inprogress", "running")
        ]

        active_count = 0
        failed_count = 0

        async def _process_run_activities(r: Dict[str, Any]):
            nonlocal active_count, failed_count
            run_id = r.get("id")
            status = r.get("status", "")
            pid = r.get("pipelineId") or r.get("itemId")
            pname = r.get("pipelineName") or r.get("itemDisplayName")

            if not run_id or run_id.startswith("norun-") or status == "No Runs":
                return

            is_latest = run_id in latest_alerting_run_ids
            st_lower = str(status).lower()
            if st_lower in ("inprogress", "running"):
                active_count += 1
            elif st_lower in ("failed",):
                failed_count += 1

            st = r.get("startTimeUtc") or r.get("startTime")
            et = r.get("endTimeUtc") or r.get("endTime")

            if run_id in cached_terminal_run_ids:
                if is_latest and st_lower in ("completed", "succeeded", "success", "cancelled", "canceled"):
                    res_count = await sla_repository.resolve_incidents_for_pipeline(
                        workspace_id=workspace_id,
                        pipeline_id=pid,
                        resolved_by=f"Auto-Resolved (Pipeline {status})"
                    )
                    if res_count > 0:
                        logger.info(f"Auto-resolved {res_count} incident(s) for pipeline {pname} ({pid}) on {status}.")
                        await connection_manager.broadcast_to_workspace(workspace_id, {
                            "type": "INCIDENT_RESOLVED",
                            "workspaceId": workspace_id,
                            "pipelineId": pid,
                            "resolvedBy": f"Auto-Resolved (Pipeline {status})",
                            "resolvedAt": now_iso
                        })
                        asyncio.create_task(alert_service.notify_pipeline_recovered(
                            workspace_id=workspace_id,
                            pipeline_id=pid,
                            pipeline_name=pname,
                            run_id=run_id
                        ))
                elif is_latest and st_lower in ("failed",):
                    run_inc = await sla_repository.get_incident_for_run(run_id)
                    if run_inc and run_inc.get("status") == "RESOLVED":
                        return
                    existing_inc = await sla_repository.get_active_incident_for_pipeline(workspace_id, pid)
                    if not existing_inc or existing_inc.get("pipeline_run_id") != run_id:
                        asyncio.create_task(alert_service.process_failed_run(
                            workspace_id=workspace_id,
                            pipeline_id=pid,
                            pipeline_name=pname,
                            pipeline_run_id=run_id,
                            error_info=r.get("failureReason"),
                            failed_at=et or now_iso,
                        ))
                return

            acts = await self._fetch_activity_tree(
                workspace_id=workspace_id,
                pipeline_id=pid,
                run_id=run_id,
                start_utc=st,
                end_utc=et,
                pipeline_names=pipeline_names,
                semaphore=semaphore,
                now_iso=now_iso,
                enable_alerting=is_latest,
                depth=0,
                max_depth=3,
                discovered_child_ids=discovered_child_ids,
                discovered_child_names=discovered_child_names,
            )

            if is_latest and st_lower in ("completed", "succeeded", "success", "cancelled", "canceled"):
                res_count = await sla_repository.resolve_incidents_for_pipeline(
                    workspace_id=workspace_id,
                    pipeline_id=pid,
                    resolved_by=f"Auto-Resolved (Pipeline {status})"
                )
                if res_count > 0:
                    logger.info(f"Auto-resolved {res_count} incident(s) for pipeline {pname} ({pid}) on {status}.")
                    await connection_manager.broadcast_to_workspace(workspace_id, {
                        "type": "INCIDENT_RESOLVED",
                        "workspaceId": workspace_id,
                        "pipelineId": pid,
                        "resolvedBy": f"Auto-Resolved (Pipeline {status})",
                        "resolvedAt": now_iso
                    })
                    asyncio.create_task(alert_service.notify_pipeline_recovered(
                        workspace_id=workspace_id,
                        pipeline_id=pid,
                        pipeline_name=pname,
                        run_id=run_id
                    ))
            elif is_latest and st_lower in ("failed",):
                run_inc = await sla_repository.get_incident_for_run(run_id)
                if not (run_inc and run_inc.get("status") == "RESOLVED"):
                    failure_err = r.get("failureReason")
                    if not failure_err and acts:
                        for a in acts:
                            if a.get("error"):
                                failure_err = a.get("error")
                                break
                    asyncio.create_task(alert_service.process_failed_run(
                        workspace_id=workspace_id,
                        pipeline_id=pid,
                        pipeline_name=pname,
                        pipeline_run_id=run_id,
                        error_info=failure_err,
                        failed_at=et or now_iso,
                    ))

        if runs_to_process:
            await asyncio.gather(*[_process_run_activities(r) for r in runs_to_process], return_exceptions=True)

        # Broadcast Stage 2 snapshot
        try:
            act_tree = await pipeline_repository.get_workspace_tree_by_date(workspace_id, date_preset="latest")
            if act_tree and act_tree.get("pipelines"):
                await connection_manager.broadcast_to_workspace(workspace_id, {
                    "type": "FULL_SNAPSHOT",
                    "workspaceId": workspace_id,
                    "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "viewersCount": connection_manager.get_viewer_count(workspace_id),
                    "data": act_tree.get("pipelines", []),
                    "metrics": act_tree.get("metrics"),
                    "isSyncComplete": False,
                })
        except Exception as act_err:
            logger.debug(f"Stage 2 snapshot broadcast skipped: {act_err}")

        elapsed_s = round(time.time() - t0, 2)
        logger.info(f"\033[96m[CELERY]\033[0m 🔍 [STAGE 2/4: ACTIVITIES] Hydrated latest activities & SLA incidents ({active_count} active, {failed_count} failed) in {elapsed_s}s")
        return discovered_child_ids, discovered_child_names

    async def sync_canvas_definitions(
        self,
        workspace_id: str,
        pipelines: Optional[List[Dict[str, Any]]],
        discovered_child_ids: Set[str],
        discovered_child_names: Set[str],
        force_sync: bool = False,
    ) -> None:
        """
        Inspects design-time canvas definitions (pipeline-content.json) for all pipelines in the workspace:
        1. Detects ExecutePipeline / InvokePipeline activities and target child pipelines before any execution run.
        2. Populates discovered_child_ids and discovered_child_names so child pipelines are never rendered as orphan root rows.
        3. Persists definition activities under 'norun-{pid}' so unexecuted pipelines display their child activities and nested sub-pipelines directly on the canvas.
        """
        if not pipelines:
            pipelines = await pipeline_repository.get_all_pipelines(workspace_id)
        if not pipelines:
            return

        pipe_by_id = {str(p.get("id")).strip().lower(): p.get("displayName") for p in pipelines if p.get("id")}
        pipe_by_name = {str(p.get("displayName")).strip().lower(): str(p.get("id")).strip().lower() for p in pipelines if p.get("displayName")}

        # Optimization: Identify pipelines with real execution history
        pids_with_real_runs = await pipeline_repository.get_pipelines_with_real_runs(workspace_id)

        # Only query Fabric getDefinition API for pipelines with No Runs or on explicit force_sync
        pipes_to_query_def = [
            p for p in pipelines
            if str(p.get("id")).strip().lower() not in pids_with_real_runs
            or force_sync
        ]

        semaphore = asyncio.Semaphore(settings.MAX_PARALLEL_FABRIC_REQUESTS)
        now_ts = time.time()

        async def _fetch_def(p: Dict[str, Any]) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
            pid = p.get("id")
            if not pid:
                return p, None
            cache_key = f"{workspace_id}:{pid}"
            last_chk = self._last_def_check.get(cache_key, 0)
            cached_def = self._pipeline_definitions_cache.get(cache_key)

            if not force_sync and cached_def and ((now_ts - last_chk) < 600.0):
                return p, cached_def

            async with semaphore:
                defn = await fabric_client.get_pipeline_definition(workspace_id, pid)
                if defn:
                    self._pipeline_definitions_cache[cache_key] = defn
                    self._last_def_check[cache_key] = now_ts
                return p, defn

        results = await asyncio.gather(*[_fetch_def(p) for p in pipes_to_query_def], return_exceptions=True)

        definitions_by_pid: Dict[str, Dict[str, Any]] = {}
        for res in results:
            if isinstance(res, tuple) and res[1]:
                p, defn = res
                definitions_by_pid[str(p.get("id")).strip().lower()] = defn

        # First pass: discover all child pipelines invoked by ExecutePipeline activities
        for pid_lower, defn in definitions_by_pid.items():
            raw_acts = defn.get("properties", {}).get("activities", [])
            flat_acts = extract_all_canvas_activities(raw_acts)
            for act in flat_acts:
                atype = str(act.get("type", "")).lower()
                if "pipeline" in atype or atype == "executepipeline":
                    tp = act.get("typeProperties", {})
                    pref = tp.get("pipeline", {})
                    ref = pref.get("referenceName") or pref.get("pipelineName") or pref.get("pipelineId")
                    if ref:
                        ref_str = str(ref).strip().lower()
                        discovered_child_ids.add(ref_str)
                        target_name = pipe_by_id.get(ref_str) or ref
                        discovered_child_names.add(str(target_name).strip().lower())
                        if str(target_name).strip().lower() in pipe_by_name:
                            discovered_child_ids.add(pipe_by_name[str(target_name).strip().lower()])

        # Second pass: ONLY for pipelines with "No Runs" (unexecuted), persist their design-time canvas activities into ActivityRun
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        for p in pipelines:
            pid = str(p.get("id"))
            pid_lower = pid.lower()
            if pid_lower in pids_with_real_runs:
                # Optimized: Pipeline already has real execution runs in database; skip dummy placeholder activity generation
                continue

            defn = definitions_by_pid.get(pid_lower)
            if not defn:
                continue

            raw_acts = defn.get("properties", {}).get("activities", [])
            if not raw_acts:
                continue

            def_activities = []
            for act in raw_acts:
                act_name = act.get("name") or "Activity"
                act_type = act.get("type") or "General"
                child_pipe_stub = None

                atype_lower = str(act_type).lower()
                if "pipeline" in atype_lower or atype_lower == "executepipeline":
                    tp = act.get("typeProperties", {})
                    pref = tp.get("pipeline", {})
                    ref = pref.get("referenceName") or pref.get("pipelineName") or pref.get("pipelineId")
                    if ref:
                        ref_str = str(ref).strip().lower()
                        child_pid = pipe_by_name.get(ref_str) or ref_str
                        child_name = pipe_by_id.get(ref_str) or ref

                        # If child pipeline also has canvas definition, grab its activities too
                        child_inner_acts = []
                        child_defn = definitions_by_pid.get(child_pid.lower())
                        if child_defn:
                            c_raw_acts = child_defn.get("properties", {}).get("activities", [])
                            for c_act in c_raw_acts:
                                c_act_name = c_act.get("name") or "Activity"
                                c_act_type = c_act.get("type") or "General"
                                child_inner_acts.append({
                                    "activityRunId": f"def-{child_pid}-{c_act_name}",
                                    "pipelineRunId": f"norun-{child_pid}",
                                    "activityName": c_act_name,
                                    "activityType": c_act_type,
                                    "status": "Not Run",
                                    "startTime": None,
                                    "endTime": None,
                                    "durationInMs": 0,
                                    "error": None,
                                    "output": None,
                                })

                        child_pipe_stub = {
                            "id": f"norun-{child_pid}",
                            "pipelineId": child_pid,
                            "pipelineName": child_name,
                            "status": "Not Run",
                            "startTime": None,
                            "endTime": None,
                            "durationInMs": 0,
                            "error": None,
                            "activities": child_inner_acts,
                            "childPipelines": [],
                        }

                def_activities.append({
                    "activityRunId": f"def-{pid}-{act_name}",
                    "pipelineRunId": f"norun-{pid}",
                    "activityName": act_name,
                    "activityType": act_type,
                    "status": "Not Run",
                    "startTime": None,
                    "endTime": None,
                    "durationInMs": 0,
                    "error": None,
                    "output": None,
                    "childPipeline": child_pipe_stub,
                })

            if def_activities:
                try:
                    await pipeline_repository.save_activity_runs(f"norun-{pid}", def_activities, now_iso)
                except Exception as save_err:
                    logger.debug(f"Could not persist canvas definition activities for {pid}: {save_err}")

    async def sync_stage3_hierarchy(
        self,
        workspace_id: str,
        discovered_child_ids: Set[str],
        discovered_child_names: Set[str],
        pipelines: Optional[List[Dict[str, Any]]] = None,
        force_sync: bool = False,
    ) -> None:
        """Stage 3: Hierarchy Formation (~1s).
        - Inspects design-time canvas definitions to discover child activities and invoked pipelines before running.
        - Links child pipelines nested under master pipelines.
        - Updates is_master and parent flags in SQLite.
        - Broadcasts updated tree to live UI.
        """
        t0 = time.time()
        try:
            await connection_manager.broadcast_to_workspace(workspace_id, {
                "type": "SYNC_PROGRESS",
                "workspaceId": workspace_id,
                "stage": "hierarchy",
                "message": "Forming pipeline execution hierarchy...",
                "percent": 80,
            })
        except Exception:
            pass

        # Static Design Canvas Sync: Detect child pipelines and invoked activities before running
        try:
            await self.sync_canvas_definitions(
                workspace_id=workspace_id,
                pipelines=pipelines,
                discovered_child_ids=discovered_child_ids,
                discovered_child_names=discovered_child_names,
                force_sync=force_sync,
            )
        except Exception as def_err:
            logger.warning(f"Static canvas definition scanning skipped for {workspace_id}: {def_err}")

        await pipeline_repository.update_child_pipeline_flags(
            workspace_id, discovered_child_ids, discovered_child_names
        )

        try:
            hier_tree = await pipeline_repository.get_workspace_tree_by_date(workspace_id, date_preset="latest")
            if hier_tree and hier_tree.get("pipelines"):
                await connection_manager.broadcast_to_workspace(workspace_id, {
                    "type": "FULL_SNAPSHOT",
                    "workspaceId": workspace_id,
                    "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "viewersCount": connection_manager.get_viewer_count(workspace_id),
                    "data": hier_tree.get("pipelines", []),
                    "metrics": hier_tree.get("metrics"),
                    "isSyncComplete": False,
                })
        except Exception as hier_err:
            logger.debug(f"Stage 3 hierarchy broadcast skipped: {hier_err}")

        elapsed_s = round(time.time() - t0, 2)
        logger.info(f"\033[96m[CELERY]\033[0m [STAGE 3/4: HIERARCHY] Formed hierarchy ({len(discovered_child_ids)} child pipelines linked under masters) in {elapsed_s}s")

    async def continue_stages_after_stage1(
        self,
        workspace_id: str,
        pipelines: List[Dict[str, Any]],
        all_runs: List[Dict[str, Any]],
        pipeline_names: Dict[str, str],
        now_iso: str,
        force_sync: bool = False,
    ):
        """Asynchronously executes Stages 2, 3, and 4 in the background without blocking the caller."""
        try:
            ws_name = await fabric_client.resolve_workspace_name(workspace_id)
            semaphore = asyncio.Semaphore(settings.MAX_PARALLEL_FABRIC_REQUESTS)
            child_ids, child_names = await self.sync_stage2_activities(
                workspace_id, pipelines, all_runs, pipeline_names, now_iso, semaphore
            )
            await self.sync_stage3_hierarchy(workspace_id, child_ids, child_names, pipelines=pipelines, force_sync=force_sync)
            await self.sync_stage4_schedules(workspace_id, pipelines, now_iso, force=force_sync)
            self._last_workspace_sync[workspace_id] = time.time()
        except Exception as e:
            logger.error(f"Error continuing background stages for workspace {workspace_id}: {e}", exc_info=True)
        finally:
            self._sync_in_progress.discard(workspace_id)
            self._active_sync_tasks.pop(workspace_id, None)

    async def sync_workspace_with_fabric(self, workspace_id: str, force_sync: bool = False) -> List[Dict[str, Any]]:
        """Synchronizes Fabric pipeline executions into SQLite via 4 progressive stages:
        1. Catalog & Status (< 2-3s)
        2. Activities & Diagnostics (~3-4s)
        3. Hierarchy Formation (~1s)
        4. Schedules & Triggers (~2s)
        """
        if workspace_id in self._sync_in_progress and not force_sync:
            if workspace_id in self._active_sync_tasks:
                task = self._active_sync_tasks.get(workspace_id)
                if task and task is not asyncio.current_task() and not task.done():
                    try:
                        await task
                    except Exception:
                        pass
            return await pipeline_repository.get_workspace_latest_tree(workspace_id)

        cur_task = asyncio.current_task()
        if cur_task:
            self._active_sync_tasks[workspace_id] = cur_task
        self._sync_in_progress.add(workspace_id)
        t_start = time.time()
        try:
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            ws_name = await fabric_client.resolve_workspace_name(workspace_id)
            logger.info(f"\033[96m[CELERY]\033[0m 🚀 [Workspace: {ws_name}] Starting Staged Pipeline Synchronization")

            # Stage 1: Fast Catalog & Status (< 2-3s)
            pipelines, all_runs, pipeline_names = await self.sync_stage1_catalog_and_status(
                workspace_id, force_sync=force_sync, now_iso=now_iso
            )
            if not pipelines:
                return await pipeline_repository.get_workspace_latest_tree(workspace_id)

            # Stage 2: Latest Activities & SLA Diagnostics (~3-4s)
            semaphore = asyncio.Semaphore(settings.MAX_PARALLEL_FABRIC_REQUESTS)
            child_ids, child_names = await self.sync_stage2_activities(
                workspace_id, pipelines, all_runs, pipeline_names, now_iso, semaphore
            )

            # Stage 3: Hierarchy Formation (~1s)
            await self.sync_stage3_hierarchy(workspace_id, child_ids, child_names, pipelines=pipelines, force_sync=force_sync)

            # Stage 4: Schedules (~2s Background)
            await self.sync_stage4_schedules(workspace_id, pipelines, now_iso, force=force_sync)

            self._last_workspace_sync[workspace_id] = time.time()
            total_elapsed = round(time.time() - t_start, 2)
            logger.info(f"\033[92m[CELERY]\033[0m ✅ [Workspace: {ws_name}] Full Sync Completed in {total_elapsed}s")
            return await pipeline_repository.get_workspace_latest_tree(workspace_id)

        except Exception as e:
            logger.error(f"Error syncing workspace {workspace_id} with Fabric: {e}", exc_info=True)
            return await pipeline_repository.get_workspace_latest_tree(workspace_id)
        finally:
            self._sync_in_progress.discard(workspace_id)
            self._active_sync_tasks.pop(workspace_id, None)

    async def sync_stage4_schedules(
        self,
        workspace_id: str,
        pipelines: List[Dict[str, Any]],
        updated_at: str,
        force: bool = False,
    ) -> None:
        """Stage 4: Schedules & Triggers Synchronization (Background Async).
        - Extends schedule cache TTL to 10 minutes (600s).
        - Concurrently queries schedule definitions with semaphore of 8.
        - Persists schedules to Azure SQL.
        - Broadcasts final snapshot with isSyncComplete=True.
        """
        t0 = time.time()
        try:
            ws_name = await fabric_client.resolve_workspace_name(workspace_id)
            cached_schedules = await pipeline_repository.get_pipeline_schedules(workspace_id)

            now_ts = time.time()
            last_sched_sync = self._last_schedule_sync.get(workspace_id, 0)
            is_cache_fresh = not force and cached_schedules and ((now_ts - last_sched_sync) < 600.0)  # 10 minutes TTL

            if is_cache_fresh:
                ttl_left = int(600.0 - (now_ts - last_sched_sync))
                elapsed_s = round(time.time() - t0, 2)
                logger.info(f"\033[96m[CELERY]\033[0m ⏰ [STAGE 4/4: SCHEDULES] Schedules fresh in cache ({len(cached_schedules)} records, TTL: {ttl_left}s) in {elapsed_s}s")
            else:
                self._last_schedule_sync[workspace_id] = now_ts
                try:
                    await connection_manager.broadcast_to_workspace(workspace_id, {
                        "type": "SYNC_PROGRESS",
                        "workspaceId": workspace_id,
                        "stage": "schedules",
                        "message": "Syncing pipeline schedules & triggers...",
                        "percent": 90,
                    })
                except Exception:
                    pass

                semaphore = asyncio.Semaphore(8)

                async def _fetch_sched(p: Dict[str, Any]) -> Dict[str, Any]:
                    """Fetches schedule metadata for a single pipeline."""
                    pid = p.get("id")
                    pname = p.get("displayName")
                    async with semaphore:
                        sched_data = await fabric_client.get_pipeline_schedules(workspace_id, pid)
                    all_scheds = _parse_schedules_payload(sched_data)
                    active = [s for s in all_scheds if s.get("enabled")]
                    primary = active[0] if active else (all_scheds[0] if all_scheds else None)

                    if primary:
                        return {
                            "pipelineId": pid,
                            "pipelineName": pname,
                            "enabled": bool(active),
                            "scheduleType": primary.get("scheduleType", "Custom"),
                            "nextRunTime": primary.get("nextRunTime"),
                            "timeZone": primary.get("timeZone", "UTC"),
                            "schedules": all_scheds,
                            "rawConfiguration": {"schedules": all_scheds, "raw": sched_data},
                        }
                    return {
                        "pipelineId": pid,
                        "pipelineName": pname,
                        "enabled": False,
                        "scheduleType": "Manual / None",
                        "nextRunTime": None,
                        "timeZone": None,
                        "schedules": [],
                        "rawConfiguration": sched_data,
                    }

                schedules = await asyncio.gather(*[_fetch_sched(p) for p in pipelines], return_exceptions=False)
                await pipeline_repository.save_schedules(workspace_id, schedules, updated_at)

                scheduled_count = sum(1 for s in schedules if s.get("enabled"))
                elapsed_s = round(time.time() - t0, 2)
                logger.info(f"\033[96m[CELERY]\033[0m ⏰ [STAGE 4/4: SCHEDULES] Synchronized schedules ({scheduled_count} active schedules saved) in {elapsed_s}s")

            # Final broadcast with isSyncComplete=True
            tree_data = await pipeline_repository.get_workspace_tree_by_date(workspace_id, date_preset="latest")
            await connection_manager.broadcast_to_workspace(workspace_id, {
                "type": "FULL_SNAPSHOT",
                "workspaceId": workspace_id,
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "viewersCount": connection_manager.get_viewer_count(workspace_id),
                "data": tree_data.get("pipelines", []),
                "metrics": tree_data.get("metrics"),
                "isSyncComplete": True,
            })
            await connection_manager.broadcast_to_workspace(workspace_id, {
                "type": "SYNC_PROGRESS",
                "workspaceId": workspace_id,
                "stage": "complete",
                "message": "Sync complete",
                "percent": 100,
            })
        except Exception as e:
            logger.error(f"Error syncing schedules for workspace {workspace_id}: {e}", exc_info=True)

    async def _sync_schedules(self, workspace_id: str, pipelines: List[Dict[str, Any]], updated_at: str, force: bool = False, is_initial_sync: bool = True):
        """Backward-compatible alias for sync_stage4_schedules."""
        await self.sync_stage4_schedules(workspace_id, pipelines, updated_at, force=force)

    async def _poll_loop(self):
        """Leased poller loop: only polls workspaces with active viewers."""
        while self._is_running:
            try:
                active_workspaces = connection_manager.get_active_workspace_ids()
                if not active_workspaces:
                    await asyncio.sleep(3.0)
                    continue

                if settings.CELERY_ENABLED:
                    await self._dispatch_celery_polls(active_workspaces)
                    await asyncio.sleep(5.0)
                    continue

                has_any_running = False
                for ws_id in active_workspaces:
                    await self.sync_workspace_with_fabric(ws_id)
                    tree_data = await pipeline_repository.get_workspace_tree_by_date(ws_id, date_preset="latest")
                    snapshot = tree_data.get("pipelines", [])
                    metrics = tree_data.get("metrics")

                    if any(str(p.get("status", "")).lower() in ("inprogress", "running") for p in (snapshot or [])):
                        has_any_running = True

                    message = {
                        "type": "FULL_SNAPSHOT",
                        "workspaceId": ws_id,
                        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        "viewersCount": connection_manager.get_viewer_count(ws_id),
                        "data": snapshot,
                        "metrics": metrics,
                        "isSyncComplete": True,
                    }
                    await connection_manager.broadcast_to_workspace(ws_id, message)

                sleep_interval = settings.POLL_INTERVAL_ACTIVE_SECONDS if has_any_running else settings.POLL_INTERVAL_IDLE_SECONDS
                await asyncio.sleep(sleep_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in LeasedWorkspacePoller main loop: {e}", exc_info=True)
                await asyncio.sleep(5.0)

    async def _dispatch_celery_polls(self, active_workspaces: List[str]) -> None:
        """Dispatch a per-workspace Celery poll task for each active viewer room.

        Workspaces already being synced (lock held or recent sync cooldown) are skipped.
        """
        from app.core.event_bus import event_bus
        try:
            from app.modules.pipelines.tasks import poll_workspace_task
        except Exception as e:
            logger.error(f"Unable to import Celery poll task: {e}")
            return

        now = time.time()
        for ws_id in active_workspaces:
            try:
                if await event_bus.is_locked(f"poll:{ws_id}"):
                    continue
                last_sync = self._last_workspace_sync.get(ws_id, 0)
                # Adaptive Dual-Speed: 15s if a pipeline is currently executing, 60s if idle
                latest = await pipeline_repository.get_workspace_latest_tree(ws_id)
                has_running = any(
                    str(p.get("status", "")).lower() in ("inprogress", "running")
                    for p in (latest or [])
                )
                min_interval = 15.0 if has_running else 60.0
                if (now - last_sync) < min_interval:
                    continue
                self._last_workspace_sync[ws_id] = now
                poll_workspace_task.delay(ws_id, False)

            except Exception as e:
                logger.error(f"Celery poll dispatch failed for {ws_id}: {e}")


leased_poller = LeasedWorkspacePoller()

__all__ = [
    "LeasedWorkspacePoller",
    "leased_poller",
]
