import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { formatSlaDuration, formatDateTime, parseUtcTime } from '../../utils/formatters';
import { useAuthContext } from '../../../auth';

/**
 * SlaCountdownBadge: Dynamic real-time SLA countdown timer badge.
 * Live 1-second interval timer tracking the failure escalation lifecycle:
 *   - Phase 1 (Failure -> SLA1): Countdown decreasing towards SLA1 deadline ("L1 SLA: 29m 59s").
 *   - Phase 2 (SLA1 Breached -> SLA2): Countdown decreasing towards SLA2 deadline ("L1 Breached • L2 In: 29m 59s").
 *   - Phase 3 (SLA2 Breached): Overdue elapsed time increasing ("L2 Escalated (Breached): +12m 45s").
 * Displays role-specific "L1 Resolved", "L2 Resolved", or "Admin Resolved" badge if incident has been acknowledged/resolved.
 *
 * @param {Object} props
 * @param {Object} [props.incident] - Active or resolved incident object from backend.
 * @param {Object} [props.slaConfig] - Configured SLA threshold parameters.
 * @param {Function} [props.onResolve] - Callback to resolve incident.
 * @param {Object} [props.pipeline] - Pipeline metadata object.
 * @param {string} [props.userRole] - Explicit authenticated operator role ('Admin', 'L2', 'L1').
 */
