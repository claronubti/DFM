import React from 'react';
import { AlertCircle } from 'lucide-react';
import StatusBadge from '../badges/StatusBadge';
import {
  getActivityIcon,
  formatDateTime,
  formatDuration,
  computeDuration
} from '../../utils/formatters';

/**
 * LeafActivityRow: Renders a terminal leaf activity execution row (Copy, Script, Notebook, Lookup).
 *
 * HIERARCHY ROLE:
 * - Terminal nodes in the hierarchy tree (does not contain child activities).
 * - Clicking the row opens the detail side pane with input/output telemetry.
 *
 * @param {Object} props
 * @param {Object} props.activity - Activity telemetry payload from Fabric.
 * @param {number} [props.depth=0] - Hierarchy indentation level.
 * @param {Function} [props.onSelectError] - Click handler to open error diagnostics.
 * @param {Function} [props.onOpenSidePane] - Click handler to open detail drawer.
 * @param {string} [props.domain] - Business domain tag.
 */
export default function LeafActivityRow({
  activity,
  depth = 0,
  onSelectError,
  onOpenSidePane,
  domain
}) {
  const isFailed = activity.status?.toLowerCase() === 'failed';

  const errorData = isFailed ? {
    activityName: activity.activityName,
    activityType: activity.activityType,
    status: activity.status,
    activityRunStart: activity.activityRunStart,
    activityRunEnd: activity.activityRunEnd,
    durationInMs: activity.durationInMs,
    error: activity.error,
    output: activity.output
  } : null;

  return (
    <tr
      onClick={() => onOpenSidePane && onOpenSidePane(activity)}
      className="border-b border-[#edebe9] bg-[#fafafa] hover:bg-[#f3f2f1] transition-colors group cursor-pointer text-xs"
    >
      {/* Activity Name */}
      <td className="py-2 px-3" style={{ paddingLeft: `${depth * 24 + 16}px` }}>
        <div className="flex items-center gap-2">
          {/* Fabric Tree Branch Guide Line */}
          <div className="w-4 h-4 flex items-center justify-center shrink-0 text-[#c8c6c4]">
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M4 0 V10 H14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            </svg>
          </div>
          <div className="p-1 rounded bg-[#ffffff] border border-[#edebe9] shrink-0">
            {getActivityIcon(activity.activityType)}
          </div>
          <div className="flex items-center gap-2 min-w-0 truncate">
            <span className="font-medium text-[#242424] truncate">
              {activity.activityName}
            </span>
          </div>
        </div>
      </td>

      {/* Domain */}
      <td className="py-2 px-3 whitespace-nowrap">
        {domain ? (
          <span className="text-[#605e5c] text-[11px] font-medium">{domain}</span>
        ) : (
          <span className="text-[#a19f9d] text-[11px] italic">—</span>
        )}
      </td>

      {/* Status */}
      <td className="py-2 px-3 whitespace-nowrap">
        <StatusBadge
          status={activity.status}
          onSelectError={onSelectError}
          errorData={errorData}
        />
      </td>

      {/* Start Time */}
      <td className="py-2 px-3 font-mono text-[#605e5c] text-xs whitespace-nowrap">
        {formatDateTime(activity.activityRunStart)}
      </td>

      {/* End Time */}
      <td className="py-2 px-3 font-mono text-[#605e5c] text-xs whitespace-nowrap">
        {formatDateTime(activity.activityRunEnd)}
      </td>

      {/* Duration */}
      <td className="py-2 px-3 font-mono text-[#323130] text-xs whitespace-nowrap">
        {formatDuration(computeDuration(activity))}
      </td>

      {/* Diagnostics Quick Action */}
      <td className="py-2 px-3 text-right whitespace-nowrap">
        {isFailed ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onSelectError) onSelectError(errorData);
            }}
            title="Inspect error diagnostics"
            className="p-1 rounded text-[#797775] hover:text-[#c42b1c] hover:bg-[#fde7e9] transition cursor-pointer"
          >
            <AlertCircle className="w-3.5 h-3.5 text-[#c42b1c]" />
          </button>
        ) : (
          <span className="text-[#a19f9d] font-mono text-xs">—</span>
        )}
      </td>
    </tr>
  );
}
