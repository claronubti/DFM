import React from 'react';
import { 
  Layers, 
  Search, 
  Filter, 
  Repeat, 
  GitBranch, 
  RotateCw, 
  Variable, 
  ListPlus, 
  AlertOctagon, 
  Code2, 
  Database, 
  Cpu, 
  ArrowRightCircle 
} from 'lucide-react';

/**
 * Returns a styled Lucide icon corresponding to the Microsoft Fabric activity type.
 * @param {string} type - Activity type string (e.g., 'ExecutePipeline', 'Lookup', 'Notebook').
 * @returns {JSX.Element}
 */
export function getActivityIcon(type) {
  switch (type?.toLowerCase()) {
    case 'executepipeline':
    case 'invokepipeline':
      return <Layers className="w-3.5 h-3.5 text-[#773adc]" />;
    case 'lookup':
      return <Search className="w-3.5 h-3.5 text-[#008272]" />;
    case 'filter':
      return <Filter className="w-3.5 h-3.5 text-[#0f6cbd]" />;
    case 'foreach':
      return <Repeat className="w-3.5 h-3.5 text-[#107c41]" />;
    case 'ifcondition':
      return <GitBranch className="w-3.5 h-3.5 text-[#0078d4]" />;
    case 'switch':
      return <GitBranch className="w-3.5 h-3.5 text-[#d83b01]" />;
    case 'until':
      return <RotateCw className="w-3.5 h-3.5 text-[#b78103]" />;
    case 'setvariable':
      return <Variable className="w-3.5 h-3.5 text-[#0078d4]" />;
    case 'appendvariable':
      return <ListPlus className="w-3.5 h-3.5 text-[#00b7c3]" />;
    case 'fail':
      return <AlertOctagon className="w-3.5 h-3.5 text-[#c42b1c]" />;
    case 'notebook':
    case 'synapsenotebook':
      return <Code2 className="w-3.5 h-3.5 text-[#d83b01]" />;
    case 'copy':
      return <Database className="w-3.5 h-3.5 text-[#0f6cbd]" />;
    case 'sql':
    case 'script':
    case 'storedprocedure':
      return <Cpu className="w-3.5 h-3.5 text-[#0f6cbd]" />;
    case 'web':
    case 'webhook':
      return <ArrowRightCircle className="w-3.5 h-3.5 text-[#773adc]" />;
    default:
      return <ArrowRightCircle className="w-3.5 h-3.5 text-[#605e5c]" />;
  }
}

/**
 * Safely parses a UTC ISO timestamp into millisecond epoch.
 * Normalizes missing trailing 'Z' and space delimiters.
 * @param {string|number} isoString
 * @returns {number} Epoch milliseconds or 0 if invalid.
 */
export function parseUtcTime(isoString) {
  if (!isoString) return 0;
  try {
    let s = String(isoString).trim().replace(' ', 'T');
    if (!s.endsWith('Z') && !s.includes('+') && !s.includes('-', 10)) {
      s += 'Z';
    }
    const t = new Date(s).getTime();
    return isNaN(t) ? 0 : t;
  } catch {
    return 0;
  }
}

/**
 * Formats an ISO datetime string into human-friendly American format (e.g. "Oct 9, 2026, 2:30:15 PM").
 * @param {string} isoString
 * @returns {string} Formatted date string or "—" if blank/invalid.
 */
export function formatDateTime(isoString) {
  if (!isoString) return "—";
  try {
    let s = String(isoString).trim();
    if (!s.endsWith('Z') && !s.includes('+') && !s.includes('-', 10)) {
      s += 'Z';
    }
    const d = new Date(s);
    if (isNaN(d.getTime())) return "—";
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
    return "—";
  }
}

/**
 * Formats a duration in milliseconds into compact readable text ("500ms", "45s", "3m 12s").
 * @param {number} durationInMs
 * @returns {string}
 */
export function formatDuration(durationInMs) {
  if (durationInMs === null || durationInMs === undefined || isNaN(durationInMs)) return "—";
  if (durationInMs === 0) return "—";
  if (durationInMs < 1000) return `${durationInMs}ms`;
  const totalSeconds = Math.round(durationInMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
}

/**
 * Formats SLA duration milliseconds into countdown / overdue text ("2h 15m 30s" or "4m 12s").
 * @param {number} ms
 * @returns {string}
 */
export function formatSlaDuration(ms) {
  const totalSec = Math.floor(Math.abs(ms) / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Computes execution duration for an activity or pipeline run.
 * Checks durationInMs property, then start/end timestamps, or sums child activities.
 * @param {Object} item
 * @returns {number} Duration in milliseconds.
 */
export function computeDuration(item) {
  if (!item) return 0;
  if (item.durationInMs !== undefined && item.durationInMs !== null && item.durationInMs > 0) {
    return item.durationInMs;
  }
  const st = item.activityRunStart || item.startTime;
  const et = item.activityRunEnd || item.endTime;
  if (st && et) {
    try {
      const s = parseUtcTime(st);
      const e = parseUtcTime(et);
      if (s > 0 && e > 0 && e >= s) {
        return e - s;
      }
    } catch {}
  }
  if (item.activities && item.activities.length > 0) {
    const sum = item.activities.reduce((acc, a) => {
      const d = computeDuration(a);
      return acc + (d > 0 ? d : 0);
    }, 0);
    if (sum > 0) return sum;
  }
  return 0;
}
