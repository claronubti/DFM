import React, { useState, useMemo } from 'react';
import { 
  Repeat, 
  GitBranch, 
  RotateCw, 
  ChevronDown, 
  ChevronRight, 
  AlertCircle 
} from 'lucide-react';
import StatusBadge from '../badges/StatusBadge';
import LeafActivityRow from './LeafActivityRow';
import ExecutePipelineActivityRow from './ExecutePipelineActivityRow';
import { 
  computeDuration, 
  formatDateTime, 
  formatDuration 
} from '../../utils/formatters';
import { 
  isContainerActivity, 
  sortActivitiesByTimeline 
} from '../../utils/activityTreeUtils';

/**
 * ContainerActivityRow:
 * Renders container and flow control activities (ForEach, IfCondition, Switch, Until).
 *
 * HIERARCHY ROLE:
 * - Groups activities that execute across loop iterations or conditional branches.
 * - Expanding this row recursively reveals the inner activities executed inside the loop/condition.
 *
 * @param {Object} props
 * @param {Object} props.activity - Container activity payload with innerActivities.
 * @param {number} [props.depth=0] - Hierarchy indentation depth.
 * @param {Function} [props.onSelectError] - Handler for error inspection.
 * @param {Function} [props.onOpenRunHistory] - Handler for pipeline run history modal.
 * @param {Function} [props.onOpenSchedule] - Handler for pipeline scheduling modal.
 * @param {Function} [props.onOpenSlaConfig] - Handler for SLA config modal.
 * @param {Function} [props.onResolveIncident] - Handler for incident resolution.
 * @param {Function} [props.onOpenTableLogs] - Handler for table audit telemetry modal.
 * @param {Function} [props.onOpenSidePane] - Handler for activity detail side pane.
 * @param {string} [props.domain] - Domain name tag inherited from parent pipeline.
 */
