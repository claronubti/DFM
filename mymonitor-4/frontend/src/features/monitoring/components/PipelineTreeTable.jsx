import React, { useState, useMemo, useRef, useEffect } from 'react';
import { RotateCcw, ArrowDown, ArrowUpDown } from 'lucide-react';
import PipelineRow from './rows/PipelineRow';
import FabricCommandBar from './FabricCommandBar';
import FabricMetricCards from './FabricMetricCards';

/**
 * Microsoft Fabric Native Spot Illustration: No Workspace Selected
 */
function WorkspaceEmptyIllustration() {
  return (
    <svg className="w-16 h-16 mx-auto" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fabric_cube_grad1" x1="16" y1="12" x2="48" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#EFF6FC" />
          <stop offset="100%" stopColor="#DEECF9" />
        </linearGradient>
      </defs>
      {/* Base shadow */}
      <ellipse cx="32" cy="52" rx="22" ry="6" fill="#F3F2F1" />
      {/* Cube Top */}
      <polygon points="32,14 48,22 32,30 16,22" fill="#FFFFFF" stroke="#0F6CBD" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Cube Left */}
      <polygon points="16,22 32,30 32,46 16,38" fill="url(#fabric_cube_grad1)" stroke="#0F6CBD" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Cube Right */}
      <polygon points="32,30 48,22 48,38 32,46" fill="#C7E0F4" stroke="#0F6CBD" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Workspace diamond glyph */}
      <polygon points="32,20 36,22 32,24 28,22" fill="#0F6CBD" />
      {/* Connecting dots */}
      <circle cx="24" cy="34" r="1.5" fill="#0F6CBD" />
      <circle cx="40" cy="34" r="1.5" fill="#0F6CBD" />
      <line x1="24" y1="34" x2="40" y2="34" stroke="#0F6CBD" strokeWidth="1" strokeDasharray="2 2" />
    </svg>
  );
}

/**
 * Microsoft Fabric Native Spot Illustration: No Data Pipelines Configured
 */
function PipelinesEmptyIllustration() {
  return (
    <svg className="w-16 h-16 mx-auto" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="32" cy="52" rx="20" ry="5" fill="#F3F2F1" />
      {/* Pipeline node 1 */}
      <rect x="12" y="24" width="12" height="12" rx="2.5" fill="#EFF6FC" stroke="#0F6CBD" strokeWidth="1.5" />
      {/* Pipeline node 2 */}
      <rect x="40" y="24" width="12" height="12" rx="2.5" fill="#EFF6FC" stroke="#0F6CBD" strokeWidth="1.5" />
      {/* Connecting arrow line */}
      <path d="M24 30 L40 30" stroke="#0F6CBD" strokeWidth="1.5" strokeDasharray="3 2" />
      <polygon points="38,28 42,30 38,32" fill="#0F6CBD" />
      {/* Pipeline icon accents */}
      <circle cx="18" cy="30" r="2" fill="#0F6CBD" />
      <circle cx="46" cy="30" r="2" fill="#00A2ED" />
      <path d="M32 16 L32 24" stroke="#D1D1D1" strokeWidth="1.2" strokeDasharray="2 2" />
    </svg>
  );
}

/**
 * Microsoft Fabric Native Spot Illustration: No Filter Matches
 */
function FilterEmptyIllustration() {
  return (
    <svg className="w-16 h-16 mx-auto" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="32" cy="52" rx="20" ry="5" fill="#F3F2F1" />
      {/* Document page */}
      <rect x="18" y="14" width="28" height="34" rx="3" fill="#FFFFFF" stroke="#D1D1D1" strokeWidth="1.5" />
      {/* Text lines */}
      <line x1="24" y1="22" x2="36" y2="22" stroke="#E1DFDD" strokeWidth="2" strokeLinecap="round" />
      <line x1="24" y1="28" x2="40" y2="28" stroke="#E1DFDD" strokeWidth="2" strokeLinecap="round" />
      <line x1="24" y1="34" x2="34" y2="34" stroke="#E1DFDD" strokeWidth="2" strokeLinecap="round" />
      {/* Magnifier Glass scanning */}
      <circle cx="38" cy="38" r="9" fill="#EFF6FC" stroke="#0F6CBD" strokeWidth="1.5" />
      <line x1="45" y1="45" x2="52" y2="52" stroke="#0F6CBD" strokeWidth="2" strokeLinecap="round" />
      <circle cx="38" cy="38" r="4" fill="#C7E0F4" opacity="0.6" />
    </svg>
  );
}

