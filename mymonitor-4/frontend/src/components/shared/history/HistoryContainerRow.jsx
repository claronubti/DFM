import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Repeat, GitBranch, RotateCw, AlertCircle } from 'lucide-react';
import StatusBadge from '../../../features/monitoring/components/badges/StatusBadge';
import { 
  formatDateTime, 
  formatDuration, 
  computeDuration 
} from '../../../features/monitoring/utils/formatters';
import {
  isContainerActivity,
  sortActivitiesByTimeline
} from '../../../features/monitoring/utils/activityTreeUtils';
import HistoryActivityRow from './HistoryActivityRow';
import HistorySubPipelineRow from './HistorySubPipelineRow';

/**
 * HistoryContainerRow Component
 * 
 * Renders an expandable container activity (ForEach, IfCondition, Switch, Until)
 * in historical run trees, displaying nested inner activities on expansion.
 *
 * @param {Object} props
 * @param {Object} props.activity - Container activity telemetry record with innerActivities.
 * @param {number} [props.depth=1] - Indentation depth in the hierarchy tree.
 * @param {(errData: Object) => void} props.onSelectError - Callback when user clicks error button.
 * @returns {JSX.Element}
 */
export default function HistoryContainerRow({ activity, depth = 1, onSelectError }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const inners = sortActivitiesByTimeline(activity.innerActivities || []);
  const hasInnerActivities = inners.length > 0;
  const canExpand = hasInnerActivities;

  const startTime = activity.activityRunStart || activity.startTime;
  const endTime = activity.activityRunEnd || activity.endTime;
  const duration = computeDuration(activity);
  const status = activity.status || 'Unknown';
  const isFailed = status?.toLowerCase() === 'failed';

  const atype = (activity.activityType || '').toLowerCase();
  let theme = {
    bg: 'bg-[#f6fbf8]',
    hoverBg: 'hover:bg-[#ecf7f1]',
    iconBg: 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]',
    badgeBg: 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]',
    icon: <Repeat className="w-3.5 h-3.5" />,
    label: activity.activityType || 'Container'
  };

  if (atype.includes('ifcondition') || atype.includes('if')) {
    theme = {
      bg: 'bg-[#f8faff]',
      hoverBg: 'hover:bg-[#eff4fe]',
      iconBg: 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]',
      badgeBg: 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]',
      icon: <GitBranch className="w-3.5 h-3.5" />,
      label: 'IfCondition'
    };
  } else if (atype.includes('switch')) {
    theme = {
      bg: 'bg-[#fffaf5]',
      hoverBg: 'hover:bg-[#fff2e8]',
      iconBg: 'bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]',
      badgeBg: 'bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]',
      icon: <GitBranch className="w-3.5 h-3.5" />,
      label: 'Switch'
    };
  } else if (atype.includes('until')) {
    theme = {
      bg: 'bg-[#fefef8]',
      hoverBg: 'hover:bg-[#fefce8]',
      iconBg: 'bg-[#fefce8] text-[#a16207] border-[#fef08a]',
      badgeBg: 'bg-[#fefce8] text-[#a16207] border-[#fef08a]',
      icon: <RotateCw className="w-3.5 h-3.5" />,
      label: 'Until'
    };
  }

  return (
    <>
      <tr 
        onClick={() => canExpand && setIsExpanded(!isExpanded)}
        className={`border-b border-[#edebe9] ${theme.bg} ${theme.hoverBg} transition text-xs ${canExpand ? 'cursor-pointer' : ''}`}
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
                  <ChevronDown className="w-3.5 h-3.5 text-[#047857]" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-[#605e5c]" />
                )}
              </button>
            ) : (
              <span className="w-4 h-4 inline-block" />
            )}

            <div className={`p-1 rounded ${theme.iconBg} border shrink-0`}>
              {theme.icon}
            </div>

            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs text-[#242424] font-semibold truncate">
                {activity.activityName}
              </span>
              <span className={`px-1.5 py-0.2 text-[9px] font-medium rounded ${theme.badgeBg} border`}>
                {activity.activityType || theme.label}
              </span>
              {hasInnerActivities && (
                <span className="px-1.5 py-0.2 text-[9px] text-[#605e5c] bg-[#ffffff] rounded border border-[#edebe9]">
                  {inners.length} {inners.length === 1 ? 'activity' : 'activities'}
                </span>
              )}
            </div>
          </div>
        </td>

        <td className="py-2 px-3 whitespace-nowrap">
          <StatusBadge status={status} onSelectError={onSelectError} errorData={isFailed ? {
            activityName: activity.activityName,
            activityType: activity.activityType,
            status: status,
            activityRunStart: startTime,
            activityRunEnd: endTime,
            durationInMs: duration,
            error: activity.error,
            output: activity.output
          } : null} />
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
                onSelectError({
                  activityName: activity.activityName,
                  activityType: activity.activityType,
                  status: status,
                  activityRunStart: startTime,
                  activityRunEnd: endTime,
                  durationInMs: duration,
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

      {/* Expanded Inner Activities */}
      {isExpanded && inners.map((innerAct, idx) => {
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
  );
}
