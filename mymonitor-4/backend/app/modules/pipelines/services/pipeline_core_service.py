"""
Core domain service for pipeline catalog, execution history, real-time tree snapshots, and schedule lookups.
"""

import asyncio
import datetime
import logging
import math
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.modules.pipelines.helpers import nest_activity_runs
from app.modules.pipelines.repository import pipeline_repository
from app.modules.pipelines.schema import PipelineSchedule
from app.modules.pipelines.services.leased_poller_service import leased_poller
from app.modules.pipelines.services.schedule_parser import _parse_schedules_payload
from app.modules.sla.repository import sla_repository
from app.shared.clients.fabric_client import fabric_client
from app.shared.constants import (
    DEFAULT_PIPELINE_NAME,
    DEFAULT_SLA1_MINUTES,
    DEFAULT_SLA2_MINUTES,
)

logger = logging.getLogger("fabric_monitor.pipelines.services.core")


class PipelineService:
    """Core domain service for pipeline catalog, execution history,
    real-time tree snapshots, and schedule lookups.
    """

    async def list_pipelines(self, workspace_id: str, parent_only: bool = True) -> List[Dict[str, Any]]:
        """Returns Data Pipelines inside the selected workspace.
        When parent_only=True (default), returns parent (master) and independent pipelines (is_master=1),
        filtering out dynamically invoked child pipelines.
        """
        if parent_only:
            parents = await pipeline_repository.get_parent_pipelines(workspace_id)
            if not parents:
                try:
                    fabric_pipes = await fabric_client.get_pipelines(workspace_id)
                    if fabric_pipes:
                        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
                        await pipeline_repository.save_pipelines(workspace_id, fabric_pipes, now_iso)
                        await pipeline_repository.update_child_pipeline_flags(workspace_id, set(), set())
                        parents = await pipeline_repository.get_parent_pipelines(workspace_id)
                except Exception as exc:
                    logger.error(f"Error listing parent pipelines for {workspace_id}: {exc}")
            return [
                {
                    "id": p.get("pipelineId") or p.get("id"),
                    "displayName": p.get("pipelineName") or p.get("displayName"),
                    "pipelineId": p.get("pipelineId") or p.get("id"),
                    "pipelineName": p.get("pipelineName") or p.get("displayName"),
                    "is_master": 1,
                }
                for p in (parents or [])
            ]

        return await fabric_client.get_pipelines(workspace_id)

    async def get_workspace_snapshot(
        self,
        workspace_id: str,
        force_sync: bool = False,
        date_preset: Optional[str] = "latest",
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Returns the real-time hierarchical pipeline and activity runs tree with date filtering."""
        preset = (date_preset or "latest").lower().strip()
        if force_sync:
            await leased_poller.fetch_workspace_snapshot(workspace_id, force_sync=True)

        date_tree = await pipeline_repository.get_workspace_tree_by_date(
            workspace_id=workspace_id,
            date_preset=preset,
            start_date=start_date,
            end_date=end_date,
        )

        # Check if Celery is actively syncing this workspace right now
        is_celery_syncing = False
        if settings.CELERY_ENABLED:
            from app.core.event_bus import event_bus
            is_celery_syncing = await event_bus.is_locked(f"poll:{workspace_id}")

        pipes = date_tree.get("pipelines", [])
        has_real_runs = any(
            p.get("status") not in ("No Runs", "Not Run", "None", "")
            and not str(p.get("id", "")).startswith("norun-")
            for p in pipes
        )

        # If Celery is syncing right now and we don't have ANY pipelines in DB yet, await discovery
        if is_celery_syncing and not pipes:
            logger.info(f"Celery is discovering pipelines for workspace {workspace_id}. Awaiting initial catalog...")
            for _ in range(25):  # wait up to 10s (0.4s intervals)
                await asyncio.sleep(0.4)
                if not await event_bus.is_locked(f"poll:{workspace_id}"):
                    break
            date_tree = await pipeline_repository.get_workspace_tree_by_date(
                workspace_id=workspace_id,
                date_preset=preset,
                start_date=start_date,
                end_date=end_date,
            )
            pipes = date_tree.get("pipelines", [])

        # If workspace currently has 0 pipelines in DB, perform Stage 1 inline to populate catalog in <2-3s,
        # then launch Stages 2-4 in background so the UI renders immediately!
        if not pipes and not force_sync:
            logger.info(f"Workspace {workspace_id} has no cached pipelines in DB. Performing fast Stage 1 catalog sync...")
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            cur_task = asyncio.current_task()
            if cur_task:
                leased_poller._active_sync_tasks[workspace_id] = cur_task
            leased_poller._sync_in_progress.add(workspace_id)
            try:
                pipelines, all_runs, pipeline_names = await leased_poller.sync_stage1_catalog_and_status(
                    workspace_id, force_sync=False, now_iso=now_iso
                )
                if pipelines:
                    # Dispatch Stages 2-4 in background task so this REST endpoint unblocks immediately (<2-3s)!
                    asyncio.create_task(
                        leased_poller.continue_stages_after_stage1(
                            workspace_id, pipelines, all_runs, pipeline_names, now_iso, force_sync=False
                        )
                    )
            except Exception as e:
                logger.error(f"Error during initial Stage 1 sync for {workspace_id}: {e}")
                leased_poller._sync_in_progress.discard(workspace_id)
                leased_poller._active_sync_tasks.pop(workspace_id, None)

            date_tree = await pipeline_repository.get_workspace_tree_by_date(
                workspace_id=workspace_id,
                date_preset=preset,
                start_date=start_date,
                end_date=end_date,
            )
            pipes = date_tree.get("pipelines", [])

        # Attach real-time sync state so frontend knows if sync is still underway
        is_syncing = (workspace_id in leased_poller._sync_in_progress) or is_celery_syncing
        date_tree["isSyncing"] = is_syncing

        return date_tree

    async def get_workspace_tree(self, workspace_id: str) -> Dict[str, Any]:
        """Get the latest parent-child pipeline tree with 0 orphan rows."""
        return await self.get_workspace_snapshot(workspace_id, force_sync=False, date_preset="latest")

    async def run_pipeline(
        self, workspace_id: str, pipeline_id: str, execution_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Triggers a pipeline run in Fabric and immediately pushes real-time updates via Celery/WebSocket."""
        res = await fabric_client.run_pipeline(workspace_id, pipeline_id, execution_data)

        # Dispatch immediate sync via Celery or background task to reflect real-time status instantly
        if settings.CELERY_ENABLED:
            try:
                from app.modules.pipelines.tasks import poll_workspace_task
                poll_workspace_task.delay(workspace_id, force=True)
            except Exception as e:
                logger.error(f"Celery dispatch failed after run trigger: {e}")
                asyncio.create_task(leased_poller.fetch_workspace_snapshot(workspace_id, force_sync=True))
        else:
            asyncio.create_task(leased_poller.fetch_workspace_snapshot(workspace_id, force_sync=True))

        return res

    async def get_pipeline_history(
        self,
        workspace_id: str,
        pipeline_id: str,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Get chronological execution history for a pipeline with optional server-side pagination."""
        runs, total = await pipeline_repository.get_pipeline_history_paginated(
            workspace_id, pipeline_id, page=page, page_size=page_size
        )
        if total == 0 and not runs:
            instances = await fabric_client.get_job_instances(workspace_id, pipeline_id)
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            if instances:
                await pipeline_repository.save_pipeline_runs(workspace_id, instances, now_iso)
            total = len(instances)
            if page is not None and page_size is not None and page > 0 and page_size > 0:
                start = (page - 1) * page_size
                instances = instances[start : start + page_size]
            total_pages = math.ceil(total / page_size) if page_size and page_size > 0 else 1
            return {
                "workspaceId": workspace_id,
                "pipelineId": pipeline_id,
                "runs": instances,
                "total": total,
                "page": page or 1,
                "pageSize": page_size or total,
                "totalPages": max(1, total_pages),
            }

        total_pages = math.ceil(total / page_size) if page_size and page_size > 0 else 1
        return {
            "workspaceId": workspace_id,
            "pipelineId": pipeline_id,
            "runs": runs,
            "total": total,
            "page": page or 1,
            "pageSize": page_size or len(runs),
            "totalPages": max(1, total_pages),
        }

    async def get_run_activities(self, workspace_id: str, pipeline_id: str, run_id: str) -> List[Dict[str, Any]]:
        """Returns activities for a specific run from SQLite, or fetches from Fabric on demand if missing."""
        acts = await pipeline_repository.get_activities_for_run(run_id)
        if acts:
            return nest_activity_runs(acts)

        target_run = await pipeline_repository.get_pipeline_run(run_id)
        st = target_run.get("startTime") if target_run else None
        et = target_run.get("endTime") if target_run else None

        pipes = await pipeline_repository.get_workspace_latest_tree(workspace_id)
        pipeline_names = {p.get("pipelineId") or p.get("id"): p.get("pipelineName") or p.get("name") for p in pipes}
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        semaphore = asyncio.Semaphore(settings.MAX_PARALLEL_FABRIC_REQUESTS)
        fetched = await leased_poller._fetch_activity_tree(
            workspace_id=workspace_id,
            pipeline_id=pipeline_id,
            run_id=run_id,
            start_utc=st,
            end_utc=et,
            pipeline_names=pipeline_names,
            semaphore=semaphore,
            now_iso=now_iso,
            enable_alerting=False,
            depth=0,
            max_depth=3,
        )
        return nest_activity_runs(fetched)

    async def get_pipeline_schedule(self, workspace_id: str, pipeline_id: str) -> Dict[str, Any]:
        """Returns all schedule configurations for a single pipeline."""
        sched_data = await fabric_client.get_pipeline_schedules(workspace_id, pipeline_id)
        all_schedules = _parse_schedules_payload(sched_data)

        if not all_schedules:
            cached = await pipeline_repository.get_schedule_for_pipeline(workspace_id, pipeline_id)
            if cached:
                cached_raw = cached.get("rawConfiguration") or {}
                all_schedules = _parse_schedules_payload(cached_raw)
                if not all_schedules and cached.get("enabled"):
                    all_schedules = [{
                        "id": "cached_sched",
                        "enabled": cached.get("enabled", False),
                        "scheduleType": cached.get("scheduleType", "Manual / None"),
                        "timeZone": cached.get("timeZone", "UTC"),
                        "nextRunTime": cached.get("nextRunTime"),
                        "times": [],
                        "days": [],
                        "rawConfiguration": cached_raw,
                    }]

        active_schedules = [s for s in all_schedules if s.get("enabled")]
        primary = active_schedules[0] if active_schedules else (all_schedules[0] if all_schedules else None)

        return {
            "pipelineId": pipeline_id,
            "enabled": bool(active_schedules),
            "totalSchedules": len(all_schedules),
            "scheduleType": primary.get("scheduleType") if primary else "Manual / None",
            "nextRunTime": primary.get("nextRunTime") if primary else None,
            "timeZone": primary.get("timeZone") if primary else "UTC",
            "schedules": all_schedules,
            "rawConfiguration": sched_data,
        }

    async def get_workspace_schedules(self, workspace_id: str) -> List[PipelineSchedule]:
        """Returns upcoming schedules and next execution times for pipelines in the workspace."""
        cached = await pipeline_repository.get_pipeline_schedules(workspace_id)
        if cached:
            return [PipelineSchedule(**c) for c in cached]

        pipelines = await fabric_client.get_pipelines(workspace_id)
        schedules: List[PipelineSchedule] = []

        for p in pipelines:
            pid = p.get("id")
            p_name = p.get("displayName") or p.get("name") or DEFAULT_PIPELINE_NAME
            sched_data = await fabric_client.get_pipeline_schedules(workspace_id, pid)
            all_s = _parse_schedules_payload(sched_data)
            active = [s for s in all_s if s.get("enabled")]
            primary = active[0] if active else (all_s[0] if all_s else None)

            if primary:
                schedules.append(PipelineSchedule(
                    pipelineId=pid,
                    pipelineName=p_name,
                    enabled=bool(active),
                    scheduleType=primary.get("scheduleType", "Custom"),
                    nextRunTime=primary.get("nextRunTime"),
                    timeZone=primary.get("timeZone", "UTC"),
                    schedules=all_s,
                    rawConfiguration={"schedules": all_s, "raw": sched_data},
                ))
            else:
                schedules.append(PipelineSchedule(
                    pipelineId=pid,
                    pipelineName=p_name,
                    enabled=False,
                    scheduleType="Manual / None",
                    nextRunTime=None,
                    timeZone=None,
                    schedules=[],
                    rawConfiguration=sched_data,
                ))

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        await pipeline_repository.save_schedules(workspace_id, [s.model_dump() for s in schedules], now_iso)
        return schedules

    async def list_parent_pipelines(self, workspace_id: str, force_sync: bool = False) -> List[Dict[str, Any]]:
        """Returns parent (master) pipelines for a workspace with their SLA1/SLA2 config."""
        parents = await pipeline_repository.get_parent_pipelines(workspace_id)
        if not parents or force_sync:
            try:
                fabric_pipes = await fabric_client.get_pipelines(workspace_id)
                if fabric_pipes:
                    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
                    await pipeline_repository.save_pipelines(workspace_id, fabric_pipes, now_iso)
                    await pipeline_repository.update_child_pipeline_flags(workspace_id, set(), set())
                    parents = await pipeline_repository.get_parent_pipelines(workspace_id)
                    if not parents:
                        parents = [
                            {"pipelineId": p["id"], "pipelineName": p.get("displayName") or p.get("name") or DEFAULT_PIPELINE_NAME}
                            for p in fabric_pipes
                        ]
                    asyncio.create_task(leased_poller.fetch_workspace_snapshot(workspace_id, force_sync=force_sync))
            except Exception as exc:
                logger.error(f"Error syncing parent pipelines from Fabric: {exc}")

        sla_by_pid = await sla_repository.get_sla_configs_for_workspace(workspace_id)
        for p in parents:
            cfg = sla_by_pid.get(p["pipelineId"])
            p["sla1Minutes"] = cfg["sla1Minutes"] if cfg else None
            p["sla2Minutes"] = cfg["sla2Minutes"] if cfg else None
            p["domain"] = cfg["domain"] if cfg else ""
        return parents

    async def get_workspace_pipeline_assignments(self, workspace_id: str, force_sync: bool = False) -> List[Dict[str, Any]]:
        """Returns all parent pipelines for the workspace along with their per-pipeline L1 and L2 assignees."""
        pipelines = await pipeline_repository.get_parent_pipelines(workspace_id)
        if not pipelines or force_sync:
            try:
                fabric_pipes = await fabric_client.get_pipelines(workspace_id)
                if fabric_pipes:
                    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
                    await pipeline_repository.save_pipelines(workspace_id, fabric_pipes, now_iso)
                    await pipeline_repository.update_child_pipeline_flags(workspace_id, set(), set())
                    pipelines = await pipeline_repository.get_parent_pipelines(workspace_id)
                    if not pipelines:
                        pipelines = [
                            {"pipelineId": p["id"], "pipelineName": p.get("displayName") or p.get("name") or DEFAULT_PIPELINE_NAME}
                            for p in fabric_pipes
                        ]
                    asyncio.create_task(leased_poller.fetch_workspace_snapshot(workspace_id, force_sync=force_sync))
            except Exception as exc:
                logger.error(f"Error syncing pipelines from Fabric for workspace {workspace_id}: {exc}")

        sla_map = await sla_repository.get_sla_configs_for_workspace(workspace_id)
        results = []
        for p in pipelines:
            pid = p["pipelineId"]
            sla_info = sla_map.get(pid, {})
            results.append({
                "pipelineId": pid,
                "pipelineName": p["pipelineName"],
                "workspaceId": workspace_id,
                "l1Email": sla_info.get("l1Email") or "",
                "l1Name": sla_info.get("l1Name") or "",
                "l2Email": sla_info.get("l2Email") or "",
                "l2Name": sla_info.get("l2Name") or "",
                "sla1Minutes": sla_info.get("sla1Minutes", DEFAULT_SLA1_MINUTES),
                "sla2Minutes": sla_info.get("sla2Minutes", DEFAULT_SLA2_MINUTES),
                "domain": sla_info.get("domain") or "",
            })
        return results


pipeline_service = PipelineService()

__all__ = [
    "PipelineService",
    "pipeline_service",
]