export default function PipelineTreeTable({
  workspaceId,
  pipelines = [],
  metrics = {},
  dateFilter = {},
  dateFilterInfo = {},
  onDateFilterChange,
  onSelectError,
  isLoading,
  isSyncing,
  syncProgress,
  isInitialLoad,
  onRefresh,
  lastUpdated,
  onOpenRunHistory,
  onOpenSchedule,
  onOpenSlaConfig,
  onResolveIncident,
  onOpenTableLogs,
  onOpenTableLogConfig,
  onOpenSidePane,
  userRole
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [expandedPipelineId, setExpandedPipelineId] = useState(null);
  const [sortField, setSortField] = useState('startTime');
  const [sortDirection, setSortDirection] = useState('desc');
  const tableContainerRef = useRef(null);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredPipelines = useMemo(() => {
    return pipelines.filter((pipe) => {
      // 1. Search filter by pipeline or activity name
      const term = search.trim().toLowerCase();
      const matchesSearch = !term ||
        pipe.pipelineName?.toLowerCase().includes(term) ||
        (pipe.activities && pipe.activities.some(a => a.activityName?.toLowerCase().includes(term)));

      // 2. Status filter
      const s = pipe.status?.toLowerCase() || '';
      if (statusFilter === 'ALL') return matchesSearch;
      if (statusFilter === 'RUNNING') return matchesSearch && ['inprogress', 'in progress', 'running'].includes(s);
      if (statusFilter === 'FAILED') return matchesSearch && s === 'failed';
      if (statusFilter === 'SLA_BREACHED') {
        const incStatus = (pipe.incident?.status || '').toUpperCase();
        return matchesSearch && ['ACTIVE', 'ESCALATED_L2', 'CRITICAL_UNRESOLVED'].includes(incStatus);
      }
      if (statusFilter === 'CANCELLED') return matchesSearch && ['cancelled', 'canceled'].includes(s);
      if (statusFilter === 'SUCCEEDED') return matchesSearch && ['completed', 'succeeded', 'success'].includes(s);
      if (statusFilter === 'NO_RUNS') return matchesSearch && ['no runs', 'notstarted', 'not started', 'never executed', 'noruns', 'not run', 'not_run'].includes(s);
      if (statusFilter === 'SCHEDULED') return matchesSearch && (
        ['scheduled', 'upcoming'].includes(s) || (pipe.schedule && pipe.schedule.enabled)
      );
      if (statusFilter === 'NOT_SCHEDULED') return matchesSearch && (
        s === 'not scheduled' || (!pipe.schedule || !pipe.schedule.enabled)
      );
      return matchesSearch;
    });
  }, [pipelines, search, statusFilter]);

  const sortedPipelines = useMemo(() => {
    if (!sortField) return filteredPipelines;
    return [...filteredPipelines].sort((a, b) => {
      if (sortField === 'activityName') {
        const valA = a.pipelineName || '';
        const valB = b.pipelineName || '';
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (sortField === 'startTime') {
        const timeA = new Date(a.startTime || 0).getTime();
        const timeB = new Date(b.startTime || 0).getTime();
        return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
      }
      if (sortField === 'duration') {
        const durA = a.durationInMs || 0;
        const durB = b.durationInMs || 0;
        return sortDirection === 'asc' ? durA - durB : durB - durA;
      }
      if (sortField === 'status') {
        const valA = a.status || '';
        const valB = b.status || '';
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return 0;
    });
  }, [filteredPipelines, sortField, sortDirection]);

  // Keep table perfectly aligned on the left at all times
  useEffect(() => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollLeft = 0;
    }
  }, [workspaceId, sortedPipelines]);

  return (
    <div className="space-y-2.5 select-none font-sans">
      {/* Fluent Command Bar */}
      <FabricCommandBar
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        dateFilter={dateFilter}
        dateFilterInfo={dateFilterInfo}
        onDateFilterChange={(newFilter) => {
          setStatusFilter('ALL');
          if (onDateFilterChange) onDateFilterChange(newFilter);
        }}
        onRefresh={onRefresh}
        isLoading={isLoading}
        isSyncing={isSyncing}
        syncProgress={syncProgress}
        isInitialLoad={isInitialLoad !== undefined ? isInitialLoad : pipelines.length === 0}
        lastUpdated={lastUpdated}
        onOpenTableLogConfig={onOpenTableLogConfig}
      />

      {/* Fluent 2 KPI Metric Summary Cards */}
      <div data-tour="kpi-cards">
        <FabricMetricCards
          metrics={metrics}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          isFuture={!!dateFilterInfo?.isFuture}
          isLoading={isLoading && pipelines.length === 0}
        />
      </div>

      {/* Microsoft Fabric Data Table Grid (Fluent DetailsList Pattern) */}
      <div data-tour="pipeline-tree" className="rounded-md border border-[#edebe9] bg-[#ffffff] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        {!workspaceId ? (
          <div className="py-16 text-center text-xs text-[#605e5c] space-y-3 bg-[#ffffff]">
            <WorkspaceEmptyIllustration />
            <div className="space-y-1">
              <div className="text-sm font-semibold text-[#242424]">Select a workspace</div>
              <p className="text-[#605e5c] max-w-sm mx-auto text-xs leading-relaxed">
                Choose a workspace from the top selector to inspect live data pipelines, activity telemetry, and SLA alerts.
              </p>
            </div>
          </div>
        ) : pipelines.length === 0 && (isLoading || isSyncing) ? (
          /* Show table structure with subtle shimmer skeleton rows */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#faf9f8]/95 backdrop-blur-md text-[#605e5c] text-[11px] font-semibold uppercase tracking-wider border-b border-[#edebe9] sticky top-0 z-10 shadow-2xs">
                  <th className="py-2.5 px-3 w-[34%] font-semibold">Activity name</th>
                  <th className="py-2.5 px-3 w-[12%] font-semibold">Domain</th>
                  <th className="py-2.5 px-3 w-[16%] font-semibold">Status and SLA</th>
                  <th className="py-2.5 px-3 w-[14%] font-semibold">Start time</th>
                  <th className="py-2.5 px-3 w-[14%] font-semibold">End time</th>
                  <th className="py-2.5 px-3 w-[6%] font-semibold">Duration</th>
                  <th className="py-2.5 px-3 w-[4%] text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edebe9]">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <tr key={i} className="animate-pulse bg-[#ffffff]">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-4 h-4 bg-[#f3f2f1] rounded" />
                        <div className="h-3.5 bg-[#f3f2f1] rounded w-52" />
                      </div>
                    </td>
                    <td className="py-3 px-3"><div className="h-3 bg-[#f3f2f1] rounded w-16" /></td>
                    <td className="py-3 px-3"><div className="h-5 bg-[#f3f2f1] rounded-full w-24" /></td>
                    <td className="py-3 px-3"><div className="h-3 bg-[#f3f2f1] rounded w-28" /></td>
                    <td className="py-3 px-3"><div className="h-3 bg-[#f3f2f1] rounded w-28" /></td>
                    <td className="py-3 px-3"><div className="h-3 bg-[#f3f2f1] rounded w-12" /></td>
                    <td className="py-3 px-3 text-right"><div className="h-4 bg-[#f3f2f1] rounded w-6 ml-auto" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : pipelines.length === 0 ? (
          <div className="py-16 text-center text-xs text-[#605e5c] bg-[#ffffff] space-y-3">
            <PipelinesEmptyIllustration />
            <div className="space-y-1">
              <div className="text-sm font-semibold text-[#242424]">No pipelines found in this workspace</div>
              <p className="text-[#605e5c] max-w-sm mx-auto text-xs leading-relaxed">
                This Microsoft Fabric workspace currently does not have any configured data pipelines.
              </p>
            </div>
          </div>
        ) : filteredPipelines.length === 0 ? (
          <div className="py-14 text-center text-xs text-[#605e5c] bg-[#ffffff] space-y-3">
            <FilterEmptyIllustration />
            <div className="space-y-1">
              <div className="text-sm font-semibold text-[#242424]">No activities match your filters</div>
              <p className="text-[#605e5c] text-xs max-w-xs mx-auto leading-relaxed">
                Try clearing your search query or resetting the status and date filters.
              </p>
            </div>
            <button
              onClick={() => {
                setStatusFilter('ALL');
                setSearch('');
                if (onDateFilterChange) onDateFilterChange({ preset: 'latest', startDate: null, endDate: null });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#ffffff] hover:bg-[#f3f2f1] text-[#0f6cbd] border border-[#d1d1d1] text-xs font-semibold transition shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset filters</span>
            </button>
          </div>
        ) : (
          <div ref={tableContainerRef} className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#faf9f8]/95 backdrop-blur-md text-[#605e5c] text-[11px] font-semibold uppercase tracking-wider border-b border-[#edebe9] sticky top-0 z-10 shadow-2xs">
                  {/* Activity Name Column */}
                  <th
                    onClick={() => handleSort('activityName')}
                    className="py-2.5 px-3 w-[34%] font-semibold hover:bg-[#edebe9]/70 cursor-pointer transition select-none"
                    title="Sort by activity name"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Activity name</span>
                      {sortField === 'activityName' ? (
                        <ArrowDown className={`w-3 h-3 text-[#0f6cbd] transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-[#a19f9d]" />
                      )}
                    </div>
                  </th>

                  {/* Domain Column */}
                  <th className="py-2.5 px-3 w-[12%] font-semibold">
                    Domain
                  </th>

                  {/* Status & SLA Column */}
                  <th
                    data-tour="pipeline-sla"
                    onClick={() => handleSort('status')}
                    className="py-2.5 px-3 w-[16%] font-semibold hover:bg-[#edebe9]/70 cursor-pointer transition select-none"
                    title="Sort by execution status"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Status and SLA</span>
                      {sortField === 'status' ? (
                        <ArrowDown className={`w-3 h-3 text-[#0f6cbd] transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-[#a19f9d]" />
                      )}
                    </div>
                  </th>

                  {/* Start Time Column */}
                  <th
                    onClick={() => handleSort('startTime')}
                    className="py-2.5 px-3 w-[14%] font-semibold hover:bg-[#edebe9]/70 cursor-pointer transition select-none"
                    title="Sort by start time"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Start time</span>
                      {sortField === 'startTime' ? (
                        <ArrowDown className={`w-3 h-3 text-[#0f6cbd] transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-[#a19f9d]" />
                      )}
                    </div>
                  </th>

                  {/* End Time Column */}
                  <th className="py-2.5 px-3 w-[14%] font-semibold">
                    End time
                  </th>

                  {/* Duration Column */}
                  <th
                    onClick={() => handleSort('duration')}
                    className="py-2.5 px-3 w-[6%] font-semibold hover:bg-[#edebe9]/70 cursor-pointer transition select-none"
                    title="Sort by execution duration"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Duration</span>
                      {sortField === 'duration' ? (
                        <ArrowDown className={`w-3 h-3 text-[#0f6cbd] transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-[#a19f9d]" />
                      )}
                    </div>
                  </th>

                  {/* Actions Column */}
                  <th className="py-2.5 px-3 w-[4%] text-right font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edebe9]">
                {sortedPipelines.map((pipe) => {
                  const isThisExpanded = expandedPipelineId === pipe.id;
                  const isOtherBlurred = expandedPipelineId !== null && !isThisExpanded;

                  return (
                    <PipelineRow
                      key={pipe.id}
                      pipeline={pipe}
                      depth={0}
                      isExpanded={isThisExpanded}
                      onToggleExpand={() => setExpandedPipelineId(isThisExpanded ? null : pipe.id)}
                      isOtherBlurred={isOtherBlurred}
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
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