export default function ContainerActivityRow({
  activity,
  depth = 0,
  onSelectError,
  onOpenRunHistory,
  onOpenSchedule,
  onOpenSlaConfig,
  onResolveIncident,
  onOpenTableLogs,
  onOpenSidePane,
  domain,
  userRole
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const inners = useMemo(() => sortActivitiesByTimeline(activity.innerActivities || []), [activity.innerActivities]);
  const hasInnerActivities = inners.length > 0;
  const canExpand = hasInnerActivities;

  const startTime = activity.activityRunStart || activity.startTime;
  const endTime = activity.activityRunEnd || activity.endTime;
  const duration = computeDuration(activity);
  const status = activity.status || "Unknown";
  const isFailed = status?.toLowerCase() === 'failed';

  const errorData = isFailed ? {
    activityName: activity.activityName,
    activityType: activity.activityType || "Container",
    status: status,
    activityRunStart: startTime,
    activityRunEnd: endTime,
    durationInMs: duration,
    error: activity.error,
    output: activity.output
  } : null;

  const atype = (activity.activityType || '').toLowerCase();
  let theme = {
    bg: 'bg-[#faf8ff]',
    hoverBg: 'hover:bg-[#f3edfc]',
    iconBg: 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]',
    badgeBg: 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]',
    icon: <Repeat className="w-3.5 h-3.5" />,
    label: activity.activityType || 'Container'
  };

  if (atype.includes('foreach')) {
    theme = {
      bg: 'bg-[#f6fbf8]',
      hoverBg: 'hover:bg-[#ecf7f1]',
      iconBg: 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]',
      badgeBg: 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]',
      icon: <Repeat className="w-3.5 h-3.5" />,
      label: 'ForEach'
    };
  } else if (atype.includes('ifcondition') || atype.includes('if')) {
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
        onClick={() => {
          if (canExpand) setIsExpanded(!isExpanded);
          if (onOpenSidePane) onOpenSidePane(activity);
        }}
        className={`border-b border-[#edebe9] ${theme.bg} ${theme.hoverBg} transition-colors text-xs ${
          canExpand ? "cursor-pointer" : ""
        }`}
      >
        <td className="py-2.5 px-3" style={{ paddingLeft: `${depth * 24 + 16}px` }}>
          <div className="flex items-center gap-2">
            {canExpand ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className="p-0.5 rounded text-[#605e5c] hover:text-[#242424] transition cursor-pointer"
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

            <div className="flex items-center gap-1.5 truncate">
              <span className="font-semibold text-[#242424] text-xs truncate">
                {activity.activityName}
              </span>
              <span className={`px-1.5 py-0.2 text-[9px] font-medium rounded ${theme.badgeBg} border`}>
                {activity.activityType || theme.label}
              </span>
              {hasInnerActivities ? (
                <span className="px-1.5 py-0.2 text-[9px] text-[#605e5c] bg-[#ffffff] rounded border border-[#edebe9]">
                  {inners.length} {inners.length === 1 ? 'activity' : 'activities'}
                </span>
              ) : (
                <span 
                  className="px-1.5 py-0.2 text-[9px] text-[#8a8886] bg-[#f8f9fa] rounded border border-[#edebe9] italic"
                  title="No inner activities executed in this run (evaluated branch had 0 activities)"
                >
                  0 executed
                </span>
              )}
            </div>
          </div>
        </td>

        {/* Domain */}
        <td className="py-2.5 px-3 whitespace-nowrap">
          {domain ? (
            <span className="text-[#605e5c] text-[11px] font-medium">{domain}</span>
          ) : (
            <span className="text-[#a19f9d] text-[11px] italic">—</span>
          )}
        </td>

        <td className="py-2.5 px-3 whitespace-nowrap">
          <StatusBadge 
            status={status} 
            onSelectError={onSelectError}
            errorData={errorData}
          />
        </td>

        <td className="py-2.5 px-3 font-mono text-[#605e5c] text-xs whitespace-nowrap">
          {formatDateTime(startTime)}
        </td>

        <td className="py-2.5 px-3 font-mono text-[#605e5c] text-xs whitespace-nowrap">
          {formatDateTime(endTime)}
        </td>

        <td className="py-2.5 px-3 font-mono text-[#323130] text-xs whitespace-nowrap">
          {formatDuration(duration)}
        </td>

        <td className="py-2.5 px-3 text-right whitespace-nowrap">
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

      {/* Expanded Inner Activities */}
      {isExpanded && inners.map((innerAct, idx) => {
        const isInnerSub = innerAct.childPipeline != null || ['executepipeline', 'invokepipeline'].includes(innerAct.activityType?.toLowerCase());
        if (isInnerSub) {
          return (
            <ExecutePipelineActivityRow
              key={innerAct.activityRunId || `sub-${depth}-${idx}`}
              activity={innerAct}
              depth={depth + 1}
              domain={domain}
              onSelectError={onSelectError}
              onOpenRunHistory={onOpenRunHistory}
              onOpenSchedule={onOpenSchedule}
              onOpenSlaConfig={onOpenSlaConfig}
              onResolveIncident={onResolveIncident}
              onOpenTableLogs={onOpenTableLogs}
              onOpenSidePane={onOpenSidePane}
              userRole={userRole}
            />
          );
        }
        if (isContainerActivity(innerAct)) {
          return (
            <ContainerActivityRow
              key={innerAct.activityRunId || `container-${depth}-${idx}`}
              activity={innerAct}
              depth={depth + 1}
              domain={domain}
              onSelectError={onSelectError}
              onOpenRunHistory={onOpenRunHistory}
              onOpenSchedule={onOpenSchedule}
              onOpenSlaConfig={onOpenSlaConfig}
              onResolveIncident={onResolveIncident}
              onOpenTableLogs={onOpenTableLogs}
              onOpenSidePane={onOpenSidePane}
              userRole={userRole}
            />
          );
        }
        return (
          <LeafActivityRow
            key={innerAct.activityRunId || `inner-act-${idx}`}
            activity={innerAct}
            depth={depth + 1}
            domain={domain}
            onSelectError={onSelectError}
            onOpenSidePane={onOpenSidePane}
          />
        );
      })}
    </>
  );
}
