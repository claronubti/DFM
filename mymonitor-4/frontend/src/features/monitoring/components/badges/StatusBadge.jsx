/**
 * StatusBadge Component
 * 
 * Microsoft Fabric Native Status Presence Badge:
 * - Fluent 2 semantic colors & presence glyphs
 * - Succeeded (Green), Failed (Red), In Progress (Blue spinner), Cancelled (Neutral), Scheduled (Purple)
 * - Interactive failure diagnostics trigger
 *
 * @param {Object} props
 * @param {string} props.status - Status string ('InProgress', 'Succeeded', 'Failed', 'Cancelled', 'Queued', 'Scheduled').
 * @param {Function} [props.onSelectError] - Click handler when error icon/badge is clicked.
 * @param {Object} [props.errorData] - Error diagnostics payload to pass to onSelectError.
 * @returns {JSX.Element}
 */

import React from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Clock,
  Ban
} from 'lucide-react';

export default function StatusBadge({ status, onSelectError, errorData }) {
  const s = status?.toLowerCase() || '';

  if (s === 'inprogress' || s === 'running' || s === 'notstarted' || s === 'not started') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#eff6fc] text-[#0f6cbd] border border-[#0f6cbd]/25 shadow-2xs">
        <Loader2 className="w-3 h-3 animate-spin text-[#0f6cbd]" />
        <span>In progress</span>
      </span>
    );
  }
  if (s === 'succeeded' || s === 'completed' || s === 'success') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#dff6dd] text-[#107c41] border border-[#107c41]/25 shadow-2xs">
        <CheckCircle2 className="w-3 h-3 text-[#107c41]" />
        <span>Succeeded</span>
      </span>
    );
  }
  if (s === 'failed' || s === 'fail') {
    return (
      <button
        type="button"
        onClick={(e) => {
          if (onSelectError && errorData) {
            e.stopPropagation();
            onSelectError(errorData);
          }
        }}
        title={errorData ? "Click to view failure diagnostics" : undefined}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#fde7e9] text-[#c42b1c] border border-[#c42b1c]/25 shadow-2xs ${onSelectError && errorData ? 'cursor-pointer hover:bg-[#fad8db] hover:border-[#c42b1c]/40 transition' : ''
          }`}
      >
        <AlertCircle className="w-3 h-3 text-[#c42b1c]" />
        <span>Failed</span>
      </button>
    );
  }
  if (s === 'cancelled' || s === 'canceled') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#f3f2f1] text-[#605e5c] border border-[#edebe9] shadow-2xs">
        <Ban className="w-3 h-3 text-[#797775]" />
        <span>Cancelled</span>
      </span>
    );
  }
  if (s === 'queued') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#fff4ce] text-[#8a3707] border border-[#8a3707]/25 shadow-2xs">
        <Clock className="w-3 h-3 text-[#8a3707]" />
        <span>Queued</span>
      </span>
    );
  }
  if (s === 'scheduled') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#f3e8ff] text-[#773adc] border border-[#773adc]/25 shadow-2xs">
        <Clock className="w-3 h-3 text-[#773adc]" />
        <span>Scheduled</span>
      </span>
    );
  }
  if (s === 'not run') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#f3f2f1] text-[#797775] border border-[#edebe9]">
        <span>Not run</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#f3f2f1] text-[#605e5c]">
      <span>{status || 'Unknown'}</span>
    </span>
  );
}
