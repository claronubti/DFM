/**
 * Telemetry duration parser and clipboard helpers for Table Logs.
 */

/**
 * Parses timestamp string into millisecond epoch.
 *
 * @param {string|number} t - ISO string or date representation.
 * @returns {number|null} Milliseconds timestamp or null if invalid.
 */
export function parseMs(t) {
  if (!t) return null;
  try {
    const parts = String(t).trim().replace(' ', 'T').split('.');
    const iso = parts[0] + (parts[1] ? '.' + parts[1].slice(0, 3) : '');
    const ms = new Date(iso).getTime();
    return isNaN(ms) ? null : ms;
  } catch {
    return null;
  }
}

/**
 * Formats a duration representation or computes difference between start and end timestamps.
 *
 * @param {string|number} dur - Raw duration string/number.
 * @param {string} [start] - Start timestamp.
 * @param {string} [end] - End timestamp.
 * @returns {string} Human readable formatted duration (e.g. "2m 14s", "35s", "—").
 */
export function formatTableLogDuration(dur, start, end) {
  if (!dur && !end) return '—';
  const durStr = String(dur || '').trim();

  if (durStr.includes('-') && durStr.includes(':')) {
    if (start) {
      const s = parseMs(start);
      const e = parseMs(durStr);
      if (s && e && e >= s) {
        const diffSec = Math.max(0, Math.round((e - s) / 1000));
        const m = Math.floor(diffSec / 60);
        const sec = diffSec % 60;
        return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
      }
    }
  }

  if (durStr && !durStr.includes('-')) return durStr;

  if (start && end) {
    const s = parseMs(start);
    const e = parseMs(end);
    if (s && e && e >= s) {
      const diffSec = Math.max(0, Math.round((e - s) / 1000));
      const m = Math.floor(diffSec / 60);
      const sec = diffSec % 60;
      return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
    }
  }

  return durStr || '—';
}
