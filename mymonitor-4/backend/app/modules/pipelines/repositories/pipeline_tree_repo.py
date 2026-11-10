import datetime
import json
import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select, or_

from app.db.session import async_session_maker
from app.modules.pipelines.helpers import nest_activity_runs
from app.modules.pipelines.models.activity_run import ActivityRun
from app.modules.pipelines.models.pipeline import Pipeline
from app.modules.pipelines.models.pipeline_run import PipelineRun
from app.modules.pipelines.models.pipeline_schedule import PipelineSchedule
from app.modules.sla.models.sla_config import SLAConfig
from app.modules.sla.models.sla_incident import SLAIncident
from app.shared.utils import calculate_duration_ms, normalize_iso_utc

logger = logging.getLogger("fabric_monitor.pipelines.repo.tree")


class PipelineTreeRepository:
    """Repository constructing hierarchical execution trees, container nesting, and date-filtered snapshots."""

    @staticmethod
    def _index_sla_configs(sla_rows: List[SLAConfig], workspace_id: str) -> Dict[str, Dict[str, Any]]:
        """Indexes SLA configuration rows by pipeline_id."""
        return {
            s.pipeline_id: {
                "pipelineId": s.pipeline_id,
                "workspaceId": workspace_id,
                "l1Email": s.l1_email or "",
                "l1Name": s.l1_name or "",
                "l2Email": s.l2_email or "",
                "l2Name": s.l2_name or "",
                "slaMinutes": s.sla_minutes,
                "sla1Minutes": s.sla1_minutes if s.sla1_minutes is not None else (s.sla_minutes or 30),
                "sla2Minutes": s.sla2_minutes if s.sla2_minutes is not None else ((s.sla_minutes * 2) if s.sla_minutes else 60),
                "domain": s.domain or "",
            }
            for s in sla_rows
        }

    @staticmethod
    def _index_incidents(incident_rows: List[SLAIncident]) -> tuple[Dict[str, Dict[str, Any]], Dict[str, Dict[str, Any]], Dict[str, Dict[str, Any]]]:
        """Indexes incident rows by pipeline_run_id and active incidents by pipeline_id."""
        incident_by_run_id: Dict[str, Dict[str, Any]] = {}
        active_incident_by_pid: Dict[str, Dict[str, Any]] = {}
        latest_incident_by_pid: Dict[str, Dict[str, Any]] = {}
        for inc in incident_rows:
            run_id = inc.pipeline_run_id
            inc_dict = {
                "id": inc.id,
                "pipeline_id": inc.pipeline_id,
                "pipelineId": inc.pipeline_id,
                "pipeline_name": inc.pipeline_name,
                "pipelineName": inc.pipeline_name,
                "pipeline_run_id": inc.pipeline_run_id,
                "pipelineRunId": inc.pipeline_run_id,
                "workspace_id": inc.workspace_id,
                "workspaceId": inc.workspace_id,
                "status": inc.status,
                "failed_at": normalize_iso_utc(inc.failed_at),
                "failedAt": normalize_iso_utc(inc.failed_at),
                "sla_target_time": normalize_iso_utc(inc.sla_target_time),
                "slaTargetTime": normalize_iso_utc(inc.sla_target_time),
                "l1_notified_at": normalize_iso_utc(inc.l1_notified_at),
                "l1NotifiedAt": normalize_iso_utc(inc.l1_notified_at),
                "l2_escalated_at": normalize_iso_utc(inc.l2_escalated_at),
                "l2EscalatedAt": normalize_iso_utc(inc.l2_escalated_at),
                "resolved_at": normalize_iso_utc(inc.resolved_at),
                "resolvedAt": normalize_iso_utc(inc.resolved_at),
                "resolved_by": inc.resolved_by,
                "resolvedBy": inc.resolved_by,
                "error_message": inc.error_message,
                "errorMessage": inc.error_message,
            }
            if run_id and run_id not in incident_by_run_id:
                incident_by_run_id[run_id] = inc_dict
            if inc.id and inc.id.startswith("inc_"):
                clean_run = inc.id[4:]
                if clean_run not in incident_by_run_id:
                    incident_by_run_id[clean_run] = inc_dict
            if inc.pipeline_id and inc.status in ("ACTIVE", "ESCALATED_L2", "CRITICAL_UNRESOLVED") and inc.pipeline_id not in active_incident_by_pid:
                active_incident_by_pid[inc.pipeline_id] = inc_dict
            if inc.pipeline_id and inc.pipeline_id not in latest_incident_by_pid:
                latest_incident_by_pid[inc.pipeline_id] = inc_dict
        return incident_by_run_id, active_incident_by_pid, latest_incident_by_pid

    @staticmethod
    def _resolve_failed_incident(
        run_id: str,
        pid: str,
        pname: str,
        run_status: str,
        fail_err: Any,
        st_norm: Optional[str],
        et_norm: Optional[str],
        workspace_id: str,
        sla_cfg: Dict[str, Any],
        incident_by_run_id: Dict[str, Dict[str, Any]],
        active_incident_by_pid: Dict[str, Dict[str, Any]],
        latest_incident_by_pid: Optional[Dict[str, Dict[str, Any]]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Resolves existing incident or synthesizes fallback active incident for failed run."""
        inc = incident_by_run_id.get(run_id)
        if not inc and active_incident_by_pid.get(pid):
            cand = active_incident_by_pid.get(pid)
            if cand.get("pipeline_run_id") == run_id:
                inc = cand
        if not inc and latest_incident_by_pid and latest_incident_by_pid.get(pid):
            cand = latest_incident_by_pid.get(pid)
            if cand.get("pipeline_run_id") == run_id:
                inc = cand

        sla1_min = int(sla_cfg.get("sla1Minutes") or sla_cfg.get("slaMinutes") or 30)
        sla2_min = int(sla_cfg.get("sla2Minutes") or (sla1_min * 2))
        add_sla2_min = (sla2_min - sla1_min) if sla2_min > sla1_min else sla2_min

        if not inc and str(run_status).lower() in ("failed", "failure"):
            failed_at_time = et_norm or st_norm or datetime.datetime.now(datetime.timezone.utc).isoformat()
            try:
                f_dt = datetime.datetime.fromisoformat(str(failed_at_time).replace("Z", "+00:00"))
                if f_dt.tzinfo is None:
                    f_dt = f_dt.replace(tzinfo=datetime.timezone.utc)
            except Exception:
                f_dt = datetime.datetime.now(datetime.timezone.utc)
            target_dt = f_dt + datetime.timedelta(minutes=sla1_min)
            sla2_target_dt = target_dt + datetime.timedelta(minutes=add_sla2_min)
            err_msg = fail_err.get("message") if isinstance(fail_err, dict) else str(fail_err or "Pipeline execution failed.")
            inc = {
                "id": f"inc_{run_id}",
                "pipeline_id": pid,
                "pipelineId": pid,
                "pipeline_name": pname,
                "pipelineName": pname,
                "pipeline_run_id": run_id,
                "pipelineRunId": run_id,
                "workspace_id": workspace_id,
                "workspaceId": workspace_id,
                "status": "ACTIVE",
                "failed_at": failed_at_time,
                "failedAt": failed_at_time,
                "sla_target_time": target_dt.isoformat(),
                "slaTargetTime": target_dt.isoformat(),
                "sla2_target_time": sla2_target_dt.isoformat(),
                "sla2TargetTime": sla2_target_dt.isoformat(),
                "l1_notified_at": None,
                "l1NotifiedAt": None,
                "l2_escalated_at": None,
                "l2EscalatedAt": None,
                "resolved_at": None,
                "resolvedAt": None,
                "resolved_by": None,
                "resolvedBy": None,
                "error_message": err_msg,
                "errorMessage": err_msg,
            }
        elif inc and not inc.get("sla2_target_time"):
            sla1_t = inc.get("sla_target_time") or inc.get("slaTargetTime")
            if sla1_t:
                try:
                    sla1_dt = datetime.datetime.fromisoformat(str(sla1_t).replace("Z", "+00:00"))
                    if sla1_dt.tzinfo is None:
                        sla1_dt = sla1_dt.replace(tzinfo=datetime.timezone.utc)
                    sla2_dt = sla1_dt + datetime.timedelta(minutes=add_sla2_min)
                    inc["sla2_target_time"] = sla2_dt.isoformat()
                    inc["sla2TargetTime"] = sla2_dt.isoformat()
                except Exception:
                    pass
        return inc

    @staticmethod
    def _build_pipeline_run_node(
        pid: str,
        pname: str,
        workspace_id: str,
        run_data: Optional[Dict[str, Any]],
        sla_cfg: Dict[str, Any],
        sched_info: Optional[Dict[str, Any]],
        incident_by_run_id: Dict[str, Dict[str, Any]],
        active_incident_by_pid: Dict[str, Dict[str, Any]],
        latest_incident_by_pid: Optional[Dict[str, Dict[str, Any]]] = None,
        no_run_status: str = "No Runs",
    ) -> Dict[str, Any]:
        """Constructs a normalized pipeline run object node with SLA config, incidents, and duration."""
        if run_data:
            run_id = run_data["id"]
            fail_err = None
            if run_data.get("failure_reason"):
                try:
                    fail_err = json.loads(run_data["failure_reason"])
                except Exception:
                    fail_err = None

            st_norm = normalize_iso_utc(run_data.get("start_time"))
            et_norm = normalize_iso_utc(run_data.get("end_time"))
            dur_ms = calculate_duration_ms(st_norm, et_norm, run_data.get("duration_in_ms"))

            inc = PipelineTreeRepository._resolve_failed_incident(
                run_id=run_id,
                pid=pid,
                pname=pname,
                run_status=run_data.get("status") or "",
                fail_err=fail_err,
                st_norm=st_norm,
                et_norm=et_norm,
                workspace_id=workspace_id,
                sla_cfg=sla_cfg,
                incident_by_run_id=incident_by_run_id,
                active_incident_by_pid=active_incident_by_pid,
                latest_incident_by_pid=latest_incident_by_pid,
            )

            node_status = run_data.get("status") or "Unknown"
            clean_st = str(node_status).lower()
            if clean_st in ("notstarted", "not started", "queued") and st_norm:
                node_status = "InProgress"

            return {
                "id": run_id,
                "pipelineId": pid,
                "pipelineName": pname,
                "workspaceId": workspace_id,
                "status": node_status,
                "startTime": st_norm,
                "endTime": et_norm,
                "durationInMs": dur_ms,
                "invokeType": run_data.get("invoke_type") or "Manual",
                "isChild": False,
                "parentRunId": None,
                "parentActivityName": None,
                "error": fail_err,
                "activities": [],
                "childPipelines": [],
                "slaConfig": sla_cfg,
                "domain": (sla_cfg.get("domain") or "") if sla_cfg else "",
                "incident": inc,
                "schedule": sched_info,
            }
        else:
            return {
                "id": f"norun-{pid}",
                "pipelineId": pid,
                "pipelineName": pname,
                "workspaceId": workspace_id,
                "status": no_run_status,
                "startTime": None,
                "endTime": None,
                "durationInMs": 0,
                "invokeType": "None",
                "isChild": False,
                "parentRunId": None,
                "parentActivityName": None,
                "error": None,
                "activities": [],
                "childPipelines": [],
                "slaConfig": sla_cfg,
                "domain": (sla_cfg.get("domain") or "") if sla_cfg else "",
                "incident": active_incident_by_pid.get(pid) or (latest_incident_by_pid.get(pid) if latest_incident_by_pid else None),
                "schedule": sched_info,
            }

    @staticmethod
    def _attach_activities_and_finalize(
        run_objects_by_id: Dict[str, Dict[str, Any]],
        act_rows: List[ActivityRun],
        pipelines_list: List[Dict[str, Any]],
        runs_lookup_by_id: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Parses activity runs, calculates durations, nests hierarchy, rolls up in-progress status, and sorts pipeline list."""
        for a in act_rows:
            prun_id = a.pipeline_run_id
            if prun_id in run_objects_by_id:
                err_val = None
                if a.error:
                    try:
                        err_val = json.loads(a.error)
                    except Exception:
                        pass
                out_val = None
                if a.output:
                    try:
                        out_val = json.loads(a.output)
                    except Exception:
                        pass

                child_pipe = None
                if a.child_pipeline_data:
                    try:
                        child_pipe = json.loads(a.child_pipeline_data)
                    except Exception:
                        pass

                c_run_id = a.child_pipeline_run_id or (out_val.get("pipelineRunId") or out_val.get("runId") if isinstance(out_val, dict) else None)
                if not child_pipe and c_run_id and runs_lookup_by_id and c_run_id in runs_lookup_by_id:
                    r_child = runs_lookup_by_id[c_run_id]
                    if isinstance(r_child, dict):
                        child_pipe = {
                            "id": r_child.get("id"),
                            "pipelineId": r_child.get("pipeline_id"),
                            "pipelineName": r_child.get("pipeline_name"),
                            "status": r_child.get("status"),
                            "startTime": r_child.get("start_time"),
                            "endTime": r_child.get("end_time"),
                            "durationInMs": r_child.get("duration_in_ms"),
                            "error": r_child.get("failure_reason"),
                            "activities": [],
                            "childPipelines": [],
                        }
                    else:
                        child_pipe = {
                            "id": getattr(r_child, "id", str(c_run_id)),
                            "pipelineId": getattr(r_child, "pipeline_id", ""),
                            "pipelineName": getattr(r_child, "pipeline_name", "Sub-pipeline"),
                            "status": getattr(r_child, "status", "Unknown"),
                            "startTime": getattr(r_child, "start_time", None),
                            "endTime": getattr(r_child, "end_time", None),
                            "durationInMs": getattr(r_child, "duration_in_ms", None),
                            "error": getattr(r_child, "failure_reason", None),
                            "activities": [],
                            "childPipelines": [],
                        }

                act_st = normalize_iso_utc(a.start_time)
                act_et = normalize_iso_utc(a.end_time)
                act_dur = calculate_duration_ms(act_st, act_et, a.duration_in_ms)

                run_objects_by_id[prun_id]["activities"].append({
                    "activityRunId": a.activity_run_id,
                    "pipelineRunId": prun_id,
                    "activityName": a.activity_name,
                    "activityType": a.activity_type,
                    "status": a.status,
                    "activityRunStart": act_st,
                    "activityRunEnd": act_et,
                    "durationInMs": act_dur,
                    "error": err_val,
                    "output": out_val,
                    "childPipelineRunId": str(c_run_id) if c_run_id else a.child_pipeline_run_id,
                    "childPipeline": child_pipe,
                })

        def _is_item_in_progress(item: Dict[str, Any]) -> bool:
            """Recursively checks if an activity or nested child pipeline is in progress."""
            st = str(item.get("status") or "").lower()
            if st in ("inprogress", "running"):
                return True
            cp = item.get("childPipeline")
            if cp and isinstance(cp, dict):
                if str(cp.get("status") or "").lower() in ("inprogress", "running"):
                    return True
                for sub_act in cp.get("activities", []):
                    if _is_item_in_progress(sub_act):
                        return True
            for inner_a in item.get("activities", []):
                if _is_item_in_progress(inner_a):
                    return True
            return False

        for r_obj in pipelines_list:
            acts = r_obj.get("activities") or []
            if (r_obj["durationInMs"] is None or r_obj["durationInMs"] == 0) and acts:
                act_sum = sum(a.get("durationInMs") or 0 for a in acts)
                if act_sum > 0:
                    r_obj["durationInMs"] = act_sum

            # Status Rollup: If any activity or nested subpipeline is actively running, promote parent pipeline status to InProgress
            if any(_is_item_in_progress(a) for a in acts):
                r_obj["status"] = "InProgress"
            else:
                current_st = str(r_obj.get("status") or "").lower()
                if current_st in ("notstarted", "not started", "queued") and acts:
                    r_obj["status"] = "InProgress"

            if acts:
                r_obj["activities"] = nest_activity_runs(acts)

        pipelines_list.sort(
            key=lambda x: (
                x.get("startTime") is not None,
                x.get("startTime") or "",
                x.get("pipelineName", ""),
            ),
            reverse=True,
        )

    async def get_workspace_latest_tree(self, workspace_id: str) -> List[Dict[str, Any]]:
        """
        Builds the latest execution hierarchy directly from SQLite:
        - 1 row per master pipeline showing ONLY its latest run.
        - Sub-pipelines are strictly nested inside parent activities.
        - Attaches SLA config, active incident, and schedule summary.
        """
        async with async_session_maker() as session:
            # Discover any pipeline ID that has been invoked as a child run or has is_child / parent_run_id
            child_run_stmt = select(ActivityRun.child_pipeline_run_id).where(
                ActivityRun.child_pipeline_run_id.isnot(None)
            )
            child_run_ids = {row[0] for row in (await session.execute(child_run_stmt)).all() if row[0]}

            child_pids_to_exclude = set()
            if child_run_ids:
                c_pipe_stmt = select(PipelineRun.pipeline_id).where(
                    PipelineRun.id.in_(child_run_ids),
                    PipelineRun.workspace_id == workspace_id,
                )
                child_pids_to_exclude.update({str(row[0]).strip().lower() for row in (await session.execute(c_pipe_stmt)).all() if row[0]})

            invoked_pipe_stmt = select(PipelineRun.pipeline_id).where(
                PipelineRun.workspace_id == workspace_id,
                or_(PipelineRun.is_child == 1, PipelineRun.parent_run_id.isnot(None)),
            )
            child_pids_to_exclude.update({str(row[0]).strip().lower() for row in (await session.execute(invoked_pipe_stmt)).all() if row[0]})

            stmt_cdata = select(ActivityRun.child_pipeline_data).where(
                ActivityRun.child_pipeline_data.isnot(None)
            )
            for (cdata_str,) in (await session.execute(stmt_cdata)).all():
                if cdata_str:
                    try:
                        cdata_obj = json.loads(cdata_str)
                        if isinstance(cdata_obj, dict):
                            cp_id = cdata_obj.get("pipelineId")
                            if cp_id:
                                child_pids_to_exclude.add(str(cp_id).strip().lower())
                    except Exception:
                        pass

            # 1. Fetch pipelines for workspace (strictly master / independent, never children)
            stmt_pipes = select(Pipeline).where(
                Pipeline.workspace_id == workspace_id,
                Pipeline.is_master == 1,
            )
            if child_pids_to_exclude:
                stmt_pipes = stmt_pipes.where(func.lower(Pipeline.id).notin_(list(child_pids_to_exclude)))
            stmt_pipes = stmt_pipes.order_by(Pipeline.displayName.asc())
            pipeline_rows = (await session.execute(stmt_pipes)).scalars().all()

            if not pipeline_rows:
                stmt_pipes_all = select(Pipeline).where(Pipeline.workspace_id == workspace_id)
                if child_pids_to_exclude:
                    stmt_pipes_all = stmt_pipes_all.where(Pipeline.id.notin_(list(child_pids_to_exclude)))
                stmt_pipes_all = stmt_pipes_all.order_by(Pipeline.displayName.asc())
                pipeline_rows = (await session.execute(stmt_pipes_all)).scalars().all()

            if not pipeline_rows:
                return []

            # 2. Latest run per pipeline (sorted by start_time/updated_at desc)
            #    Exclude "No Runs" placeholder rows so a stale placeholder (start_time NULL,
            #    updated_at = now) can never outrank a real execution (incl. in-progress runs).
            latest_runs_stmt = (
                select(PipelineRun)
                .where(
                    PipelineRun.workspace_id == workspace_id,
                    PipelineRun.status != "No Runs",
                )
                .order_by(
                    func.coalesce(PipelineRun.start_time, PipelineRun.updated_at, "1970-01-01").desc(),
                    PipelineRun.updated_at.desc(),
                )
            )
            all_workspace_runs = (await session.execute(latest_runs_stmt)).scalars().all()
            latest_runs_by_pid = {}
            for r in all_workspace_runs:
                if r.pipeline_id not in latest_runs_by_pid:
                    latest_runs_by_pid[r.pipeline_id] = {
                        "id": r.id,
                        "pipeline_id": r.pipeline_id,
                        "pipeline_name": r.pipeline_name,
                        "workspace_id": r.workspace_id,
                        "status": r.status,
                        "start_time": r.start_time,
                        "end_time": r.end_time,
                        "duration_in_ms": r.duration_in_ms,
                        "invoke_type": r.invoke_type,
                        "is_child": r.is_child,
                        "parent_run_id": r.parent_run_id,
                        "parent_activity_name": r.parent_activity_name,
                        "failure_reason": r.failure_reason,
                    }

            # 3. SLA configs
            sla_stmt = select(SLAConfig).where(SLAConfig.workspace_id == workspace_id)
            sla_rows = (await session.execute(sla_stmt)).scalars().all()
            sla_by_pid = self._index_sla_configs(sla_rows, workspace_id)

            # 4. Incidents
            inc_stmt = (
                select(SLAIncident)
                .where(
                    SLAIncident.workspace_id == workspace_id,
                    SLAIncident.status.in_(["ACTIVE", "ESCALATED_L2", "CRITICAL_UNRESOLVED", "RESOLVED"]),
                )
                .order_by(SLAIncident.failed_at.desc())
            )
            incident_rows = (await session.execute(inc_stmt)).scalars().all()
            incident_by_run_id, active_incident_by_pid, latest_incident_by_pid = self._index_incidents(incident_rows)

            # 5. Schedules
            sched_stmt = select(PipelineSchedule).where(PipelineSchedule.workspace_id == workspace_id)
            sched_rows = (await session.execute(sched_stmt)).scalars().all()
            sched_by_pid = {
                s.pipeline_id: {
                    "pipeline_id": s.pipeline_id,
                    "enabled": s.enabled,
                    "schedule_type": s.schedule_type,
                    "next_run_time": s.next_run_time,
                    "time_zone": s.time_zone,
                }
                for s in sched_rows
            }

        run_objects_by_id: Dict[str, Dict[str, Any]] = {}
        top_level: List[Dict[str, Any]] = []

        for p in pipeline_rows:
            pid = p.id
            pname = p.displayName
            latest_run = latest_runs_by_pid.get(pid)
            sla_cfg = sla_by_pid.get(pid, {
                "pipelineId": pid,
                "workspaceId": workspace_id,
                "l1Email": "",
                "l2Email": "",
                "slaMinutes": 30,
                "domain": "",
            })
            sched_info = sched_by_pid.get(pid)

            run_obj = self._build_pipeline_run_node(
                pid=pid,
                pname=pname,
                workspace_id=workspace_id,
                run_data=latest_run,
                sla_cfg=sla_cfg,
                sched_info=sched_info,
                incident_by_run_id=incident_by_run_id,
                active_incident_by_pid=active_incident_by_pid,
                latest_incident_by_pid=latest_incident_by_pid,
                no_run_status="No Runs",
            )
            run_objects_by_id[run_obj["id"]] = run_obj
            top_level.append(run_obj)

        active_run_ids = [r["id"] for r in top_level]
        all_workspace_runs_lookup = {r.id: r for r in all_workspace_runs}
        if active_run_ids:
            async with async_session_maker() as session:
                act_stmt = (
                    select(ActivityRun)
                    .where(ActivityRun.pipeline_run_id.in_(active_run_ids))
                    .order_by(ActivityRun.start_time.asc())
                )
                act_rows = (await session.execute(act_stmt)).scalars().all()
                self._attach_activities_and_finalize(run_objects_by_id, act_rows, top_level, all_workspace_runs_lookup)
        else:
            self._attach_activities_and_finalize(run_objects_by_id, [], top_level, all_workspace_runs_lookup)

        return top_level

    async def get_workspace_tree_by_date(
        self,
        workspace_id: str,
        date_preset: str = "latest",
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Builds the date-filtered execution hierarchy and forecast for a workspace.
        Supports presets: 'latest', 'yesterday', 'today', 'tomorrow', 'last_week', 'next_week', 'custom'.
        """
        today_date = datetime.datetime.now(datetime.timezone.utc).date()
        preset = (date_preset or "latest").lower().strip()
        is_future = False

        if preset in ("yesterday", "last_day", "lastday"):
            target_start = today_date - datetime.timedelta(days=1)
            target_end = target_start
        elif preset == "today":
            target_start = today_date
            target_end = today_date
        elif preset in ("tomorrow", "next_day", "nextday"):
            target_start = today_date + datetime.timedelta(days=1)
            target_end = target_start
            is_future = True
        elif preset in ("last_week", "lastweek"):
            target_start = today_date - datetime.timedelta(days=7)
            target_end = today_date - datetime.timedelta(days=1)
        elif preset in ("next_week", "nextweek"):
            target_start = today_date + datetime.timedelta(days=1)
            target_end = today_date + datetime.timedelta(days=7)
            is_future = True
        elif preset == "custom":
            try:
                target_start = datetime.date.fromisoformat(start_date) if start_date else today_date
            except Exception:
                target_start = today_date
            try:
                target_end = datetime.date.fromisoformat(end_date) if end_date else target_start
            except Exception:
                target_end = target_start
            if target_start > today_date:
                is_future = True
        else:
            target_start = None
            target_end = None

        async with async_session_maker() as session:
            # Available dates query
            date_subq = (
                select(
                    func.substring(func.coalesce(PipelineRun.start_time, PipelineRun.end_time), 1, 10).label("run_date")
                )
                .where(
                    PipelineRun.workspace_id == workspace_id,
                    PipelineRun.status != "No Runs",
                    PipelineRun.start_time.isnot(None),
                )
                .distinct()
                .subquery()
            )
            date_stmt = select(date_subq.c.run_date).order_by(date_subq.c.run_date.desc())
            date_rows = (await session.execute(date_stmt)).all()
            available_dates = [r[0] for r in date_rows if r[0]]

        if target_start is None or target_end is None:
            latest_tree = await self.get_workspace_latest_tree(workspace_id)
            total = len(latest_tree)
            running = sum(1 for p in latest_tree if p.get("status", "").lower() in ("inprogress", "running"))
            succeeded = sum(1 for p in latest_tree if p.get("status", "").lower() in ("completed", "succeeded", "success"))
            failed = sum(1 for p in latest_tree if p.get("status", "").lower() == "failed")
            cancelled = sum(1 for p in latest_tree if p.get("status", "").lower() in ("cancelled", "canceled"))
            not_run = sum(1 for p in latest_tree if p.get("status", "").lower() in ("no runs", "noruns", "notstarted", "never executed", "not run"))
            sla_breached = sum(
                1 for p in latest_tree
                if p.get("status", "").lower() == "failed"
                and p.get("incident")
                and str(p.get("incident", {}).get("status", "")).upper() in ("ACTIVE", "ESCALATED_L2", "CRITICAL_UNRESOLVED")
            )
            scheduled_count = sum(
                1 for p in latest_tree
                if p.get("schedule") and p["schedule"].get("enabled")
            )
            not_scheduled_count = total - scheduled_count

            return {
                "workspaceId": workspace_id,
                "dateFilter": {
                    "preset": "latest",
                    "startDate": None,
                    "endDate": None,
                    "isFuture": False,
                    "availableRunDates": available_dates,
                },
                "metrics": {
                    "total": total,
                    "running": running,
                    "succeeded": succeeded,
                    "failed": failed,
                    "cancelled": cancelled,
                    "notRun": not_run,
                    "slaBreached": sla_breached,
                    "scheduled": scheduled_count,
                    "notScheduled": not_scheduled_count,
                },
                "pipelines": latest_tree,
            }

        async with async_session_maker() as session:
            # Discover any pipeline ID that has been invoked as a child run or has is_child / parent_run_id
            child_run_stmt = select(ActivityRun.child_pipeline_run_id).where(
                ActivityRun.child_pipeline_run_id.isnot(None)
            )
            child_run_ids = {row[0] for row in (await session.execute(child_run_stmt)).all() if row[0]}

            child_pids_to_exclude = set()
            if child_run_ids:
                c_pipe_stmt = select(PipelineRun.pipeline_id).where(
                    PipelineRun.id.in_(child_run_ids),
                    PipelineRun.workspace_id == workspace_id,
                )
                child_pids_to_exclude.update({str(row[0]).strip().lower() for row in (await session.execute(c_pipe_stmt)).all() if row[0]})

            invoked_pipe_stmt = select(PipelineRun.pipeline_id).where(
                PipelineRun.workspace_id == workspace_id,
                or_(PipelineRun.is_child == 1, PipelineRun.parent_run_id.isnot(None)),
            )
            child_pids_to_exclude.update({str(row[0]).strip().lower() for row in (await session.execute(invoked_pipe_stmt)).all() if row[0]})

            stmt_cdata = select(ActivityRun.child_pipeline_data).where(
                ActivityRun.child_pipeline_data.isnot(None)
            )
            for (cdata_str,) in (await session.execute(stmt_cdata)).all():
                if cdata_str:
                    try:
                        cdata_obj = json.loads(cdata_str)
                        if isinstance(cdata_obj, dict):
                            cp_id = cdata_obj.get("pipelineId")
                            if cp_id:
                                child_pids_to_exclude.add(str(cp_id).strip().lower())
                    except Exception:
                        pass

            # 1. Fetch pipelines (strictly master / independent, never children)
            stmt_pipes = select(Pipeline).where(
                Pipeline.workspace_id == workspace_id,
                Pipeline.is_master == 1,
            )
            if child_pids_to_exclude:
                stmt_pipes = stmt_pipes.where(func.lower(Pipeline.id).notin_(list(child_pids_to_exclude)))
            stmt_pipes = stmt_pipes.order_by(Pipeline.displayName.asc())
            pipeline_rows = (await session.execute(stmt_pipes)).scalars().all()
            if not pipeline_rows:
                stmt_pipes_all = select(Pipeline).where(Pipeline.workspace_id == workspace_id)
                if child_pids_to_exclude:
                    stmt_pipes_all = stmt_pipes_all.where(Pipeline.id.notin_(list(child_pids_to_exclude)))
                stmt_pipes_all = stmt_pipes_all.order_by(Pipeline.displayName.asc())
                pipeline_rows = (await session.execute(stmt_pipes_all)).scalars().all()

            # 2. SLA configs
            sla_stmt = select(SLAConfig).where(SLAConfig.workspace_id == workspace_id)
            sla_rows = (await session.execute(sla_stmt)).scalars().all()
            sla_by_pid = self._index_sla_configs(sla_rows, workspace_id)

            # 3. Schedules
            sched_stmt = select(PipelineSchedule).where(PipelineSchedule.workspace_id == workspace_id)
            sched_rows = (await session.execute(sched_stmt)).scalars().all()
            sched_by_pid = {
                s.pipeline_id: {
                    "pipeline_id": s.pipeline_id,
                    "enabled": s.enabled,
                    "schedule_type": s.schedule_type,
                    "next_run_time": s.next_run_time,
                    "time_zone": s.time_zone,
                    "raw_configuration": s.raw_configuration,
                }
                for s in sched_rows
            }

        if is_future:
            forecast_pipelines = []
            scheduled_count = 0
            not_scheduled_count = 0

            for p in pipeline_rows:
                pid = p.id
                pname = p.displayName
                sched_info = sched_by_pid.get(pid)
                is_sched, sched_time_str = self._is_schedule_active_in_range(sched_info, target_start, target_end)

                sla_cfg = sla_by_pid.get(pid, {
                    "pipelineId": pid,
                    "workspaceId": workspace_id,
                    "l1Email": "",
                    "l2Email": "",
                    "slaMinutes": 30,
                    "domain": "",
                })

                if is_sched:
                    status_str = "Scheduled"
                    scheduled_count += 1
                    start_time_val = f"{sched_time_str}Z" if "T" in sched_time_str else f"{sched_time_str}:00Z"
                    invoke_val = "Schedule"
                else:
                    status_str = "Not Scheduled"
                    not_scheduled_count += 1
                    start_time_val = None
                    invoke_val = "None"

                forecast_pipelines.append({
                    "id": f"sched-{pid}",
                    "pipelineId": pid,
                    "pipelineName": pname,
                    "workspaceId": workspace_id,
                    "status": status_str,
                    "startTime": start_time_val,
                    "endTime": None,
                    "durationInMs": 0,
                    "invokeType": invoke_val,
                    "isChild": False,
                    "parentRunId": None,
                    "parentActivityName": None,
                    "error": None,
                    "activities": [],
                    "childPipelines": [],
                    "slaConfig": sla_cfg,
                    "domain": (sla_cfg.get("domain") or "") if sla_cfg else "",
                    "incident": None,
                    "schedule": sched_info,
                })

            forecast_pipelines.sort(
                key=lambda x: (x["status"] == "Scheduled", x["pipelineName"]),
                reverse=True,
            )

            return {
                "workspaceId": workspace_id,
                "dateFilter": {
                    "preset": preset,
                    "startDate": target_start.isoformat(),
                    "endDate": target_end.isoformat(),
                    "isFuture": True,
                    "availableRunDates": available_dates,
                },
                "metrics": {
                    "total": len(pipeline_rows),
                    "running": 0,
                    "succeeded": 0,
                    "failed": 0,
                    "cancelled": 0,
                    "notRun": not_scheduled_count,
                    "scheduled": scheduled_count,
                    "notScheduled": not_scheduled_count,
                },
                "pipelines": forecast_pipelines,
            }

        s_iso = target_start.isoformat()
        e_iso = target_end.isoformat()

        async with async_session_maker() as session:
            period_runs_stmt = (
                select(PipelineRun)
                .where(
                    PipelineRun.workspace_id == workspace_id,
                    func.substring(func.coalesce(PipelineRun.start_time, PipelineRun.end_time), 1, 10) >= s_iso,
                    func.substring(func.coalesce(PipelineRun.start_time, PipelineRun.end_time), 1, 10) <= e_iso,
                    PipelineRun.status != "No Runs",
                )
                .order_by(
                    func.coalesce(PipelineRun.start_time, PipelineRun.updated_at, "1970-01-01").desc(),
                    PipelineRun.updated_at.desc(),
                )
            )
            all_period_runs = (await session.execute(period_runs_stmt)).scalars().all()
            runs_by_pid = {}
            for r in all_period_runs:
                if r.pipeline_id not in runs_by_pid:
                    runs_by_pid[r.pipeline_id] = {
                        "id": r.id,
                        "pipeline_id": r.pipeline_id,
                        "pipeline_name": r.pipeline_name,
                        "workspace_id": r.workspace_id,
                        "status": r.status,
                        "start_time": r.start_time,
                        "end_time": r.end_time,
                        "duration_in_ms": r.duration_in_ms,
                        "invoke_type": r.invoke_type,
                        "is_child": r.is_child,
                        "parent_run_id": r.parent_run_id,
                        "parent_activity_name": r.parent_activity_name,
                        "failure_reason": r.failure_reason,
                    }

            # SLA incidents for period
            inc_stmt = (
                select(SLAIncident)
                .where(
                    SLAIncident.workspace_id == workspace_id,
                    SLAIncident.status.in_(["ACTIVE", "ESCALATED_L2", "CRITICAL_UNRESOLVED", "RESOLVED"]),
                )
                .order_by(SLAIncident.failed_at.desc())
            )
            inc_rows = (await session.execute(inc_stmt)).scalars().all()
            incident_by_run_id, active_incident_by_pid, latest_incident_by_pid = self._index_incidents(inc_rows)

        period_pipelines = []
        run_objects_by_id: Dict[str, Dict[str, Any]] = {}

        for p in pipeline_rows:
            pid = p.id
            pname = p.displayName
            p_run = runs_by_pid.get(pid)
            sla_cfg = sla_by_pid.get(pid, {
                "pipelineId": pid,
                "workspaceId": workspace_id,
                "l1Email": "",
                "l2Email": "",
                "slaMinutes": 30,
                "domain": "",
            })
            sched_info = sched_by_pid.get(pid)

            run_obj = self._build_pipeline_run_node(
                pid=pid,
                pname=pname,
                workspace_id=workspace_id,
                run_data=p_run,
                sla_cfg=sla_cfg,
                sched_info=sched_info,
                incident_by_run_id=incident_by_run_id,
                active_incident_by_pid=active_incident_by_pid,
                latest_incident_by_pid=latest_incident_by_pid,
                no_run_status="Not Run",
            )
            run_objects_by_id[run_obj["id"]] = run_obj
            period_pipelines.append(run_obj)

        run_ids = [r["id"] for r in period_pipelines if not r["id"].startswith("norun-")]
        period_runs_lookup = {r.id: r for r in all_period_runs}
        if run_ids:
            async with async_session_maker() as session:
                act_stmt = (
                    select(ActivityRun)
                    .where(ActivityRun.pipeline_run_id.in_(run_ids))
                    .order_by(ActivityRun.start_time.asc())
                )
                act_rows = (await session.execute(act_stmt)).scalars().all()
                self._attach_activities_and_finalize(run_objects_by_id, act_rows, period_pipelines, period_runs_lookup)
        else:
            self._attach_activities_and_finalize(run_objects_by_id, [], period_pipelines, period_runs_lookup)

        total = len(pipeline_rows)
        running = sum(1 for p in period_pipelines if p.get("status", "").lower() in ("inprogress", "running"))
        succeeded = sum(1 for p in period_pipelines if p.get("status", "").lower() in ("completed", "succeeded", "success"))
        failed = sum(1 for p in period_pipelines if p.get("status", "").lower() == "failed")
        cancelled = sum(1 for p in period_pipelines if p.get("status", "").lower() in ("cancelled", "canceled"))
        not_run = sum(1 for p in period_pipelines if p.get("status", "").lower() in ("no runs", "noruns", "notstarted", "never executed", "not run"))
        sla_breached = sum(
            1 for p in period_pipelines
            if p.get("status", "").lower() == "failed"
            and p.get("incident")
            and str(p.get("incident", {}).get("status", "")).upper() in ("ACTIVE", "ESCALATED_L2", "CRITICAL_UNRESOLVED")
        )

        return {
            "workspaceId": workspace_id,
            "dateFilter": {
                "preset": preset,
                "startDate": s_iso,
                "endDate": e_iso,
                "isFuture": False,
                "availableRunDates": available_dates,
            },
            "metrics": {
                "total": total,
                "running": running,
                "succeeded": succeeded,
                "failed": failed,
                "cancelled": cancelled,
                "notRun": not_run,
                "slaBreached": sla_breached,
                "scheduled": sum(
                    1 for p in period_pipelines
                    if p.get("schedule") and p["schedule"].get("enabled")
                ),
                "notScheduled": sum(
                    1 for p in period_pipelines
                    if not p.get("schedule") or not p["schedule"].get("enabled")
                ),
            },
            "pipelines": period_pipelines,
        }
