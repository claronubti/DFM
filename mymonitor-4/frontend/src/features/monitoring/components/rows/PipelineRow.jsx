import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronRight,
  ChevronDown,
  GitFork,
  Loader2,
  AlertCircle,
  Database,
  History,
  Calendar,
  Bell,
  MoreHorizontal,
  PanelRightOpen,
  Play
} from 'lucide-react';

import StatusBadge from '../badges/StatusBadge';
import SlaCountdownBadge from '../badges/SlaCountdownBadge';
import LeafActivityRow from './LeafActivityRow';
import ExecutePipelineActivityRow from './ExecutePipelineActivityRow';
import ContainerActivityRow from './ContainerActivityRow';
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
 * PipelineRow: Primary pipeline execution row in the Fabric hierarchy tree.
 *
 * HIERARCHY ROLE:
 * - Represents a full Fabric Pipeline run item (e.g., "PL_Bronze_Ingestion").
 * - Can be rendered at root depth (depth=0) or as an invoked child pipeline (isChild=true).
 * - When expanded, displays its activity runs:
 *     1. Leaf activities (Copy, Notebook, Script) -> renders <LeafActivityRow />
 *     2. Container loops (ForEach, IfCondition)    -> renders <ContainerActivityRow />
 *     3. Sub-pipeline calls (ExecutePipeline)      -> renders <ExecutePipelineActivityRow />
 *
 * @param {Object} props
 * @param {Object} props.pipeline - Pipeline run telemetry data.
 * @param {number} [props.depth=0] - Tree indentation depth.
 * @param {boolean} [props.isChild=false] - Whether this row represents an invoked child pipeline.
 * @param {boolean} [props.isExpanded] - Controlled expansion state.
 * @param {Function} [props.onToggleExpand] - Controlled expansion toggle handler.
 * @param {boolean} [props.isOtherBlurred=false] - When true, applies focus blur styling.
 * @param {Function} [props.onSelectError] - Handler for error diagnostics modal.
 * @param {Function} [props.onOpenRunHistory] - Handler for run history modal.
 * @param {Function} [props.onOpenSchedule] - Handler for schedules & triggers modal.
 * @param {Function} [props.onOpenSlaConfig] - Handler for SLA & team assignment modal.
 * @param {Function} [props.onResolveIncident] - Handler for resolving an active incident.
 * @param {Function} [props.onOpenTableLogs] - Handler for table-level telemetry drawer/modal.
 * @param {Function} [props.onOpenSidePane] - Handler for opening activity side pane.
 */
