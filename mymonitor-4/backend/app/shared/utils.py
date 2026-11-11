"""
Shared utility functions for timestamp parsing, UTC normalization, and duration calculation.
"""

import datetime
from typing import Optional


def normalize_iso_utc(ts: Optional[str]) -> Optional[str]:
    """Ensures ISO timestamp string has explicit UTC timezone ('Z')."""
    if not ts:
        return ts
    s = str(ts).strip()
    if not s.endswith("Z") and "+" not in s and ("-" not in s[10:] if len(s) > 10 else True):
        s += "Z"
    return s


def parse_iso(dt_str: Optional[str]) -> Optional[datetime.datetime]:
    """Parses an ISO 8601 timestamp string into a timezone-aware UTC datetime."""
    if not dt_str:
        return None
    try:
        s = str(dt_str).strip()
        if not s.endswith("Z") and "+" not in s and ("-" not in s[10:] if len(s) > 10 else True):
            s += "+00:00"
        else:
            s = s.replace("Z", "+00:00")
        dt = datetime.datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt
    except Exception:
        return None


def calculate_duration_ms(
    start_time: Optional[str],
    end_time: Optional[str],
    current_duration: Optional[int] = None,
) -> Optional[int]:
    """Calculates elapsed duration in milliseconds between two ISO timestamps if not already present."""
    if current_duration is not None and current_duration > 0:
        return current_duration
    if not start_time or not end_time:
        return current_duration

    try:
        st_dt = parse_iso(start_time)
        et_dt = parse_iso(end_time)
        if st_dt and et_dt:
            return int(max(0, (et_dt - st_dt).total_seconds() * 1000))
    except Exception:
        pass
    return current_duration
