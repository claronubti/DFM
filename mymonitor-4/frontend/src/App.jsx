import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FabricSuiteBar, FabricNavRail, FabricDetailSidePane } from './components/layout';
import {
  WorkspaceSelector,
  ErrorDetailModal,
  SchedulesDrawer,
  RunHistoryModal,
  PipelineScheduleModal,
  SlaConfigModal
} from './components/shared';
import { PipelineTreeTable } from './features/monitoring';
import { TableLogsPage, TableLogConfigPage } from './features/table-logs';
import { AdminConsole } from './features/admin';
import { useAuth } from './features/auth';
import { useWorkspaceMonitoring } from './hooks/useWorkspaceMonitoring';
import { TourProvider, TourContainer } from './features/tour';

export default function App() {
  const { profile, role, isAdmin, logout, assignedPipelineIds } = useAuth();
  const currentUserRole = useMemo(() => {
    if (isAdmin || (role || '').toLowerCase() === 'admin' || profile?.is_admin) return 'Admin';
    if ((role || '').toLowerCase() === 'l2') return 'L2';
    return 'L1';
  }, [isAdmin, role, profile]);
  const [allWorkspaces, setAllWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [currentView, setCurrentView] = useState('monitoring'); // 'monitoring' | 'table-logs' | 'table-log-config' | 'admin'
  const [selectedErrorActivity, setSelectedErrorActivity] = useState(null);
  const [selectedSidePaneItem, setSelectedSidePaneItem] = useState(null);
  const [isSchedulesOpen, setIsSchedulesOpen] = useState(false);
  const [selectedHistoryPipeline, setSelectedHistoryPipeline] = useState(null);
  const [selectedSchedulePipeline, setSelectedSchedulePipeline] = useState(null);
  const [selectedSlaPipeline, setSelectedSlaPipeline] = useState(null);
  const [selectedTableLogPipeline, setSelectedTableLogPipeline] = useState(null);
  const [dateFilter, setDateFilter] = useState({
    preset: 'latest',
    startDate: null,
    endDate: null
  });

  const {
    pipelineTree,
    metrics,
    dateFilterInfo,
    isConnected,
    lastUpdated,
    viewersCount,
    isLoading,
    isSyncing,
    syncProgress,
    isInitialLoad,
    refresh,
    resolveIncident
  } = useWorkspaceMonitoring(workspaceId, dateFilter);

  // Keep open side pane telemetry item synchronized with real-time pipelineTree
  const activeSidePaneItem = useMemo(() => {
    if (!selectedSidePaneItem) return null;
    const current = pipelineTree.find(
      (p) => p.id === selectedSidePaneItem.id || (p.pipelineId && p.pipelineId === selectedSidePaneItem.pipelineId)
    );
    return current ? { ...selectedSidePaneItem, ...current } : selectedSidePaneItem;
  }, [selectedSidePaneItem, pipelineTree]);

  // 1. Fetch all available workspaces from backend
  useEffect(() => {
    async function initWorkspace() {
      try {
        const res = await fetch('/api/workspaces');
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list)) {
            setAllWorkspaces(list);
          }
        }
      } catch (err) {
        console.warn('Could not auto-initialize workspace in App:', err);
      }
    }
    initWorkspace();
  }, []);

  // 2. Compute scoped workspaces based on user role and assignments:
  //    - Admins see ALL workspaces in the tenant.
  //    - L1 and L2 support users ONLY see workspaces they are assigned to.
  const scopedWorkspaces = useMemo(() => {
    if (isAdmin || !profile || role === 'admin') return allWorkspaces;
    const assignedIds = profile.assigned_workspace_ids || [];
    if (!assignedIds || assignedIds.length === 0) return [];
    return allWorkspaces.filter((w) => assignedIds.includes(w.id));
  }, [allWorkspaces, isAdmin, profile, role]);

  // 3. Only validate workspace scope if a workspace is already selected
  useEffect(() => {
    if (workspaceId && scopedWorkspaces.length > 0 && !isAdmin) {
      // If a non-admin user is on a workspace not assigned to them, reset selection
      const exists = scopedWorkspaces.some((w) => w.id === workspaceId);
      if (!exists) {
        setWorkspaceId('');
        localStorage.removeItem('fabric_selected_workspace_id');
      }
    }
  }, [workspaceId, scopedWorkspaces, isAdmin]);

  useEffect(() => {
    if (workspaceId) {
      localStorage.setItem('fabric_selected_workspace_id', workspaceId);
    }
  }, [workspaceId]);

  const hasInitialLandedRef = useRef(false);

  // Admins land on the setup console on initial load, but can freely navigate to Monitoring hub.
  useEffect(() => {
    if (isAdmin && !hasInitialLandedRef.current) {
      hasInitialLandedRef.current = true;
      setCurrentView('admin');
    } else if (!isAdmin && (currentView === 'admin' || currentView === 'table-log-config')) {
      setCurrentView('monitoring');
    }
  }, [isAdmin, currentView]);

  // 4. Compute scoped pipeline tree and metrics for non-admin users:
  //    - Admins see all parent pipelines.
  //    - L1/L2 users ONLY see pipelines where they are assigned.
  const scopedPipelineTree = useMemo(() => {
    if (isAdmin || !role || role === 'none' || role === 'admin') {
      return pipelineTree;
    }
    const userEmail = (profile?.email || '').toLowerCase().trim();
    const pipeIds = assignedPipelineIds || [];

    return pipelineTree.filter((p) => {
      // 1. Check if pipeline ID is in profile's assigned_pipeline_ids
      if (pipeIds.length > 0 && pipeIds.includes(p.pipelineId)) {
        return true;
      }
      // 2. Check per-pipeline slaConfig email match
      if (userEmail && p.slaConfig) {
        const l1 = (p.slaConfig.l1Email || '').toLowerCase().trim();
        const l2 = (p.slaConfig.l2Email || '').toLowerCase().trim();
        if (role === 'l1') return l1 === userEmail;
        if (role === 'l2') return l2 === userEmail;
        return l1 === userEmail || l2 === userEmail;
      }
      return false;
    });
  }, [pipelineTree, isAdmin, role, profile, assignedPipelineIds]);

  const scopedMetrics = useMemo(() => {
    if (isAdmin || !role || role === 'none' || role === 'admin') {
      return metrics;
    }
    const running = scopedPipelineTree.filter((p) => ['inprogress', 'running'].includes((p.status || '').toLowerCase())).length;
    const succeeded = scopedPipelineTree.filter((p) => ['completed', 'succeeded', 'success'].includes((p.status || '').toLowerCase())).length;
    const failed = scopedPipelineTree.filter((p) => (p.status || '').toLowerCase() === 'failed').length;
    const cancelled = scopedPipelineTree.filter((p) => ['cancelled', 'canceled'].includes((p.status || '').toLowerCase())).length;
    const notRun = scopedPipelineTree.filter((p) => ['no runs', 'noruns', 'notstarted', 'never executed', 'not run'].includes((p.status || '').toLowerCase())).length;
    const slaBreached = scopedPipelineTree.filter((p) => {
      const s = (p.incident?.status || '').toUpperCase();
      return ['ACTIVE', 'ESCALATED_L2', 'CRITICAL_UNRESOLVED'].includes(s);
    }).length;
    return {
      total: scopedPipelineTree.length,
      running,
      succeeded,
      failed,
      slaBreached,
      cancelled,
      notRun,
      scheduled: 0,
      notScheduled: 0,
    };
  }, [scopedPipelineTree, metrics, isAdmin, role]);

  // When an error is clicked, open the Fabric Detail Side Pane
  const handleSelectError = (errorItem) => {
    setSelectedSidePaneItem(errorItem);
  };

  const handleOpenTableLogs = (pipeline = null) => {
    if (pipeline) {
      setSelectedTableLogPipeline(pipeline);
    } else if (!selectedTableLogPipeline && scopedPipelineTree && scopedPipelineTree.length > 0) {
      setSelectedTableLogPipeline(scopedPipelineTree[0]);
    }
    setSelectedSidePaneItem(null);
    setSelectedHistoryPipeline(null);
    setSelectedSchedulePipeline(null);
    setSelectedSlaPipeline(null);
    setSelectedErrorActivity(null);
    setIsSchedulesOpen(false);
    setCurrentView('table-logs');
  };

  const handleOpenTableLogConfig = () => {
    if (!isAdmin) return;
    // Close any open modals
    setSelectedSidePaneItem(null);
    setSelectedHistoryPipeline(null);
    setSelectedSchedulePipeline(null);
    setSelectedSlaPipeline(null);
    setSelectedErrorActivity(null);
    setIsSchedulesOpen(false);
    setCurrentView('table-log-config');
  };

  const currentWorkspaceName = scopedPipelineTree[0]?.workspaceName ||
    scopedWorkspaces.find(w => w.id === workspaceId)?.displayName ||
    scopedWorkspaces.find(w => w.id === workspaceId)?.name ||
    'Current Workspace';


  return (
    <TourProvider currentView={currentView} setCurrentView={setCurrentView}>
      <div className="h-screen w-screen flex flex-col bg-[#faf9f8] text-[#242424] font-['Segoe_UI'] select-none overflow-hidden relative">
        <TourContainer />
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* 1. Microsoft Fabric Global Suite Bar (Top Bar - White Theme) */}
          <FabricSuiteBar
            currentView={currentView}
            onSelectView={setCurrentView}
            pipelines={scopedPipelineTree}
            onSelectPipeline={(p) => setSelectedHistoryPipeline(p)}
            currentWorkspaceId={workspaceId}
            onSelectWorkspace={setWorkspaceId}
            isConnected={isConnected}
            viewersCount={viewersCount}
            lastUpdated={lastUpdated}
            onRefresh={refresh}
            isLoading={isLoading}
            onOpenTableLogConfig={isAdmin ? handleOpenTableLogConfig : null}
            user={profile}
            role={role}
            isAdmin={isAdmin}
            onOpenAdmin={() => isAdmin && setCurrentView('admin')}
            onSignOut={logout}
          />

        {/* Dynamic View: Table Logging Wizard (full page - Admin only) vs Fabric Shell */}
        {currentView === 'table-log-config' && isAdmin ? (
          <TableLogConfigPage
            workspaceId={workspaceId}
            workspaceName={currentWorkspaceName}
            onBackToMonitoring={() => setCurrentView('monitoring')}
            onSaved={() => {
              refresh();
            }}
          />
        ) : (
          /* 2. Fabric Shell: Nav Rail + Main Work Area */
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Fabric Left Nav Rail with L1, L2 & Admin Navigation */}
            <FabricNavRail
              currentView={currentView}
              onNavigateMonitoring={() => setCurrentView('monitoring')}
              isAdmin={isAdmin}
              onNavigateAdmin={() => setCurrentView('admin')}
              workspaceName={currentWorkspaceName}
              userRole={isAdmin ? 'Admin' : (role ? role.toUpperCase() : 'L1')}
            />

            {currentView === 'admin' && isAdmin ? (
              <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden">
                <AdminConsole
                  onOpenTableConfig={(wsId) => {
                    setWorkspaceId(wsId);
                    setCurrentView('table-log-config');
                  }}
                />
              </div>
            ) : currentView === 'table-logs' ? (
              <TableLogsPage
                workspaceId={workspaceId}
                workspaceName={currentWorkspaceName}
                pipeline={selectedTableLogPipeline || scopedPipelineTree[0]}
                pipelines={scopedPipelineTree}
                onSelectPipeline={(p) => setSelectedTableLogPipeline(p)}
                onOpenConfig={isAdmin ? handleOpenTableLogConfig : null}
                onBackToMonitoring={() => setCurrentView('monitoring')}
              />
            ) : (
              <main className="flex-1 overflow-y-auto bg-[#faf9f8] p-4 space-y-3 max-w-[1700px] w-full mx-auto min-h-0 font-sans">
                {/* Fabric Header Title & Workspace Selector */}
                <div className="space-y-0.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-0.5 pb-1">
                    <div>
                      {/* Microsoft Fabric Breadcrumb */}
                      <div className="flex items-center gap-1.5 text-xs text-[#605e5c] mb-1">
                        <span>Workspaces</span>
                        <span className="text-[#a19f9d]">/</span>
                        <span className="font-medium text-[#242424] truncate max-w-[220px]">
                          {currentWorkspaceName}
                        </span>
                        <span className="text-[#a19f9d]">/</span>
                        <span className="text-[#0f6cbd] font-semibold">Monitoring hub</span>
                      </div>

                      <h1 className="text-xl font-bold tracking-tight text-[#242424]">
                        Monitoring hub
                      </h1>
                      <p className="text-xs text-[#605e5c] mt-0.5">
                        Track pipeline execution runs, activity telemetry, SLA alerts, and lakehouse data ingestion.
                      </p>
                    </div>

                    {/* Beside Monitoring Hub right end: Workspace Selector & Live Telemetry timestamp */}
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2" data-tour="workspace-selector">
                        <span className="text-xs font-semibold text-[#605e5c]">Workspace:</span>
                        <WorkspaceSelector
                          currentWorkspaceId={workspaceId}
                          onSelectWorkspace={setWorkspaceId}
                          workspaces={scopedWorkspaces}
                          isLoadingPipelines={isLoading}
                          align="right"
                        />
                      </div>

                      {lastUpdated && (
                        <div className="text-[11px] text-[#797775] font-mono pl-3 border-l border-[#edebe9]">
                          Telemetry synced: {new Date(lastUpdated).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Unified Pipeline Tree Table with Command Bar & Metric Cards */}
                <PipelineTreeTable
                  workspaceId={workspaceId}
                  pipelines={scopedPipelineTree}
                  metrics={scopedMetrics}
                  dateFilter={dateFilter}
                  dateFilterInfo={dateFilterInfo}
                  onDateFilterChange={setDateFilter}
                  onSelectError={handleSelectError}
                  isLoading={isLoading}
                  isSyncing={isSyncing}
                  syncProgress={syncProgress}
                  isInitialLoad={isInitialLoad}
                  onRefresh={refresh}
                  lastUpdated={lastUpdated}
                  onOpenRunHistory={(pipeline) => setSelectedHistoryPipeline(pipeline)}
                  onOpenSchedule={(pipeline) => setSelectedSchedulePipeline(pipeline)}
                  onOpenSchedules={() => setIsSchedulesOpen(true)}
                  onOpenSlaConfig={isAdmin ? (pipeline) => setSelectedSlaPipeline(pipeline) : null}
                  onResolveIncident={resolveIncident}
                  onOpenTableLogs={(pipeline) => handleOpenTableLogs(pipeline)}
                  onOpenTableLogConfig={isAdmin ? handleOpenTableLogConfig : null}
                  onOpenSidePane={(item) => setSelectedSidePaneItem(item)}
                  userRole={currentUserRole}
                />
              </main>
            )}
          </div>
        )}
      </div>

      {/* 3. Microsoft Fabric Right Detail Side Pane */}
      <FabricDetailSidePane
        item={activeSidePaneItem}
        isOpen={!!selectedSidePaneItem}
        onClose={() => setSelectedSidePaneItem(null)}
        onOpenRunHistory={(pipe) => setSelectedHistoryPipeline(pipe)}
        onOpenSchedule={(pipe) => setSelectedSchedulePipeline(pipe)}
        onOpenSlaConfig={isAdmin ? (pipe) => setSelectedSlaPipeline(pipe) : null}
        onOpenTableLogs={(pipe) => handleOpenTableLogs(pipe)}
        onResolveIncident={resolveIncident}
        userRole={currentUserRole}
      />

      {/* 4. Modal Dialogs */}
      {/* Pipeline Run History Modal */}
      {selectedHistoryPipeline && (
        <RunHistoryModal
          workspaceId={workspaceId}
          pipeline={selectedHistoryPipeline}
          isOpen={!!selectedHistoryPipeline}
          onClose={() => setSelectedHistoryPipeline(null)}
          onSelectError={(errorItem) => setSelectedErrorActivity(errorItem)}
          onOpenTableLogs={(pipeline) => handleOpenTableLogs(pipeline)}
        />
      )}

      {/* Error Diagnostics Modal fallback */}
      {selectedErrorActivity && (
        <ErrorDetailModal
          activity={selectedErrorActivity}
          onClose={() => setSelectedErrorActivity(null)}
        />
      )}

      {/* Single Pipeline Schedule Modal */}
      {selectedSchedulePipeline && (
        <PipelineScheduleModal
          workspaceId={workspaceId}
          pipeline={selectedSchedulePipeline}
          isOpen={!!selectedSchedulePipeline}
          onClose={() => setSelectedSchedulePipeline(null)}
        />
      )}

      {/* SLA Configuration Modal */}
      {selectedSlaPipeline && (
        <SlaConfigModal
          workspaceId={workspaceId}
          pipeline={selectedSlaPipeline}
          isOpen={!!selectedSlaPipeline}
          onClose={() => setSelectedSlaPipeline(null)}
          onSaved={() => refresh()}
        />
      )}

      {/* Workspace All Schedules Drawer */}
      <SchedulesDrawer
        workspaceId={workspaceId}
        isOpen={isSchedulesOpen}
        onClose={() => setIsSchedulesOpen(false)}
      />
    </div>
    </TourProvider>
  );
}