export default function SlaCountdownBadge({ incident, slaConfig, onResolve, pipeline, userRole: propUserRole }) {
  const [, setTick] = useState(0);
  const [isResolving, setIsResolving] = useState(false);

  let authContext = null;
  try {
    authContext = useAuthContext();
  } catch {
    authContext = null;
  }
  const { profile, role, isAdmin } = authContext || {};

  const isUserAdmin = Boolean(
    (propUserRole && String(propUserRole).trim().toLowerCase() === 'admin') ||
    isAdmin ||
    (role || '').toLowerCase() === 'admin' ||
    profile?.is_admin
  );

  const userRole = (() => {
    // 1. Admin platform privileges ALWAYS take top priority
    if (isUserAdmin) {
      return 'Admin';
    }

    // 2. Explicit prop passed from authenticated session takes priority
    if (propUserRole) {
      const cleanProp = String(propUserRole).trim();
      if (cleanProp.toLowerCase() === 'l2') return 'L2';
      if (cleanProp.toLowerCase() === 'l1') return 'L1';
    }

    // 3. Match against contact email configuration for non-admin operators
    const platformRole = (role || profile?.role || '').toLowerCase();
    const userEmail = (profile?.email || '').toLowerCase().trim();
    const l1Email = (slaConfig?.l1Email || pipeline?.slaConfig?.l1Email || '').toLowerCase().trim();
    const l2Email = (slaConfig?.l2Email || pipeline?.slaConfig?.l2Email || '').toLowerCase().trim();

    if (platformRole === 'l2' || (userEmail && l2Email && userEmail === l2Email)) {
      return 'L2';
    }
    if (platformRole === 'l1' || (userEmail && l1Email && userEmail === l1Email)) {
      return 'L1';
    }
    return 'L1';
  })();

  const handleResolve = async (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (isResolving) return;
    const incId =
      incident?.id ||
      incident?.incidentId ||
      (pipeline?.id ? `inc_${pipeline.id}` : null);
    if (!incId || !onResolve) return;
    setIsResolving(true);
    try {
      await onResolve(incId, userRole);
    } catch (err) {
      console.error('Failed to resolve incident:', err);
    } finally {
      setIsResolving(false);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!incident && !slaConfig) return null;

  // 1. Check if incident is already marked resolved
  const isResolved =
    incident?.status === 'RESOLVED' ||
    Boolean(incident?.resolvedAt || incident?.resolved_at);

  if (isResolved) {
    const rawResolver = String(incident?.resolvedBy || incident?.resolved_by || 'Resolved').trim();
    const resolvedTime = incident?.resolvedAt || incident?.resolved_at;
    const resolverUpper = rawResolver.toUpperCase();

    let badgeText = 'Resolved';
    let badgeClass = 'bg-[#dff6dd] text-[#107c41] border-[#107c41]/30';
    let dotColor = '#107c41';

    if (resolverUpper.startsWith('L1') || resolverUpper.includes('L1')) {
      badgeText = 'L1 Resolved';
      badgeClass = 'bg-[#e6f4ea] text-[#137333] border-[#34a853]/40 shadow-xs';
      dotColor = '#137333';
    } else if (resolverUpper.startsWith('L2') || resolverUpper.includes('L2')) {
      badgeText = 'L2 Resolved';
      badgeClass = 'bg-[#f3e8fd] text-[#7627bb] border-[#a855f7]/40 shadow-xs';
      dotColor = '#7627bb';
    } else if (resolverUpper.startsWith('ADMIN') || resolverUpper.includes('ADMIN')) {
      badgeText = 'Admin Resolved';
      badgeClass = 'bg-[#e8f0fe] text-[#1a73e8] border-[#4285f4]/40 shadow-xs';
      dotColor = '#1a73e8';
    } else if (rawResolver.toLowerCase().startsWith('auto-resolved')) {
      badgeText = 'Auto-Resolved';
      badgeClass = 'bg-[#f3f4f6] text-[#4b5563] border-[#dadce0]';
      dotColor = '#4b5563';
    } else {
      badgeText = rawResolver.toLowerCase() === 'resolved' ? 'Resolved' : `${rawResolver} Resolved`;
      badgeClass = 'bg-[#dff6dd] text-[#107c41] border-[#107c41]/30';
      dotColor = '#107c41';
    }

    return (
      <div
        title={`Incident resolved by ${rawResolver}${resolvedTime ? ` on ${formatDateTime(resolvedTime)}` : ''}. Escalation alerts halted.`}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono border shadow-2xs select-none transition-colors ${badgeClass}`}
      >
        <CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: dotColor }} />
        <span className="font-semibold">{badgeText}</span>
      </div>
    );
  }

  const now = Date.now();
  const rawStart =
    incident?.failedAt ||
    incident?.failed_at ||
    incident?.incidentStartTime ||
    pipeline?.endTime ||
    pipeline?.startTime;
  const startTime = rawStart ? parseUtcTime(rawStart) : now;

  // Accurate SLA threshold configuration with fallback (sla1Minutes / sla2Minutes)
  const l1LimitMinutes = Math.max(
    1,
    Number(
      slaConfig?.sla1Minutes ??
      slaConfig?.slaMinutes ??
      slaConfig?.l1SlaMinutes ??
      30
    )
  );
  const l2LimitMinutes = Math.max(
    1,
    Number(
      slaConfig?.sla2Minutes ??
      slaConfig?.l2EscalationMinutes ??
      (l1LimitMinutes * 2)
    )
  );

  // SLA1 Target Deadline:
  // Use explicit backend/watchdog target time if available, otherwise startTime + l1LimitMinutes
  const rawTarget = incident?.slaTargetTime || incident?.sla_target_time;
  const l1DeadlineMs = rawTarget
    ? parseUtcTime(rawTarget)
    : (startTime > 0 ? startTime + l1LimitMinutes * 60 * 1000 : now + l1LimitMinutes * 60 * 1000);

  // SLA2 Target Deadline:
  // Synchronized directly with backend watchdog engine calculation:
  const rawSla2Target = incident?.sla2TargetTime || incident?.sla2_target_time;
  const l2DeadlineMs = rawSla2Target
    ? parseUtcTime(rawSla2Target)
    : (startTime > 0 ? startTime + l2LimitMinutes * 60 * 1000 : l1DeadlineMs + (l2LimitMinutes - l1LimitMinutes) * 60 * 1000);

  // SLA Failure Phase Evaluation:
  const isPhase3 = now >= l2DeadlineMs;
  const isPhase2 = !isPhase3 && now >= l1DeadlineMs;

  let badgeStyle = '';
  let label = '';
  let displayText = '';

  if (isPhase3) {
    // Phase 3: SLA2 Breached -> Red critical warning, overdue counter strictly INCREASING (+Xm Ys)
    badgeStyle = 'bg-[#fde7e9] text-[#a80000] border-[#c42b1c] animate-pulse';
    label = 'L2 Escalated (Breached)';
    const overdueMs = Math.max(0, now - l2DeadlineMs);
    displayText = `+${formatSlaDuration(overdueMs)}`;
  } else if (isPhase2) {
    // Phase 2: SLA1 Breached -> Orange warning, countdown to SLA2 strictly DECREASING (Xm Ys)
    badgeStyle = 'bg-[#fff0ed] text-[#d13438] border-[#f8c2b7]';
    label = 'L1 Breached • L2 In';
    const remainingMs = Math.max(0, l2DeadlineMs - now);
    displayText = formatSlaDuration(remainingMs);
  } else {
    // Phase 1: Pipeline Failed -> Amber warning, countdown to SLA1 strictly DECREASING (Xm Ys)
    badgeStyle = 'bg-[#fff4ce] text-[#8a660a] border-[#fed9cc]';
    label = 'L1 SLA';
    const remainingMs = Math.max(0, l1DeadlineMs - now);
    displayText = formatSlaDuration(remainingMs);
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono border ${badgeStyle} shadow-2xs`}
    >
      <Clock className="w-3 h-3 shrink-0" />
      <span className="font-semibold">{label}:</span>
      <span>{displayText}</span>
      {onResolve && (
        <button
          type="button"
          data-tour="resolve-incident-btn"
          disabled={isResolving}
          onClick={handleResolve}
          title={`Resolve Incident as ${userRole}`}
          className="ml-1 px-1.5 py-0.5 rounded bg-white/80 hover:bg-white text-[9px] font-sans font-medium transition cursor-pointer border border-current/20 disabled:opacity-50 inline-flex items-center gap-1"
        >
          {isResolving ? (
            <>
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              <span>Resolving...</span>
            </>
          ) : (
            'Resolve'
          )}
        </button>
      )}
    </div>
  );
}
