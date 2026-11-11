import React from 'react';
import { AlertCircle } from 'lucide-react';
import StatusBadge from '../../../features/monitoring/components/badges/StatusBadge';
import { 
  formatDateTime, 
  formatDuration, 
  getActivityIcon, 
  computeDuration 
} from '../../../features/monitoring/utils/formatters';

/**
 * HistoryActivityRow Component
 * 
 * Renders a terminal leaf activity row (Copy, Script, Notebook, Lookup, etc.)
 * within historical pipeline execution runs with status badge, start/end timestamps,
 * duration, and quick error inspection trigger.
 *
 * @param {Object} props
 * @param {Object} props.activity - Leaf activity execution telemetry record.
 * @param {number} [props.depth=1] - Indentation depth in the hierarchy tree.
 * @param {(errData: Object) => void} props.onSelectError - Callback when user clicks error button.
 * @returns {JSX.Element}
 */
export default function HistoryActivityRow({ activity, depth = 1, onSelectError }) {
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
    <tr className="border-b border-[#edebe9] bg-[#faf9f8]/60 hover:bg-[#f3f2f1] transition text-xs">
      <td className="py-2 px-3" style={{ paddingLeft: `${depth * 24 + 16}px` }}>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 inline-block shrink-0" />
          <div className="p-1 rounded bg-[#ffffff] text-[#605e5c] border border-[#d1d1d1] shrink-0">
            {getActivityIcon(activity.activityType)}
          </div>
          <span className="text-xs text-[#242424] font-medium truncate">
            {activity.activityName}
          </span>
          <span className="text-[10px] text-[#605e5c] font-mono">
            ({activity.activityType})
          </span>
        </div>
      </td>

      <td className="py-2 px-3 whitespace-nowrap">
        <StatusBadge status={activity.status} onSelectError={onSelectError} errorData={errorData} />
      </td>

      <td className="py-2 px-3 font-mono text-xs text-[#605e5c] whitespace-nowrap">
        {formatDateTime(activity.activityRunStart)}
      </td>

      <td className="py-2 px-3 font-mono text-xs text-[#605e5c] whitespace-nowrap">
        {formatDateTime(activity.activityRunEnd)}
      </td>

      <td className="py-2 px-3 font-mono text-xs text-[#242424] whitespace-nowrap">
        {formatDuration(computeDuration(activity))}
      </td>

      <td className="py-2 px-3 text-right whitespace-nowrap">
        {isFailed && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectError({
                activityName: activity.activityName,
                activityType: activity.activityType,
                status: activity.status,
                activityRunStart: activity.activityRunStart,
                activityRunEnd: activity.activityRunEnd,
                durationInMs: activity.durationInMs,
                error: activity.error,
                output: activity.output
              });
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-[#fde7e9] hover:bg-[#fbd0d5] text-[#a80000] border border-[#f19999] transition"
          >
            <AlertCircle className="w-3 h-3" />
            <span>Error</span>
          </button>
        )}
      </td>
    </tr>
  );
}
