/**
 * useWorkspaceMonitoring Hook
 * 
 * Manages live WebSocket and REST snapshot state for Fabric pipeline monitoring,
 * including health metrics, incident tracking, real-time status transitions,
 * and date-filtered historical snapshots.
 */

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { getWorkspaceSnapshot, resolveIncident as resolveIncidentApi } from '../api';

const EMPTY_METRICS = {
  total: 0,
  running: 0,
  succeeded: 0,
  failed: 0,
  slaBreached: 0,
  cancelled: 0,
  notRun: 0,
  scheduled: 0,
  notScheduled: 0,
};

/**
 * Custom hook to monitor a Fabric workspace's pipelines in real-time.
 * 
 * @param {string} workspaceId - Microsoft Fabric Workspace GUID.
 * @param {{ preset?: string, startDate?: string, endDate?: string }} [dateFilter] - Active date filter range.
 * @returns {Object} Real-time pipeline tree, aggregate metrics, connection status, and mutation handlers.
 */
export function useWorkspaceMonitoring(
  workspaceId, 
  dateFilter = { preset: 'latest', startDate: null, endDate: null }
) {
  const [pipelineTree, setPipelineTree] = useState([]);
  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [dateFilterInfo, setDateFilterInfo] = useState({
    preset: 'latest',
    startDate: null,
    endDate: null,
    isFuture: false,
    availableRunDates: []
  });
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [viewersCount, setViewersCount] = useState(0);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceId));
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [prevWorkspaceId, setPrevWorkspaceId] = useState(workspaceId);
  const [isInitialLoad, setIsInitialLoad] = useState(false);
  const isInitialLoadRef = useRef(false);

  if (workspaceId && workspaceId !== prevWorkspaceId) {
    setPrevWorkspaceId(workspaceId);
    setIsInitialLoad(false);
    isInitialLoadRef.current = false;
    setIsLoading(true);
    setIsSyncing(false);
    setSyncProgress(null);
    setPipelineTree([]);
    setMetrics(EMPTY_METRICS);
  }

  const activeWorkspaceIdRef = useRef(workspaceId);
  const dateFilterRef = useRef(dateFilter);
  const prevFilterKeyRef = useRef(`${dateFilter.preset}_${dateFilter.startDate}_${dateFilter.endDate}`);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  const loadingTimeoutRef = useRef(null);

  useEffect(() => {
    activeWorkspaceIdRef.current = workspaceId;
    dateFilterRef.current = dateFilter;
  }, [workspaceId, dateFilter]);

  /**
   * Fetches a REST snapshot of pipelines and metrics for the workspace with current date filters.
   *
   * @param {string} targetWorkspaceId
   * @param {Object} filter
   */
  const fetchSnapshot = useCallback((targetWorkspaceId, filter) => {
    if (!targetWorkspaceId) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    const preset = filter?.preset || 'latest';
    const sDt = filter?.startDate || '';
    const eDt = filter?.endDate || '';

    getWorkspaceSnapshot(targetWorkspaceId, {
      forceSync: false,
      datePreset: preset,
      startDate: sDt,
      endDate: eDt,
      signal: abortController.signal
    })
      .then((json) => {
        if (activeWorkspaceIdRef.current === targetWorkspaceId) {
          const incoming = json.pipelines || [];
          if (json.metrics) setMetrics(json.metrics);
          if (json.dateFilter) setDateFilterInfo(json.dateFilter);
          setLastUpdated(new Date().toISOString());

          if (incoming.length > 0) {
            setPipelineTree(incoming);
            setIsLoading(false);
            if (loadingTimeoutRef.current) {
              clearTimeout(loadingTimeoutRef.current);
              loadingTimeoutRef.current = null;
            }
            setIsInitialLoad(false);
            isInitialLoadRef.current = false;
            setIsSyncing(false);
            setSyncProgress(null);
          } else if (json.isSyncing) {
            // Background sync is underway and DB is empty; show progress bar
            setIsLoading(true);
            setIsInitialLoad(true);
            isInitialLoadRef.current = true;
            setIsSyncing(true);
            setSyncProgress((prev) => prev || {
              stage: 'connecting',
              message: 'Connecting to Microsoft Fabric and discovering pipelines...',
              percent: 15
            });
          } else {
            // Empty DB and not syncing yet: if socket connecting wait, else finalize empty
            if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
              setIsLoading(true);
            } else {
              setPipelineTree([]);
              if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
                loadingTimeoutRef.current = null;
              }
              setIsLoading(false);
              setIsInitialLoad(false);
              isInitialLoadRef.current = false;
              setIsSyncing(false);
              setSyncProgress(null);
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.warn("Snapshot fetch warning:", err);
          if (activeWorkspaceIdRef.current === targetWorkspaceId) {
            setIsLoading(false);
            setIsSyncing(false);
            setSyncProgress(null);
          }
        }
      });
  }, []);

  /**
   * Establishes a WebSocket connection for real-time live telemetry updates.
   *
   * @param {string} targetWorkspaceId
   */
  const connectToWorkspace = useCallback((targetWorkspaceId) => {
    if (!targetWorkspaceId) {
      setPipelineTree([]);
      setMetrics(EMPTY_METRICS);
      setIsConnected(false);
      setIsLoading(false);
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close(1000, "Switching workspace");
      } catch (e) {
        console.warn("Socket close error:", e);
      }
      wsRef.current = null;
    }

    setPipelineTree([]);
    setMetrics(EMPTY_METRICS);
    setIsConnected(false);
    setError(null);
    setIsLoading(true);
    setIsSyncing(false);
    setSyncProgress(null);

    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }
    // Generous fallback safety timeout (35s) so Celery background sync is never interrupted prematurely
    loadingTimeoutRef.current = setTimeout(() => {
      if (activeWorkspaceIdRef.current === targetWorkspaceId) {
        setIsLoading(false);
        setIsSyncing(false);
        setSyncProgress(null);
      }
    }, 35000);

    fetchSnapshot(targetWorkspaceId, dateFilterRef.current);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/workspaces/${targetWorkspaceId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (activeWorkspaceIdRef.current === targetWorkspaceId) {
        setIsConnected(true);
        setError(null);
      } else {
        ws.close();
      }
    };

    ws.onmessage = (event) => {
      if (activeWorkspaceIdRef.current !== targetWorkspaceId) return;

      try {
        const message = JSON.parse(event.data);
        if (message.type === 'SYNC_PROGRESS') {
          if (message.workspaceId === targetWorkspaceId) {
            if (message.stage === 'complete') {
              setIsSyncing(false);
              setSyncProgress(null);
              setIsInitialLoad(false);
              isInitialLoadRef.current = false;
            } else if (isInitialLoadRef.current) {
              // Only display sync progress banner during initial workspace load when no cached data exists in DB
              setIsSyncing(true);
              setSyncProgress((prev) => {
                const incomingPct = typeof message.percent === 'number' ? message.percent : (prev?.percent || 15);
                const currentPct = prev?.percent || 0;
                // Strictly monotonic: Never let percentage drop backwards!
                const safePct = Math.max(currentPct, incomingPct);
                return {
                  stage: message.stage || prev?.stage || 'syncing',
                  message: message.message || prev?.message || 'Synchronizing Fabric telemetry...',
                  percent: safePct
                };
              });
            }
          }
        } else if (message.type === 'SYNC_ERROR') {
          if (message.workspaceId === targetWorkspaceId) {
            setIsSyncing(false);
            setSyncProgress(null);
            setIsLoading(false);
            setIsInitialLoad(false);
            isInitialLoadRef.current = false;
          }
        } else if (message.type === 'FULL_SNAPSHOT') {
          if (message.workspaceId === targetWorkspaceId) {
            const incoming = message.data || [];
            // If data is present from DB, immediately clear progress bar
            if (incoming.length > 0) {
              if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
                loadingTimeoutRef.current = null;
              }
              setIsLoading(false);
              setIsInitialLoad(false);
              isInitialLoadRef.current = false;
              setIsSyncing(false);
              setSyncProgress(null);
            } else if (message.isSyncComplete === true) {
              if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
                loadingTimeoutRef.current = null;
              }
              setIsLoading(false);
              setIsInitialLoad(false);
              isInitialLoadRef.current = false;
              setIsSyncing(false);
              setSyncProgress(null);
            } else {
              setIsLoading(false);
            }
            if (!dateFilterRef.current?.preset || dateFilterRef.current?.preset === 'latest') {
              const incoming = message.data || [];

              setPipelineTree(incoming);
              const running = incoming.filter((p) => ['inprogress', 'running'].includes((p.status || '').toLowerCase())).length;
              const succeeded = incoming.filter((p) => ['completed', 'succeeded', 'success'].includes((p.status || '').toLowerCase())).length;
              const failed = incoming.filter((p) => (p.status || '').toLowerCase() === 'failed').length;
              const cancelled = incoming.filter((p) => ['cancelled', 'canceled'].includes((p.status || '').toLowerCase())).length;
              const notRun = incoming.filter((p) => ['no runs', 'noruns', 'notstarted', 'never executed', 'not run'].includes((p.status || '').toLowerCase())).length;
              const scheduled = incoming.filter((p) => p.schedule && p.schedule.enabled).length;
              const notScheduled = Math.max(0, incoming.length - scheduled);
              const slaBreached = incoming.filter(
                (p) => (p.status || '').toLowerCase() === 'failed' && p.incident && ['ACTIVE', 'ESCALATED_L2', 'CRITICAL_UNRESOLVED'].includes((p.incident.status || '').toUpperCase())
              ).length;
              setMetrics(message.metrics || {
                total: incoming.length,
                running,
                succeeded,
                failed,
                cancelled,
                notRun,
                slaBreached,
                scheduled,
                notScheduled,
              });
              setLastUpdated(message.timestamp || new Date().toISOString());
              setViewersCount(message.viewersCount || 1);
            }
          }

        } else if (message.type === 'INCIDENT_CREATED' || message.type === 'INCIDENT_UPDATED') {
          const inc = message.incident;
          if (inc) {
            const targetPipeId = inc.pipelineId || inc.pipeline_id;
            const targetRunId = inc.pipelineRunId || inc.pipeline_run_id;
            setPipelineTree((prev) =>
              prev.map((p) => {
                const isMatchingPipe = targetPipeId && (p.pipelineId === targetPipeId || p.id === targetPipeId);
                const isMatchingRun = targetRunId && (p.id === targetRunId || p.pipelineRunId === targetRunId);
                if (isMatchingPipe || isMatchingRun) {
                  return {
                    ...p,
                    id: targetRunId || p.id,
                    endTime: inc.failed_at || inc.failedAt || p.endTime,
                    incident: inc,
                    status: p.status?.toLowerCase() === 'inprogress' ? p.status : 'Failed',
                  };
                }
                return p;
              })
            );
          }
        } else if (message.type === 'SLA_BREACHED') {
          setPipelineTree((prev) =>
            prev.map((p) => {
              if (p.incident && (p.incident.id === message.incidentId || p.incident.id === `inc_${message.incidentId}`)) {
                return {
                  ...p,
                  incident: {
                    ...p.incident,
                    status: 'ESCALATED_L2',
                    l2EscalatedAt: message.l2EscalatedAt,
                    l2_escalated_at: message.l2EscalatedAt
                  }
                };
              }
              return p;
            })
          );
        } else if (message.type === 'SLA2_BREACHED') {
          setPipelineTree((prev) =>
            prev.map((p) => {
              if (p.incident && (p.incident.id === message.incidentId || p.incident.id === `inc_${message.incidentId}`)) {
                return {
                  ...p,
                  incident: {
                    ...p.incident,
                    status: 'CRITICAL_UNRESOLVED',
                  }
                };
              }
              return p;
            })
          );
        } else if (message.type === 'INCIDENT_RESOLVED') {
          setPipelineTree((prev) =>
            prev.map((p) => {
              const resTime = message.resolvedAt || message.resolved_at || new Date().toISOString();
              if (
                (message.incidentId && p.incident && (p.incident.id === message.incidentId || p.incident.id === `inc_${message.incidentId}`)) ||
                (message.pipelineId && (p.pipelineId === message.pipelineId || p.id === message.pipelineId))
              ) {
                return {
                  ...p,
                  incident: {
                    ...(p.incident || {}),
                    status: 'RESOLVED',
                    resolvedBy: message.resolvedBy || message.resolved_by || 'Operator',
                    resolvedAt: resTime,
                    resolved_at: resTime,
                  }
                };
              }
              return p;
            })
          );
        }
      } catch (err) {
        console.error("Error parsing WebSocket payload:", err);
      }
    };

    ws.onerror = (err) => {
      console.warn("WebSocket error for workspace", targetWorkspaceId, err);
      if (activeWorkspaceIdRef.current === targetWorkspaceId) {
        setIsConnected(false);
      }
    };

    ws.onclose = (event) => {
      if (activeWorkspaceIdRef.current === targetWorkspaceId) {
        setIsConnected(false);
        if (event.code !== 1000) {
          reconnectTimeoutRef.current = setTimeout(() => {
            if (activeWorkspaceIdRef.current === targetWorkspaceId) {
              connectToWorkspace(targetWorkspaceId);
            }
          }, 3000);
        }
      }
    };
  }, [fetchSnapshot]);

  // Connect on workspace change
  useEffect(() => {
    connectToWorkspace(workspaceId);

    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.close(1000, "Unmounting/Changing");
        } catch {}
      }
    };
  }, [workspaceId, connectToWorkspace]);

  // Re-fetch snapshot only when dateFilter actually changes
  useEffect(() => {
    const key = `${dateFilter.preset}_${dateFilter.startDate}_${dateFilter.endDate}`;
    if (key !== prevFilterKeyRef.current) {
      prevFilterKeyRef.current = key;
      if (workspaceId) {
        fetchSnapshot(workspaceId, dateFilter);
      }
    }
  }, [workspaceId, dateFilter.preset, dateFilter.startDate, dateFilter.endDate, fetchSnapshot]);

  /**
   * Resolves an open alert incident for a pipeline run.
   *
   * @param {string} incidentId - Unique incident GUID.
   * @param {string} [resolvedBy='Admin'] - The role/user resolving the incident ('L1', 'L2', 'Admin').
   */
  const resolveIncident = async (incidentId, resolvedBy = 'Admin') => {
    if (!workspaceId || !incidentId) return;
    try {
      await resolveIncidentApi(workspaceId, incidentId, { resolvedBy });
      setPipelineTree((prev) =>
        prev.map((p) => {
          if (
            (p.incident && p.incident.id === incidentId) ||
            p.id === incidentId ||
            p.pipelineId === incidentId ||
            incidentId === `inc_${p.id}`
          ) {
            return {
              ...p,
              incident: {
                ...(p.incident || {}),
                id: p.incident?.id || incidentId,
                status: 'RESOLVED',
                resolvedBy: resolvedBy,
                resolved_by: resolvedBy,
                resolvedAt: new Date().toISOString(),
                resolved_at: new Date().toISOString()
              }
            };
          }
          return p;
        })
      );
    } catch (e) {
      console.error('Resolve incident error:', e);
    }
  };

  /** Forces an immediate live refresh of the workspace telemetry data. */
  const refresh = () => {
    if (workspaceId) {
      setIsLoading(true);
      const preset = dateFilterRef.current?.preset || 'latest';
      const sDt = dateFilterRef.current?.startDate || '';
      const eDt = dateFilterRef.current?.endDate || '';
      getWorkspaceSnapshot(workspaceId, {
        forceSync: true,
        datePreset: preset,
        startDate: sDt,
        endDate: eDt
      })
        .then((json) => {
          if (activeWorkspaceIdRef.current === workspaceId) {
            setPipelineTree(json.pipelines || []);
            if (json.metrics) setMetrics(json.metrics);
            if (json.dateFilter) setDateFilterInfo(json.dateFilter);
            setLastUpdated(new Date().toISOString());
            setIsLoading(false);
          }
        })
        .catch(() => setIsLoading(false));
    }
  };

  // Derive the SLA Breached count directly from the pipeline tree so it always
  // equals the number of DISTINCT pipelines that currently have an unresolved
  // incident. A pipeline is counted once whether its incident is ACTIVE,
  // escalated to L2 (SLA1 breached) or CRITICAL_UNRESOLVED (SLA2 breached);
  // escalating between levels never increases the count, and resolving an
  // incident removes it from the count.
  const slaBreachedCount = useMemo(() => {
    const UNRESOLVED = ['ACTIVE', 'ESCALATED_L2', 'CRITICAL_UNRESOLVED'];
    const seen = new Set();
    for (const p of pipelineTree) {
      const isFailed = (p.status || '').toLowerCase() === 'failed';
      const status = (p.incident?.status || '').toUpperCase();
      if (isFailed && p.incident && UNRESOLVED.includes(status)) {
        seen.add(p.pipelineId || p.id);
      }
    }
    return seen.size;
  }, [pipelineTree]);

  const effectiveMetrics = useMemo(
    () => ({ ...metrics, slaBreached: slaBreachedCount }),
    [metrics, slaBreachedCount]
  );

  return {
    pipelineTree,
    metrics: effectiveMetrics,
    dateFilterInfo,
    isConnected,
    lastUpdated,
    viewersCount,
    isLoading,
    isSyncing,
    syncProgress,
    isInitialLoad,
    error,
    refresh,
    resolveIncident
  };
}

export default useWorkspaceMonitoring;
