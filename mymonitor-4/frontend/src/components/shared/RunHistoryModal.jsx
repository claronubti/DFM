/**
 * RunHistoryModal Component
 * 
 * Provides an administrative modal dialog displaying the full execution run history
 * for a Microsoft Fabric pipeline. Supports drill-down into activity execution trees,
 * container activity loops, and failure diagnostics.
 *
 * @param {Object} props
 * @param {string} props.workspaceId - Fabric workspace ID.
 * @param {Object} props.pipeline - Pipeline descriptor object.
 * @param {boolean} props.isOpen - Whether modal is visible.
 * @param {() => void} props.onClose - Callback to close modal.
 * @param {(err: Object) => void} props.onSelectError - Callback when user clicks error button.
 * @param {(wsId: string, pipe: Object) => void} [props.onOpenTableLogs] - Optional callback to jump to table logs.
 * @returns {JSX.Element|null}
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  History,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  AlertCircle,
  RefreshCw,
  Loader2,
  Database,
  Sparkles
} from 'lucide-react';
import StatusBadge from '../../features/monitoring/components/badges/StatusBadge';
import {
  formatDateTime,
  formatDuration,
  computeDuration
} from '../../features/monitoring/utils/formatters';
import {
  isContainerActivity,
  nestContainerActivities,
  sortActivitiesByTimeline
} from '../../features/monitoring/utils/activityTreeUtils';
import HistoryActivityRow from './history/HistoryActivityRow';
import HistorySubPipelineRow from './history/HistorySubPipelineRow';
import HistoryContainerRow from './history/HistoryContainerRow';

export default function RunHistoryModal({ workspaceId, pipeline, isOpen, onClose, onSelectError, onOpenTableLogs }) {
  const [runs, setRuns] = useState([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedRunIds, setExpandedRunIds] = useState(new Set());
  const [loadingRunActs, setLoadingRunActs] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const tableContainerRef = useRef(null);

  const pid = pipeline?.pipelineId || (pipeline?.id && !pipeline.id.startsWith("norun-") ? pipeline.id : pipeline?.id?.replace(/^norun-/, ''));

  const fetchHistory = async (targetPage = currentPage, targetPageSize = pageSize) => {
    if (!isOpen || !pipeline || !workspaceId || !pid) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/pipelines/${pid}/history?page=${targetPage}&page_size=${targetPageSize}`
      );
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
        if (typeof data.total === 'number') {
          setTotalRuns(data.total);
        } else {
          setTotalRuns((data.runs || []).length);
        }
      }
    } catch (err) {
      console.error('Failed to fetch run history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && pid && workspaceId) {
      setCurrentPage(1);
      setExpandedRunIds(new Set());
      fetchHistory(1, pageSize);
    }
  }, [isOpen, pid, workspaceId]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const totalPages = Math.max(1, Math.ceil(totalRuns / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + runs.length, totalRuns);

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages || newPage === currentPage) return;
    setCurrentPage(newPage);
    fetchHistory(newPage, pageSize);
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePageSizeChange = (newSize) => {
    if (newSize === pageSize) return;
    setPageSize(newSize);
    setCurrentPage(1);
    fetchHistory(1, newSize);
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages = [];
    if (safeCurrentPage <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push('...');
      pages.push(totalPages);
    } else if (safeCurrentPage >= totalPages - 3) {
      pages.push(1);
      pages.push('...');
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      pages.push('...');
      pages.push(safeCurrentPage - 1);
      pages.push(safeCurrentPage);
      pages.push(safeCurrentPage + 1);
      pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  if (!isOpen || !pipeline) return null;

  const toggleRun = async (runId) => {
    const isCurrentlyExpanded = expandedRunIds.has(runId);
    setExpandedRunIds((prev) => {
      const next = new Set(prev);
      if (isCurrentlyExpanded) next.delete(runId);
      else next.add(runId);
      return next;
    });

    if (!isCurrentlyExpanded) {
      const targetRun = runs.find((r) => r.id === runId);
      if (targetRun && (!targetRun.activities || targetRun.activities.length === 0)) {
        setLoadingRunActs((prev) => new Set(prev).add(runId));
        try {
          const res = await fetch(`/api/workspaces/${workspaceId}/pipelines/${pid}/runs/${runId}/activities`);
          if (res.ok) {
            const acts = await res.json();
            if (acts && Array.isArray(acts) && acts.length > 0) {
              setRuns((prevRuns) =>
                prevRuns.map((r) => (r.id === runId ? { ...r, activities: acts } : r))
              );
            }
          }
        } catch (err) {
          console.warn('Failed to load on-demand activities for run:', runId, err);
        } finally {
          setLoadingRunActs((prev) => {
            const next = new Set(prev);
            next.delete(runId);
            return next;
          });
        }
      }
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
    >
      <div className="relative w-full max-w-5xl bg-[#ffffff] border border-[#edebe9] rounded-lg shadow-[0_16px_32px_rgba(0,0,0,0.16),0_4px_8px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#edebe9] flex items-center justify-between bg-[#faf9f8]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded bg-[#eff6fc] text-[#0f6cbd] border border-[#d1d1d1]">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-[#242424] text-sm">
                Run history
              </h3>
              <p
                className="text-xs text-[#605e5c] font-mono mt-0.5"
                title={`Pipeline ID: ${pipeline.pipelineId || pipeline.id || ''}`}
              >
                {pipeline.pipelineName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fetchHistory(currentPage, pageSize)}
              title="Refresh history"
              className="p-1.5 rounded text-[#605e5c] hover:text-[#242424] hover:bg-[#f3f2f1] transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#0f6cbd]' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded text-[#605e5c] hover:text-[#242424] hover:bg-[#f3f2f1] transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Table */}
        <div ref={tableContainerRef} className="flex-1 overflow-y-auto p-4 bg-[#faf9f8]">
          {loading && runs.length === 0 ? (
            <div className="py-16 text-center text-xs text-[#605e5c] flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#0f6cbd]" />
              <span>Loading execution history from Fabric...</span>
            </div>
          ) : runs.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#605e5c] bg-[#ffffff] rounded border border-[#edebe9]">
              No historical execution runs recorded for this pipeline yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded border border-[#edebe9] bg-[#ffffff]">
              <table className={`w-full text-left border-collapse min-w-[700px] transition-opacity duration-150 ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
                <thead>
                  <tr className="bg-[#faf9f8] text-[#605e5c] text-[11px] font-semibold uppercase tracking-wider border-b border-[#edebe9]">
                    <th className="py-2 px-3 w-[35%]">Run ID / invoke type</th>
                    <th className="py-2 px-3 w-[15%]">Status</th>
                    <th className="py-2 px-3 w-[18%]">Start time</th>
                    <th className="py-2 px-3 w-[18%]">End time</th>
                    <th className="py-2 px-3 w-[10%]">Duration</th>
                    <th className="py-2 px-3 w-[4%] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edebe9]">
                  {runs.map((r) => {
                    const isExpanded = expandedRunIds.has(r.id);
                    const isLoadingThisRun = loadingRunActs.has(r.id);
                    const hasActs = r.activities && r.activities.length > 0;
                    const isFailed = r.status?.toLowerCase() === 'failed';
                    const hasError = isFailed && r.error && (r.error.message || r.error.errorCode);
                    const canExpand = true;

                    return (
                      <React.Fragment key={r.id}>
                        {/* Parent Run Row */}
                        <tr
                          onClick={() => canExpand && toggleRun(r.id)}
                          className={`border-b border-[#edebe9] bg-[#ffffff] hover:bg-[#f3f2f1] transition text-xs ${canExpand ? 'cursor-pointer' : ''}`}
                        >
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              {canExpand ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleRun(r.id);
                                  }}
                                  className="p-0.5 rounded text-[#605e5c] hover:text-[#242424]"
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
                              <div>
                                <span className="font-mono text-xs font-semibold text-[#0f6cbd]">
                                  #{r.id?.slice(0, 8)}
                                </span>
                                <div className="text-[10px] text-[#605e5c] font-mono">
                                  Trigger: {r.invokeType || 'Manual'}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-2 px-3 whitespace-nowrap">
                            <StatusBadge
                              status={r.status}
                              onSelectError={onSelectError}
                              errorData={isFailed ? {
                                activityName: pipeline.pipelineName,
                                activityType: 'Pipeline',
                                status: r.status,
                                activityRunStart: r.startTime,
                                activityRunEnd: r.endTime,
                                durationInMs: r.durationInMs,
                                error: r.error,
                                output: r.error?.rawError
                              } : null}
                            />
                          </td>

                          <td className="py-2 px-3 font-mono text-xs text-[#605e5c] whitespace-nowrap">
                            {formatDateTime(r.startTime)}
                          </td>

                          <td className="py-2 px-3 font-mono text-xs text-[#605e5c] whitespace-nowrap">
                            {formatDateTime(r.endTime)}
                          </td>

                          <td className="py-2 px-3 font-mono text-xs text-[#242424] font-medium whitespace-nowrap">
                            {formatDuration(computeDuration(r))}
                          </td>

                          <td className="py-2 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                              {onOpenTableLogs && (
                                <button
                                  type="button"
                                  onClick={() => onOpenTableLogs(r)}
                                  title="View Table Logs"
                                  className="p-1 rounded text-[#605e5c] hover:text-[#0f6cbd] hover:bg-[#eff6fc] transition"
                                >
                                  <Database className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {isFailed && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSelectError({
                                      activityName: pipeline.pipelineName,
                                      activityType: 'Pipeline',
                                      status: r.status,
                                      activityRunStart: r.startTime,
                                      activityRunEnd: r.endTime,
                                      durationInMs: r.durationInMs,
                                      error: r.error,
                                      output: r.error?.rawError
                                    });
                                  }}
                                  className="p-1 rounded text-[#605e5c] hover:text-[#a80000] hover:bg-[#fde7e9] transition"
                                  title="View Error Details"
                                >
                                  <AlertCircle className="w-3.5 h-3.5 text-[#a80000]" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Loading indicator when activities are being fetched on-demand */}
                        {isExpanded && isLoadingThisRun && (
                          <tr className="border-b border-[#edebe9] bg-[#faf9f8] text-xs">
                            <td colSpan={6} className="py-3 px-6 text-center text-[#605e5c]">
                              <div className="flex items-center justify-center gap-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0f6cbd]" />
                                <span>Loading activity executions...</span>
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* Activities for this run */}
                        {isExpanded && !isLoadingThisRun && hasActs && sortActivitiesByTimeline(nestContainerActivities(r.activities)).map((act, index) => {
                          const isSub = act.childPipeline != null || ['executepipeline', 'invokepipeline'].includes(act.activityType?.toLowerCase());
                          if (isSub) {
                            return (
                              <HistorySubPipelineRow
                                key={act.activityRunId || `sub-act-${index}`}
                                activity={act}
                                depth={1}
                                onSelectError={onSelectError}
                              />
                            );
                          }
                          if (isContainerActivity(act)) {
                            return (
                              <HistoryContainerRow
                                key={act.activityRunId || `container-act-${index}`}
                                activity={act}
                                depth={1}
                                onSelectError={onSelectError}
                              />
                            );
                          }
                          return (
                            <HistoryActivityRow
                              key={act.activityRunId || `act-${index}`}
                              activity={act}
                              depth={1}
                              onSelectError={onSelectError}
                            />
                          );
                        })}

                        {/* Inline Error Details if run has no child activities */}
                        {isExpanded && !isLoadingThisRun && !hasActs && hasError && (
                          <tr className="border-b border-[#fed7d7] bg-[#fff5f5]/80 text-xs">
                            <td colSpan={6} className="py-2.5 px-6">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-2.5">
                                  <AlertCircle className="w-4 h-4 text-[#c53030] shrink-0 mt-0.5" />
                                  <div>
                                    <div className="font-semibold text-[#9b2c2c] text-xs">
                                      {r.error.errorCode ? `[Error ${r.error.errorCode}] ` : ''}
                                      {r.error.message || 'Execution failed.'}
                                    </div>
                                    {r.error.failureType && (
                                      <span className="text-[10px] text-[#742a2a] font-mono mt-0.5 inline-block">
                                        Type: {r.error.failureType}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectError({
                                      activityName: pipeline.pipelineName,
                                      activityType: 'Pipeline',
                                      status: r.status,
                                      activityRunStart: r.startTime,
                                      activityRunEnd: r.endTime,
                                      durationInMs: r.durationInMs,
                                      error: r.error,
                                      output: r.error?.rawError
                                    });
                                  }}
                                  className="shrink-0 px-2.5 py-1 rounded text-[11px] font-medium bg-[#ffffff] hover:bg-[#fed7d7] text-[#c53030] border border-[#feb2b2] transition shadow-sm flex items-center gap-1.5"
                                >
                                  <Sparkles className="w-3 h-3 text-[#c53030]" />
                                  <span>View AI Diagnostics</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Bottom Pagination Bar */}
        {totalRuns > 0 && (
          <div className="px-5 py-3 border-t border-[#edebe9] bg-[#faf9f8] shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            {/* Left: Summary info & Page size selector */}
            <div className="flex items-center gap-3 text-[#605e5c]">
              <div>
                Showing{' '}
                <span className="font-semibold font-mono text-[#242424]">
                  {totalRuns === 0 ? 0 : startIndex + 1}
                </span>
                –
                <span className="font-semibold font-mono text-[#242424]">
                  {endIndex}
                </span>{' '}
                of{' '}
                <span className="font-semibold font-mono text-[#242424]">
                  {totalRuns}
                </span>{' '}
                runs
              </div>

              <div className="h-3 w-px bg-[#d1d1d1]" />

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-[#605e5c]">Show:</span>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="bg-[#ffffff] border border-[#d1d1d1] rounded px-2 py-0.5 text-xs text-[#242424] focus:outline-none focus:border-[#0f6cbd] cursor-pointer hover:bg-[#f3f2f1] transition font-medium"
                >
                  <option value={10}>10 runs</option>
                  <option value={20}>20 runs</option>
                  <option value={50}>50 runs</option>
                </select>
              </div>
            </div>

            {/* Right: Page navigation buttons */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handlePageChange(1)}
                disabled={safeCurrentPage === 1}
                title="First Page"
                className="p-1.5 rounded text-[#605e5c] hover:text-[#242424] hover:bg-[#edebe9] disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => handlePageChange(safeCurrentPage - 1)}
                disabled={safeCurrentPage === 1}
                className="px-2.5 py-1 rounded border border-[#d1d1d1] bg-[#ffffff] hover:bg-[#f3f2f1] text-[#242424] text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center gap-1 cursor-pointer shadow-2xs"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <div className="flex items-center gap-1 px-1">
                {getPageNumbers().map((p, idx) => {
                  if (p === '...') {
                    return (
                      <span key={`ellipsis-${idx}`} className="px-1.5 py-0.5 text-[#605e5c] font-medium">
                        …
                      </span>
                    );
                  }
                  const isCurrent = p === safeCurrentPage;
                  return (
                    <button
                      key={`page-${p}`}
                      type="button"
                      onClick={() => handlePageChange(p)}
                      className={`min-w-[28px] h-7 px-2 rounded text-xs font-medium transition cursor-pointer flex items-center justify-center ${isCurrent
                          ? 'bg-[#0f6cbd] text-white font-semibold shadow-2xs'
                          : 'bg-[#ffffff] text-[#242424] hover:bg-[#f3f2f1] border border-[#edebe9]'
                        }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => handlePageChange(safeCurrentPage + 1)}
                disabled={safeCurrentPage === totalPages}
                className="px-2.5 py-1 rounded border border-[#d1d1d1] bg-[#ffffff] hover:bg-[#f3f2f1] text-[#242424] text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center gap-1 cursor-pointer shadow-2xs"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => handlePageChange(totalPages)}
                disabled={safeCurrentPage === totalPages}
                title="Last Page"
                className="p-1.5 rounded text-[#605e5c] hover:text-[#242424] hover:bg-[#edebe9] disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
