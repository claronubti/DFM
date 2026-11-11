import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Layers, AlertCircle } from 'lucide-react';
import StatusBadge from '../../../features/monitoring/components/badges/StatusBadge';
import { 
  formatDateTime, 
  formatDuration, 
  computeDuration 
} from '../../../features/monitoring/utils/formatters';
import {
  isContainerActivity,
  nestContainerActivities,
  sortActivitiesByTimeline
} from '../../../features/monitoring/utils/activityTreeUtils';
import HistoryActivityRow from './HistoryActivityRow';
import HistoryContainerRow from './HistoryContainerRow';

/**
 * HistorySubPipelineRow Component
 * 
 * Renders an expandable ExecutePipeline activity row in historical run trees.
 * When expanded, displays its recursively nested inner child activities.
 *
 * @param {Object} props
 * @param {Object} props.activity - ExecutePipeline telemetry record with optional childPipeline.
 * @param {number} [props.depth=1] - Indentation depth in the hierarchy tree.
 * @param {(errData: Object) => void} props.onSelectError - Callback when user clicks error button.
 * @returns {JSX.Element}
 */
export default function HistorySubPipelineRow({ activity, depth = 1, onSelectError }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const child = activity.childPipeline;
  const hasInnerActivities = child?.activities && child.activities.length > 0;
  const canExpand = hasInnerActivities;

  const startTime = activity.activityRunStart || child?.startTime;
  const endTime = activity.activityRunEnd || child?.endTime;
  const duration = computeDuration(activity) || (child ? computeDuration(child) : 0);
  const status = activity.status || child?.status || 'Unknown';
  const isFailed = status?.toLowerCase() === 'failed';
  const err = activity.error || child?.error;
  const errorData = isFailed ? {
    activityName: activity.activityName,
    activityType: activity.activityType || 'Sub-pipeline',
    status: status,
    activityRunStart: startTime,
    activityRunEnd: endTime,
    durationInMs: duration,
    error: err,
    output: err?.rawError || activity.output
  } : null;

  return (
    <>
      <tr 
        onClick={() => canExpand && setIsExpanded(!isExpanded)}
        className={`border-b border-[#edebe9] bg-[#faf5ff] hover:bg-[#f3e8ff] transition text-xs ${canExpand ? 'cursor-pointer' : ''}`}
      >
        <td className="py-2 px-3" style={{ paddingLeft: `${depth * 24 + 16}px` }}>
          <div className="flex items-center gap-2">
            {canExpand ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className="p-0.5 rounded text-[#605e5c] hover:text-[#242424]"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-[#6b21a8]" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-[#605e5c]" />
                )}
              </button>
            ) : (
              <span className="w-4 h-4 inline-block" />
            )}

            <div className="p-1 rounded bg-[#f3e8ff] text-[#6b21a8] border border-[#d8b4fe] shrink-0">
              <Layers className="w-3.5 h-3.5" />
            </div>

            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs text-[#242424] font-semibold truncate">
                {activity.activityName}
              </span>
              <span className="px-1.5 py-0.2 text-[9px] font-medium rounded bg-[#f3e8ff] text-[#6b21a8] border border-[#d8b4fe]">
                {activity.activityType || 'Sub-pipeline'}
              </span>
            </div>
          </div>
        </td>

        <td className="py-2 px-3 whitespace-nowrap">
          <StatusBadge status={status} onSelectError={onSelectError} errorData={errorData} />
        </td>

        <td className="py-2 px-3 font-mono text-xs text-[#605e5c] whitespace-nowrap">
          {formatDateTime(startTime)}
        </td>

        <td className="py-2 px-3 font-mono text-xs text-[#605e5c] whitespace-nowrap">
          {formatDateTime(endTime)}
        </td>

        <td className="py-2 px-3 font-mono text-xs text-[#242424] whitespace-nowrap">
          {formatDuration(duration)}
        </td>

        <td className="py-2 px-3 text-right whitespace-nowrap">
          {isFailed && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const currentErr = activity.error || child?.error;
                onSelectError({
                  activityName: activity.activityName,
                  activityType: activity.activityType || 'Sub-pipeline',
                  status: status,
                  activityRunStart: startTime,
                  activityRunEnd: endTime,
                  durationInMs: duration,
                  error: currentErr,
                  output: currentErr?.rawError || activity.output
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

      {isExpanded && child && (
        <>
          {child.activities && sortActivitiesByTimeline(nestContainerActivities(child.activities)).map((innerAct, idx) => {
            const isInnerSub = innerAct.childPipeline != null || ['executepipeline', 'invokepipeline'].includes(innerAct.activityType?.toLowerCase());
            if (isInnerSub) {
              return (
                <HistorySubPipelineRow
                  key={innerAct.activityRunId || `hist-sub-${depth}-${idx}`}
                  activity={innerAct}
                  depth={depth + 1}
                  onSelectError={onSelectError}
                />
              );
            }
            if (isContainerActivity(innerAct)) {
              return (
                <HistoryContainerRow
                  key={innerAct.activityRunId || `hist-container-${depth}-${idx}`}
                  activity={innerAct}
                  depth={depth + 1}
                  onSelectError={onSelectError}
                />
              );
            }
            return (
              <HistoryActivityRow
                key={innerAct.activityRunId || `hist-act-${depth}-${idx}`}
                activity={innerAct}
                depth={depth + 1}
                onSelectError={onSelectError}
              />
            );
          })}
        </>
      )}
    </>
  );
}