export default function PipelineRow({
  pipeline,
  depth = 0,
  isChild = false,
  isExpanded: controlledExpanded,
  onToggleExpand,
  isOtherBlurred = false,
  onSelectError,
  onOpenRunHistory,
  onOpenSchedule,
  onOpenSlaConfig,
  onResolveIncident,
  onOpenTableLogs,
  onOpenSidePane,
  userRole
}) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const toggleExpand = onToggleExpand || (() => setInternalExpanded(!internalExpanded));
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const menuDropdownRef = useRef(null);
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0 });

  const domain = pipeline.domain || pipeline.slaConfig?.domain || '';
  const displayActivities = useMemo(() => sortActivitiesByTimeline(nestContainerActivities(pipeline.activities || [])), [pipeline.activities]);
  const hasActivities = displayActivities && displayActivities.length > 0;
  const canExpand = hasActivities;
  const isFailed = pipeline.status?.toLowerCase() === 'failed';
  const [isRunningTrigger, setIsRunningTrigger] = useState(false);

  const handleTriggerRun = async (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const pid = pipeline.pipelineId || pipeline.id?.replace(/^norun-/, '');
    const wsId = pipeline.workspaceId;
    if (!pid || !wsId) return;
    setIsRunningTrigger(true);
    try {
      const res = await fetch(`/api/workspaces/${wsId}/pipelines/${pid}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (res.ok) {
        setIsMenuOpen(false);
      }
    } catch (err) {
      console.error('Trigger run error:', err);
    } finally {
      setIsRunningTrigger(false);
    }
  };

  const updateMenuPosition = () => {
    if (!menuButtonRef.current) return;
    const rect = menuButtonRef.current.getBoundingClientRect();
    const menuWidth = 224;
    const estimatedHeight = 250;

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top = rect.bottom + 4;
    // If not enough room below and more room above, position above the button
    if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
      top = Math.max(8, rect.top - estimatedHeight - 4);
    }

    let left = rect.right - menuWidth;
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }

    setMenuCoords({ top, left });
  };

  // Close context menu on outside click or scroll
  useEffect(() => {
    if (!isMenuOpen) return;
    updateMenuPosition();

    function handleClickOutside(e) {
      if (
        menuDropdownRef.current && !menuDropdownRef.current.contains(e.target) &&
        menuButtonRef.current && !menuButtonRef.current.contains(e.target)
      ) {
        setIsMenuOpen(false);
      }
    }

    function handleScrollOrResize(e) {
      if (menuDropdownRef.current && menuDropdownRef.current.contains(e.target)) return;
      setIsMenuOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isMenuOpen]);

  const errorData = isFailed ? {
    activityName: pipeline.pipelineName,
    activityType: "Pipeline",
    status: pipeline.status,
    activityRunStart: pipeline.startTime,
    activityRunEnd: pipeline.endTime,
    durationInMs: pipeline.durationInMs,
    error: pipeline.error,
    output: pipeline.error?.rawError
  } : null;

  return (
    <>
      <tr
        onClick={() => canExpand && toggleExpand()}
        className={`border-b border-[#edebe9] transition-all duration-300 group select-none ${isOtherBlurred ? "filter blur-[1.5px] opacity-40 hover:opacity-90 hover:blur-0 cursor-pointer" : ""
          } ${isExpanded && !isChild ? "bg-[#f8fafd] ring-1 ring-[#0f6cbd]/20 shadow-[0_2px_4px_rgba(0,0,0,0.03)]" : ""
          } ${canExpand ? "cursor-pointer" : ""
          } ${isChild
            ? "bg-[#faf8ff] hover:bg-[#f3edfc]"
            : "bg-[#ffffff] hover:bg-[#f8f9fa]"
          }`}
      >
        {/* Name Column */}
        <td className="py-2.5 px-3" style={{ paddingLeft: `${depth * 24 + 16}px` }}>
          <div className="flex items-center gap-2 min-w-0">
            {canExpand ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand();
                }}
                className="p-0.5 rounded text-[#605e5c] hover:text-[#242424] transition cursor-pointer"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-[#0f6cbd]" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-[#605e5c]" />
                )}
              </button>
            ) : (
              <span className="w-4 h-4 inline-block" />
            )}

            {/* Item Icon */}
            <div className={`p-1 rounded shrink-0 ${isChild
              ? 'bg-[#f3e8ff] text-[#773adc] border border-[#773adc]/25'
              : 'bg-[#eff6fc] text-[#0f6cbd] border border-[#0f6cbd]/25'
              }`}>
              <GitFork className="w-3.5 h-3.5" />
            </div>

            {/* Pipeline Title & Run Metadata */}
            <div className="min-w-0 truncate">
              <div className="flex items-center gap-2 truncate">
                <span
                  onClick={(e) => {
                    if (!isChild && onOpenRunHistory) {
                      e.stopPropagation();
                      onOpenRunHistory(pipeline);
                    }
                  }}
                  title={!isChild && onOpenRunHistory ? "View run history" : undefined}
                  className={`font-semibold text-[#242424] text-xs tracking-tight truncate ${!isChild && onOpenRunHistory ? "hover:text-[#0f6cbd] hover:underline cursor-pointer" : ""
                    }`}
                >
                  {pipeline.pipelineName}
                </span>

                {isChild && (
                  <span className="px-1.5 py-0.2 text-[9px] font-medium rounded bg-[#f3e8ff] text-[#773adc] border border-[#773adc]/30">
                    Sub-pipeline
                  </span>
                )}

                {!pipeline.id?.startsWith("norun-") && (
                  <span className="px-1 py-0.2 text-[9px] font-mono text-[#605e5c] bg-[#f3f2f1] border border-[#edebe9] rounded">
                    #{pipeline.id?.slice(0, 8)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </td>

        {/* Domain Column */}
        <td className="py-2.5 px-3 whitespace-nowrap">
          {domain ? (
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#eff6fc] text-[#0f6cbd] border border-[#0f6cbd]/20">
              {domain}
            </span>
          ) : (
            <span className="text-[#a19f9d] text-[11px] italic">—</span>
          )}
        </td>

        {/* Status & SLA Column */}
        <td className="py-2.5 px-3 whitespace-nowrap">
          <div className="flex flex-col gap-1 items-start">
            <StatusBadge
              status={pipeline.status}
              onSelectError={onSelectError}
              errorData={errorData}
            />

            {/* Per-Pipeline Assigned L1 & L2 Team Indicator */}
            {pipeline.slaConfig && (pipeline.slaConfig.l1Email || pipeline.slaConfig.l1Name) && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenSlaConfig) onOpenSlaConfig(pipeline);
                }}
                title={`Pipeline Team: L1 Support: ${pipeline.slaConfig.l1Name || pipeline.slaConfig.l1Email} • L2 Escalation: ${pipeline.slaConfig.l2Name || pipeline.slaConfig.l2Email || 'Not assigned'}`}
                className="inline-flex items-center gap-1.5 mt-0.5 px-1.5 py-0.5 rounded bg-[#f3f2f1] hover:bg-[#eff6fc] border border-[#edebe9] hover:border-[#0f6cbd]/30 text-[#605e5c] hover:text-[#0f6cbd] text-[10px] transition cursor-pointer group/team"
              >
                <span className="w-3.5 h-3.5 rounded-full bg-[#0f6cbd] text-white flex items-center justify-center font-bold text-[8px]">
                  {pipeline.slaConfig.l1Name ? pipeline.slaConfig.l1Name.slice(0, 2).toUpperCase() : 'L1'}
                </span>
                <span className="truncate max-w-[110px] font-medium">
                  {pipeline.slaConfig.l1Name || (pipeline.slaConfig.l1Email ? pipeline.slaConfig.l1Email.split('@')[0] : 'L1 Support')}
                </span>
                <span className="text-[#a19f9d] text-[9px] group-hover/team:text-[#0f6cbd]">✎</span>
              </div>
            )}

            {(isFailed || pipeline.incident?.status === 'RESOLVED') && (pipeline.incident || pipeline.slaConfig) && (
              <SlaCountdownBadge
                incident={pipeline.incident}
                slaConfig={pipeline.slaConfig}
                onResolve={onResolveIncident}
                pipeline={pipeline}
                userRole={userRole}
              />
            )}
          </div>
        </td>

        {/* Start Time Column */}
        <td className="py-2.5 px-3 font-mono text-[#605e5c] text-xs whitespace-nowrap">
          {formatDateTime(pipeline.startTime)}
        </td>

        {/* End Time Column */}
        <td className="py-2.5 px-3 font-mono text-[#605e5c] text-xs whitespace-nowrap">
          {formatDateTime(pipeline.endTime)}
        </td>

        {/* Duration Column */}
        <td className="py-2.5 px-3 font-mono text-[#323130] text-xs whitespace-nowrap font-medium">
          {pipeline.status?.toLowerCase() === 'scheduled' ? (
            <span className="text-[#773adc] text-xs">Upcoming</span>
          ) : pipeline.status?.toLowerCase() === 'not run' ? (
            <span className="text-[#797775]">—</span>
          ) : (
            formatDuration(computeDuration(pipeline))
          )}
        </td>

        {/* Actions Column */}
        <td className="py-2.5 px-3 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {/* Quick Run Pipeline */}
            {!isChild && (
              <button
                type="button"
                disabled={isRunningTrigger}
                onClick={handleTriggerRun}
                title="Run pipeline now"
                className="p-1 rounded text-[#107c41] hover:text-[#0b5a2f] hover:bg-[#dff6dd] transition opacity-0 group-hover:opacity-100 disabled:opacity-50 cursor-pointer"
              >
                {isRunningTrigger ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
              </button>
            )}

            {/* Quick Run History */}
            {!isChild && onOpenRunHistory && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenRunHistory(pipeline);
                }}
                title="View run history"
                className="p-1 rounded text-[#0f6cbd] hover:text-[#0c5999] hover:bg-[#eff6fc] transition opacity-0 group-hover:opacity-100 cursor-pointer"
              >
                <History className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Quick Details Trigger */}
            {onOpenSidePane && (
              <button
                type="button"
                onClick={() => onOpenSidePane(pipeline)}
                title="Open detail pane"
                className="p-1 rounded text-[#797775] hover:text-[#242424] hover:bg-[#f3f2f1] transition opacity-0 group-hover:opacity-100 cursor-pointer"
              >
                <PanelRightOpen className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Context Menu Dropdown */}
            <div>
              <button
                ref={menuButtonRef}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isMenuOpen) updateMenuPosition();
                  setIsMenuOpen((prev) => !prev);
                }}
                title="More options"
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
                className="p-1 rounded text-[#605e5c] hover:text-[#242424] hover:bg-[#f3f2f1] transition cursor-pointer"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {isMenuOpen && createPortal(
                <div
                  ref={menuDropdownRef}
                  style={{
                    position: 'fixed',
                    top: `${menuCoords.top}px`,
                    left: `${menuCoords.left}px`,
                    width: '224px',
                    zIndex: 99999
                  }}
                  className="rounded-md bg-[#ffffff] border border-[#d1d1d1] shadow-[0_8px_16px_rgba(0,0,0,0.14),0_0_2px_rgba(0,0,0,0.12)] overflow-hidden py-1 text-left font-sans select-none animate-in fade-in-50 zoom-in-95 duration-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Run Pipeline */}
                  {!isChild && (
                    <button
                      type="button"
                      disabled={isRunningTrigger}
                      onClick={handleTriggerRun}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#107c41] hover:bg-[#dff6dd] transition disabled:opacity-50 font-medium cursor-pointer"
                    >
                      {isRunningTrigger ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#107c41]" />
                      ) : (
                        <Play className="w-3.5 h-3.5 text-[#107c41] fill-current" />
                      )}
                      <span>{isRunningTrigger ? 'Triggering...' : 'Run pipeline'}</span>
                    </button>
                  )}

                  {/* View Details */}
                  {onOpenSidePane && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenSidePane(pipeline);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#323130] hover:bg-[#f3f2f1] hover:text-[#242424] transition cursor-pointer"
                    >
                      <PanelRightOpen className="w-3.5 h-3.5 text-[#0f6cbd]" />
                      <span>View details</span>
                    </button>
                  )}

                  {/* Run History */}
                  {!isChild && onOpenRunHistory && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenRunHistory(pipeline);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#323130] hover:bg-[#f3f2f1] hover:text-[#242424] transition cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5 text-[#0f6cbd]" />
                      <span>View run history</span>
                    </button>
                  )}

                  {/* Schedules */}
                  {!isChild && onOpenSchedule && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenSchedule(pipeline);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#323130] hover:bg-[#f3f2f1] hover:text-[#242424] transition cursor-pointer"
                    >
                      <Calendar className="w-3.5 h-3.5 text-[#773adc]" />
                      <span>View schedules & triggers</span>
                    </button>
                  )}

                  {/* SLA Config */}
                  {!isChild && onOpenSlaConfig && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenSlaConfig(pipeline);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#323130] hover:bg-[#f3f2f1] hover:text-[#242424] transition cursor-pointer"
                    >
                      <Bell className="w-3.5 h-3.5 text-[#0f6cbd]" />
                      <span>Configure L1/L2 team & SLA</span>
                    </button>
                  )}

                  {/* Lakehouse Table Logs */}
                  {onOpenTableLogs && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenTableLogs(pipeline);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#323130] hover:bg-[#f3f2f1] hover:text-[#242424] transition cursor-pointer"
                    >
                      <Database className="w-3.5 h-3.5 text-[#008272]" />
                      <span>Table-level logs</span>
                    </button>
                  )}

                  {/* Error Diagnostics */}
                  {isFailed && onSelectError && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onSelectError(errorData);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#c42b1c] hover:bg-[#fde7e9] transition border-t border-[#edebe9] mt-1 pt-1.5 cursor-pointer"
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>View error diagnostics</span>
                    </button>
                  )}
                </div>,
                document.body
              )}
            </div>
          </div>
        </td>
      </tr>

      {/* Expanded Child Activities & Sub-Pipelines */}
      {isExpanded && (
        <>
          {hasActivities && displayActivities.map((act, index) => {
            const isSubPipeline = act.childPipeline != null || ['executepipeline', 'invokepipeline'].includes(act.activityType?.toLowerCase());
            if (isSubPipeline) {
              return (
                <ExecutePipelineActivityRow
                  key={act.activityRunId || `act-sub-${index}`}
                  activity={act}
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
            if (isContainerActivity(act)) {
              return (
                <ContainerActivityRow
                  key={act.activityRunId || `act-container-${index}`}
                  activity={act}
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
                key={act.activityRunId || `act-${index}`}
                activity={act}
                depth={depth + 1}
                domain={domain}
                onSelectError={onSelectError}
                onOpenSidePane={onOpenSidePane}
              />
            );
          })}

          {!hasActivities && (
            <tr className="bg-[#f8f8f7] border-b border-[#edebe9]">
              <td
                colSpan={7}
                style={{ paddingLeft: `${(depth + 1) * 24 + 16}px` }}
                className="py-2.5 px-4 text-xs text-[#797775] italic"
              >
                No activity telemetry recorded yet for this pipeline run.
              </td>
            </tr>
          )}
        </>
      )}
    </>
  );
}
