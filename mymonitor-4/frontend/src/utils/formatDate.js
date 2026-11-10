export function parseUtcTime(isoString) {
  if (!isoString) return 0;
  try {
    let s = String(isoString).trim();
    if (!s.endsWith('Z') && !s.includes('+') && !s.includes('-', 10)) {
      s += 'Z';
    }
    const t = new Date(s).getTime();
    return isNaN(t) ? 0 : t;
  } catch {
    return 0;
  }
}

export function formatDateTime(isoString) {
  if (!isoString) return '—';
  try {
    let s = String(isoString).trim();
    if (!s.endsWith('Z') && !s.includes('+') && !s.includes('-', 10)) {
      s += 'Z';
    }
    const d = new Date(s);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  } catch {
    return isoString;
  }
}

export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return '—';
  const sec = Math.max(0, Math.floor(seconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
