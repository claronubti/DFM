import React, { useState } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Layers, 
  AlertCircle 
} from 'lucide-react';
import StatusBadge from '../badges/StatusBadge';
import LeafActivityRow from './LeafActivityRow';
import ContainerActivityRow from './ContainerActivityRow';
import PipelineRow from './PipelineRow';
import { 
  formatDateTime, 
  formatDuration, 
  computeDuration 
} from '../../utils/formatters';
import { 
  isContainerActivity, 
  sortActivitiesByTimeline, 
  nestContainerActivities 
} from '../../utils/activityTreeUtils';

/**
 * ExecutePipelineActivityRow (SubPipeline Activity):
 * Renders an activity OF TYPE "ExecutePipeline" or "InvokePipeline" inside a parent pipeline.
 *
 * HIERARCHY ROLE:
 * - Represents an activity run step that calls another pipeline.
 * - Expanding this row reveals the child pipeline's inner telemetry activities.
 *
 * @param {Object} props
 * @param {Object} props.activity - Activity telemetry containing childPipeline or invoke metadata.
 * @param {number} [props.depth=0] - Hierarchy indentation depth.
 * @param {Function} [props.onSelectError] - Handler for error diagnostics modal.
 * @param {Function} [props.onOpenRunHistory] - Handler to view pipeline run history.
 * @param {Function} [props.onOpenSchedule] - Handler to open pipeline scheduling modal.
 * @param {Function} [props.onOpenSlaConfig] - Handler to configure pipeline SLA.
 * @param {Function} [props.onResolveIncident] - Handler to resolve pipeline incident.
 * @param {Function} [props.onOpenTableLogs] - Handler to inspect table audit telemetry.
 * @param {Function} [props.onOpenSidePane] - Handler to inspect activity detail side pane.
 * @param {string} [props.domain] - Domain tag inherited from parent pipeline.
 */
export default function ExecutePipelineActivityRow({ 
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
  const child = activity.childPipeline;
  const effectiveDomain = child?.domain || child?.slaConfig?.domain || domain || '';
  const hasInnerActivities = child?.activities && child.activities.length > 0;
  const hasInnerChildren = child?.childPipelines && child.childPipelines.length > 0;
  const canExpand = hasInnerActivities || hasInnerChildren;

  const startTime = activity.activityRunStart || child?.startTime;
  const endTime = activity.activityRunEnd || child?.endTime;
  const duration = computeDuration(activity) || (child ? computeDuration(child) : 0);
  const status = activity.status || child?.status || "Unknown";
  const isFailed = status?.toLowerCase() === 'failed';

  const err = activity.error || child?.error;
  const errorData = isFailed ? {
    activityName: activity.activityName,
    activityType: activity.activityType || "Sub-pipeline",
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
        className={`border-b border-[#edebe9] bg-[#faf8ff] hover:bg-[#f3edfc] transition-colors text-xs ${
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
                  <ChevronDown className="w-3.5 h-3.5 text-[#773adc]" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-[#605e5c]" />
                )}
              </button>
            ) : (
              <div className="w-4 h-4 flex items-center justify-center shrink-0 text-[#c8c6c4]">
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                  <path d="M4 0 V10 H14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                </svg>
              </div>
            )}

            <div className="p-1 rounded bg-[#f3e8ff] text-[#773adc] border border-[#773adc]/30 shrink-0">
              <Layers className="w-3.5 h-3.5" />
            </div>

            <div className="flex items-center gap-1.5 truncate">
              <span className="font-semibold text-[#242424] text-xs truncate">
                {activity.activityName}
              </span>
              <span className="px-1.5 py-0.2 text-[9px] font-medium rounded bg-[#f3e8ff] text-[#773adc] border border-[#773adc]/30">
                {activity.activityType || 'Sub-pipeline'}
              </span>
            </div>
          </div>
        </td>

        {/* Domain */}
        <td className="py-2.5 px-3 whitespace-nowrap">
          {effectiveDomain ? (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#eff6fc] text-[#0f6cbd] border border-[#0f6cbd]/20">
              {effectiveDomain}
            </span>
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

      {/* Expanded Inner Activities of the invoked Child Pipeline */}
      {isExpanded && child && (
        <>
          {child.activities && sortActivitiesByTimeline(nestContainerActivities(child.activities)).map((innerAct, idx) => {
            const isInnerSub = innerAct.childPipeline != null || ['executepipeline', 'invokepipeline'].includes(innerAct.activityType?.toLowerCase());
            if (isInnerSub) {
              return (
                <ExecutePipelineActivityRow
                  key={innerAct.activityRunId || `sub-${depth}-${idx}`}
                  activity={innerAct}
                  depth={depth + 1}
                  domain={effectiveDomain}
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
                  domain={effectiveDomain}
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
                domain={effectiveDomain}
                onSelectError={onSelectError}
                onOpenSidePane={onOpenSidePane}
              />
            );
          })}

          {child.childPipelines && child.childPipelines.map((innerChild) => (
            <PipelineRow
              key={innerChild.id}
              pipeline={innerChild}
              depth={depth + 1}
              isChild={true}
              onSelectError={onSelectError}
              onOpenRunHistory={onOpenRunHistory}
              onOpenSchedule={onOpenSchedule}
              onOpenSlaConfig={onOpenSlaConfig}
              onResolveIncident={onResolveIncident}
              onOpenTableLogs={onOpenTableLogs}
              onOpenSidePane={onOpenSidePane}
              userRole={userRole}
            />
          ))}

          {!hasInnerActivities && !hasInnerChildren && (
            <tr className="bg-[#f8f8f7] border-b border-[#edebe9]">
              <td 
                colSpan={7} 
                style={{ paddingLeft: `${(depth + 1) * 24 + 16}px` }}
                className="py-2 px-4 text-xs text-[#797775] italic"
              >
                No inner activity telemetry recorded for this sub-pipeline.
              </td>
            </tr>
          )}
        </>
      )}
    </>
  );
}
