import datetime
import json
import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from app.db.session import async_session_maker
from app.modules.pipelines.models.pipeline_schedule import PipelineSchedule

logger = logging.getLogger("fabric_monitor.pipelines.repo.schedule")


class PipelineScheduleRepository:
    """Repository handling pipeline schedules, cron triggers, and forecast activation windows."""

    async def save_schedules(
        self,
        workspace_id: str,
        schedules: List[Dict[str, Any]],
        updated_at: Optional[str] = None,
    ) -> None:
        """Persists pipeline schedule and trigger configurations into local SQLite cache."""
        if not schedules:
            return
        if not updated_at:
            updated_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        # Deduplicate incoming schedules by pipelineId
        unique_scheds = {}
        for s in schedules:
            pid = s.get("pipelineId")
            if pid:
                unique_scheds[pid] = s

        async with async_session_maker() as session:
            pids = list(unique_scheds.keys())
            stmt = select(PipelineSchedule).where(PipelineSchedule.pipeline_id.in_(pids))
            existing_map = {s.pipeline_id: s for s in (await session.execute(stmt)).scalars().all()}

            for pid, s in unique_scheds.items():
                name = s.get("pipelineName", "")
                enabled = 1 if s.get("enabled") else 0
                stype = s.get("scheduleType", "None")
                next_run = s.get("nextRunTime")
                tz = s.get("timeZone", "UTC")
                raw = json.dumps(s.get("rawConfiguration", {}))

                if pid in existing_map:
                    existing = existing_map[pid]
                    existing.workspace_id = workspace_id
                    existing.pipeline_name = name
                    existing.enabled = enabled
                    existing.schedule_type = stype
                    existing.next_run_time = next_run
                    existing.time_zone = tz
                    existing.raw_configuration = raw
                    existing.updated_at = updated_at
                else:
                    new_sched = PipelineSchedule(
                        pipeline_id=pid,
                        workspace_id=workspace_id,
                        pipeline_name=name,
                        enabled=enabled,
                        schedule_type=stype,
                        next_run_time=next_run,
                        time_zone=tz,
                        raw_configuration=raw,
                        updated_at=updated_at,
                    )
                    session.add(new_sched)
            try:
                await session.commit()
            except Exception:
                await session.rollback()

    async def get_pipeline_schedules(self, workspace_id: str) -> List[Dict[str, Any]]:
        """Retrieves all pipeline schedule definitions cached for a workspace."""
        async with async_session_maker() as session:
            stmt = select(PipelineSchedule).where(PipelineSchedule.workspace_id == workspace_id).order_by(PipelineSchedule.pipeline_name.asc())
            rows = (await session.execute(stmt)).scalars().all()
            results = []
            for r in rows:
                raw_cfg = {}
                if r.raw_configuration:
                    try:
                        raw_cfg = json.loads(r.raw_configuration)
                    except Exception:
                        raw_cfg = {}
                results.append({
                    "pipelineId": r.pipeline_id,
                    "pipelineName": r.pipeline_name,
                    "enabled": bool(r.enabled),
                    "scheduleType": r.schedule_type or "Manual / None",
                    "nextRunTime": r.next_run_time,
                    "timeZone": r.time_zone or "UTC",
                    "rawConfiguration": raw_cfg,
                })
            return results

    async def get_schedule_for_pipeline(self, workspace_id: str, pipeline_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves the schedule definition for a specific pipeline ID."""
        async with async_session_maker() as session:
            stmt = select(PipelineSchedule).where(
                PipelineSchedule.workspace_id == workspace_id,
                PipelineSchedule.pipeline_id == pipeline_id,
            )
            r = (await session.execute(stmt)).scalar_one_or_none()
            if not r:
                return None
            raw_cfg = {}
            if r.raw_configuration:
                try:
                    raw_cfg = json.loads(r.raw_configuration)
                except Exception:
                    raw_cfg = {}
            return {
                "pipelineId": r.pipeline_id,
                "pipelineName": r.pipeline_name,
                "enabled": bool(r.enabled),
                "scheduleType": r.schedule_type or "Manual / None",
                "nextRunTime": r.next_run_time,
                "timeZone": r.time_zone or "UTC",
                "rawConfiguration": raw_cfg,
            }

    @staticmethod
    def _is_schedule_active_in_range(sched_row: Optional[dict], start_date: datetime.date, end_date: datetime.date) -> tuple[bool, str]:
        """Determines whether a pipeline schedule pattern is active within the specified date range."""
        if not sched_row or not sched_row.get("enabled"):
            return False, ""

        raw = {}
        if sched_row.get("raw_configuration"):
            try:
                cfg_val = sched_row["raw_configuration"]
                raw = json.loads(cfg_val) if isinstance(cfg_val, str) else cfg_val
            except Exception:
                raw = {}

        schedules_list: list[dict] = []
        if isinstance(raw, dict):
            if "schedules" in raw and isinstance(raw["schedules"], list):
                schedules_list = raw["schedules"]
            elif "value" in raw and isinstance(raw["value"], list):
                schedules_list = raw["value"]
            elif "raw" in raw and isinstance(raw["raw"], dict) and "value" in raw["raw"]:
                schedules_list = raw["raw"]["value"]
            elif raw:
                schedules_list = [raw]
        elif isinstance(raw, list):
            schedules_list = raw

        if not schedules_list:
            schedules_list = [{
                "enabled": sched_row.get("enabled"),
                "scheduleType": sched_row.get("schedule_type"),
                "configuration": {
                    "type": sched_row.get("schedule_type"),
                    "nextRunTime": sched_row.get("next_run_time"),
                },
            }]

        # Check next_run_time if available
        next_run = sched_row.get("next_run_time")
        if next_run:
            try:
                clean_nr = str(next_run).replace("Z", "+00:00")
                nr_dt = datetime.datetime.fromisoformat(clean_nr)
                if start_date <= nr_dt.date() <= end_date:
                    time_part = nr_dt.strftime("%H:%M")
                    return True, f"{nr_dt.date().isoformat()} {time_part}"
            except Exception:
                pass

        curr = start_date
        while curr <= end_date:
            target_iso = curr.isoformat()
            target_weekday = curr.strftime("%A").lower()

            for item in schedules_list:
                if not item.get("enabled", True):
                    continue

                cfg = item.get("configuration") or {}
                stype = str(item.get("scheduleType") or cfg.get("type") or sched_row.get("schedule_type") or "").lower()

                # Check start/end bounds of schedule if present
                s_bound = item.get("startDate") or cfg.get("startDateTime")
                e_bound = item.get("endDate") or cfg.get("endDateTime")
                if s_bound:
                    try:
                        s_bound_date = datetime.datetime.fromisoformat(str(s_bound).replace("Z", "+00:00")).date()
                        if curr < s_bound_date:
                            continue
                    except Exception:
                        pass
                if e_bound:
                    try:
                        e_bound_date = datetime.datetime.fromisoformat(str(e_bound).replace("Z", "+00:00")).date()
                        if curr > e_bound_date:
                            continue
                    except Exception:
                        pass

                times = item.get("times") or cfg.get("times") or []
                time_str = str(times[0]) if times else "00:00"

                # 1. Cron / Recurring / Minute interval (e.g. Every 15 mins) runs every day
                if any(k in stype for k in ["cron", "recur", "minute", "interval", "every 15", "15 min"]):
                    return True, f"{target_iso} {time_str if time_str != '00:00' else '00:15'}"

                # 2. Daily / Day / Every day
                elif any(k in stype for k in ["daily", "day", "everyday", "every day"]):
                    return True, f"{target_iso} {time_str}"

                # 3. Weekly / Specific days
                elif any(k in stype for k in ["weekly", "week"]):
                    days = [str(d).lower() for d in (item.get("days") or cfg.get("days") or [])]
                    if not days or target_weekday in days:
                        return True, f"{target_iso} {time_str}"

                # 4. Fallback for any active enabled schedule
                elif item.get("enabled", True) and sched_row.get("enabled"):
                    return True, f"{target_iso} {time_str}"

            curr += datetime.timedelta(days=1)

        return False, ""
