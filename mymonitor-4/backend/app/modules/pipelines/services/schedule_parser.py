"""
Schedule parsing and trigger forecast helper utilities for Fabric data pipelines.
"""

import datetime
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger("fabric_monitor.pipelines.services.schedule")


def _get_timezone(tz_name: str) -> datetime.timezone:
    """Resolve a timezone name string to a standard datetime.timezone object with offset."""
    name = (tz_name or "").lower()
    if "india" in name or "ist" in name:
        return datetime.timezone(datetime.timedelta(hours=5, minutes=30))
    if "eastern" in name or "est" in name or "edt" in name:
        return datetime.timezone(datetime.timedelta(hours=-5))
    if "central" in name or "cst" in name or "cdt" in name:
        return datetime.timezone(datetime.timedelta(hours=-6))
    if "pacific" in name or "pst" in name or "pdt" in name:
        return datetime.timezone(datetime.timedelta(hours=-8))
    return datetime.timezone.utc


def _calculate_next_run(
    schedule_type: str,
    time_zone_str: str,
    interval: Optional[int] = None,
    times: Optional[List[str]] = None,
    start_date: Optional[str] = None,
) -> Optional[str]:
    """Calculates upcoming nextRunTime in ISO format based on schedule rule."""
    try:
        tz = _get_timezone(time_zone_str)
        now = datetime.datetime.now(tz)
        st_dt = None
        if start_date:
            try:
                st_dt = datetime.datetime.fromisoformat(start_date)
                if st_dt.tzinfo is None:
                    st_dt = st_dt.replace(tzinfo=tz)
            except Exception:
                pass

        st_type = (schedule_type or "").lower()
        if "cron" in st_type or "recur" in st_type:
            inv = interval or 15
            base_minute = st_dt.minute if st_dt else 0
            offset = base_minute % inv
            for m_delta in range(1, inv + 20):
                candidate = (now + datetime.timedelta(minutes=m_delta)).replace(second=0, microsecond=0)
                if candidate.minute % inv == offset and candidate > now:
                    return candidate.isoformat()

        elif "daily" in st_type:
            target_times = times or ["00:00"]
            candidates = []
            for t_str in target_times:
                try:
                    parts = [int(p) for p in t_str.split(":")]
                    th, tm = parts[0], parts[1]
                    cand = now.replace(hour=th, minute=tm, second=0, microsecond=0)
                    if cand <= now:
                        cand = cand + datetime.timedelta(days=1)
                    candidates.append(cand)
                except Exception:
                    pass
            if candidates:
                return min(candidates).isoformat()
    except Exception as exc:
        logger.debug(f"Failed to calculate nextRunTime: {exc}")
    return None


def _parse_schedules_payload(sched_data: Any) -> List[Dict[str, Any]]:
    """Parses and normalizes raw Fabric schedule payload into a standard list of schedule dicts."""
    if not sched_data:
        return []
    raw_list = []
    if isinstance(sched_data, dict):
        if "value" in sched_data and isinstance(sched_data["value"], list):
            raw_list = sched_data["value"]
        elif "schedules" in sched_data and isinstance(sched_data["schedules"], list):
            raw_list = sched_data["schedules"]
        elif "configuration" in sched_data or "enabled" in sched_data:
            raw_list = [sched_data]
    elif isinstance(sched_data, list):
        raw_list = sched_data

    all_scheds = []
    for item in raw_list:
        if isinstance(item, dict):
            cfg = item.get("configuration") or {}
            st_type = cfg.get("type") or item.get("scheduleType") or item.get("type") or "Custom"
            tz_str = cfg.get("localTimeZoneId") or item.get("timeZone") or cfg.get("timeZone") or "India Standard Time"
            inv = cfg.get("interval") or item.get("interval")
            times_list = cfg.get("times", []) or item.get("times", [])
            st_date = cfg.get("startDateTime") or item.get("startDate")
            end_date = cfg.get("endDateTime") or item.get("endDate")

            raw_next = cfg.get("nextRunTime") or item.get("nextRunTime")
            if not raw_next:
                raw_next = _calculate_next_run(st_type, tz_str, interval=inv, times=times_list, start_date=st_date)

            all_scheds.append({
                "id": item.get("id") or f"sched_{len(all_scheds)+1}",
                "enabled": bool(item.get("enabled", True)),
                "scheduleType": st_type,
                "timeZone": tz_str,
                "interval": inv,
                "nextRunTime": raw_next,
                "times": times_list,
                "days": cfg.get("days", []) or item.get("days", []),
                "startDate": st_date,
                "endDate": end_date,
                "source": item.get("source") or "Fabric",
                "rawConfiguration": cfg or item,
            })
    return all_scheds
