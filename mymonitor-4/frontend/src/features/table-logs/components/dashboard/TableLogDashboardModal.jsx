import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  RefreshCw,
  Database,
  Settings,
  Copy,
  Check,
  Info
} from 'lucide-react';
import { getTableLogAiFix } from '../../api';
import { apiFetch } from '../../../../services/api/apiClient';

import TableLogsMetricCards from './TableLogsMetricCards';
import TableLogsFilterBar from './TableLogsFilterBar';
import TableLogsDataTable from './TableLogsDataTable';
import TableLogAiDebugModal from './TableLogAiDebugModal';
import { formatTableLogDuration } from '../../utils/logFormatters';

/**
 * TableLogDashboardModal provides a floating modal dialog overlay showing the
 * table-level logging dashboard for a specific pipeline execution.
 *
 * @param {Object} props
 * @param {string} props.workspaceId - Fabric workspace GUID.
 * @param {Object} props.pipeline - Pipeline execution payload.
 * @param {boolean} props.isOpen - Whether modal is visible.
 * @param {Function} props.onClose - Modal close handler.
 * @param {Function} [props.onOpenConfig] - Trigger to open column mapping configuration.
 */
export default function TableLogDashboardModal({
  workspaceId,
  pipeline,
  isOpen,
  onClose,
  onOpenConfig
}) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [copied, setCopied] = useState(false);

  // Filters
  const [layerFilter, setLayerFilter] = useState('All'); // 'All' | 'Bronze' | 'Silver'
  const [statusFilter, setStatusFilter] = useState('All'); // 'All' | 'Success' | 'Failed'
  const [searchTerm, setSearchTerm] = useState('');

  // Debug modal for row inspection
  const [debugRow, setDebugRow] = useState(null);
  const [tableAiData, setTableAiData] = useState(null);
  const [isLoadingTableAi, setIsLoadingTableAi] = useState(false);
  const [tableAiError, setTableAiError] = useState(null);

  const rawRunId = pipeline?.id || pipeline?.pipelineRunId || pipeline?.runId || '';
  const pipelineRunId = rawRunId && !rawRunId.startsWith('norun-') ? rawRunId : '';

  const handleOpenDebugRow = (row) => {
    setDebugRow(row);
    setTableAiData(null);
    setTableAiError(null);
  };

  const fetchTableAiDiagnosis = async (row) => {
    if (!row) return;
    setIsLoadingTableAi(true);
    setTableAiError(null);
    try {
      const json = await getTableLogAiFix(workspaceId, {
        pipelineName: data?.batchHeader?.pipelineName || pipeline?.pipelineName || pipeline?.displayName || pipeline?.name || 'Pipeline',
        activityName: `${row.layer}_${row.tableName}`,
        activityType: `${row.layer} Layer Ingestion (${row.operation || 'Data Load'})`,
        errorCode: 'TableLoadFailure',
        errorMessage: row.errorMessage || 'Table extraction or loading failed.',
        failureType: 'DataLoadError',
        target: `${row.schema}.${row.tableName}`,
        rawError: row.rawData
      });
      setTableAiData(json);
    } catch (err) {
      console.error("Table AI diagnostics error:", err);
      setTableAiError(err.message || "Network error while connecting to AI diagnostic service.");
    } finally {
      setIsLoadingTableAi(false);
    }
  };

  const fetchData = async (overrideBatchId = null) => {
    if (!workspaceId) return;
    setIsLoading(true);
    setError(null);

    let url = `/api/workspaces/${workspaceId}/table-logs?`;
    const targetBatch = overrideBatchId !== null ? overrideBatchId : selectedBatchId;
    if (targetBatch) {
      url += `batch_id=${encodeURIComponent(targetBatch)}`;
    } else if (pipelineRunId) {
      url += `pipeline_run_id=${encodeURIComponent(pipelineRunId)}`;
    }

    try {
      const json = await apiFetch(url);
      setData(json);
      if (json?.batchHeader?.batchId && !selectedBatchId) {
        setSelectedBatchId(json.batchHeader.batchId);
      }
    } catch (err) {
      console.error("Error loading table logs:", err);
      setError(err.message || "Network error while connecting to table logging service.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSelectedBatchId('');
      setData(null);
      fetchData('');
    }
  }, [isOpen, workspaceId, pipelineRunId]);

  const handleBatchSelect = (bId) => {
    setSelectedBatchId(bId);
    fetchData(bId);
  };

  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const allTableRows = useMemo(() => {
    return data?.tableDetails || data?.tables || [];
  }, [data]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!allTableRows || allTableRows.length === 0) return [];
    return allTableRows.filter(row => {
      const matchLayer = layerFilter === 'All' || row.layer?.toLowerCase() === layerFilter.toLowerCase();
      const matchStatus = statusFilter === 'All' ||
        (statusFilter === 'Success' && row.status?.toLowerCase() === 'success') ||
        (statusFilter === 'Failed' && row.status?.toLowerCase() !== 'success');
      const matchSearch = !searchTerm ||
        row.tableName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.schema?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.operation?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchLayer && matchStatus && matchSearch;
    });
  }, [allTableRows, layerFilter, statusFilter, searchTerm]);

  const clearFilters = () => {
    setLayerFilter('All');
    setStatusFilter('All');
    setSearchTerm('');
  };

  if (!isOpen) return null;

  const currentBatchHeader = data?.batchHeader;
  const silverData = data?.silverOverview || data?.layerOverviews?.silver;
  const bronzeData = data?.bronzeOverview || data?.layerOverviews?.bronze;
  const hasActiveFilters = searchTerm !== '' || layerFilter !== 'All' || statusFilter !== 'All';
  const runId = pipelineRunId || currentBatchHeader?.pipelineRunId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150 select-none">
      <div className="relative w-full max-w-6xl bg-[#ffffff] border border-[#edebe9] rounded-lg shadow-[0_16px_32px_rgba(0,0,0,0.16),0_4px_8px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col max-h-[94vh]">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3.5 border-b border-[#edebe9] bg-[#faf9f8] gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded bg-[#eff6fc] text-[#0f6cbd] border border-[#d1d1d1] shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-[#242424] truncate">
                  {pipeline?.pipelineName || currentBatchHeader?.pipelineName || "Table Level Logging"}
                </h2>
                {currentBatchHeader?.status && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${currentBatchHeader.status.toLowerCase().includes('success')
                      ? 'bg-[#dff6dd] text-[#107c41] border-[#92c353]'
                      : 'bg-[#fde7e9] text-[#a80000] border-[#f19999]'
                    }`}>
                    {currentBatchHeader.status}
                  </span>
                )}
                {currentBatchHeader?.batchId && (
                  <span className="px-2 py-0.5 rounded bg-[#f3f2f1] text-[#323130] border border-[#e1dfdd] font-mono text-[11px]">
                    Batch #{currentBatchHeader.batchId}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-[11px] text-[#605e5c] font-mono mt-0.5 flex-wrap">
                {runId && (
                  <button
                    onClick={() => copyToClipboard(runId)}
                    title="Click to copy Pipeline Run ID"
                    className="flex items-center gap-1 text-[#605e5c] hover:text-[#0f6cbd] transition cursor-pointer"
                  >
                    <span>RunId: {runId.slice(0, 18)}...</span>
                    {copied ? <Check className="w-3 h-3 text-[#107c41]" /> : <Copy className="w-3 h-3 text-[#a19f9d]" />}
                  </button>
                )}
                {currentBatchHeader?.startTime && (
                  <span>Started: {currentBatchHeader.startTime.slice(0, 19)}</span>
                )}
                {currentBatchHeader?.duration && (
                  <span>Duration: {formatTableLogDuration(currentBatchHeader.duration, currentBatchHeader.startTime, currentBatchHeader.endTime)}</span>
                )}
              </div>
            </div>
          </div>

          {/* Header Controls */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            {data?.availableBatches && data.availableBatches.length > 0 && (
              <div className="flex items-center gap-1.5 bg-[#ffffff] border border-[#d1d1d1] px-2.5 py-1 rounded text-xs">
                <span className="text-[#605e5c]">Batch:</span>
                <select
                  value={selectedBatchId || currentBatchHeader?.batchId || ''}
                  onChange={(e) => handleBatchSelect(e.target.value)}
                  className="bg-transparent text-[#242424] font-mono focus:outline-none cursor-pointer"
                >
                  {data.availableBatches.map(b => (
                    <option key={`batch-${b.batchId}`} value={b.batchId} className="bg-[#ffffff] text-[#242424]">
                      #{b.batchId} ({b.pipelineName || 'Pipeline'}) - {b.status} {b.tablesCount !== undefined ? `• ${b.tablesCount} tables` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {onOpenConfig && (
              <button
                onClick={onOpenConfig}
                title="Edit Data Source & Column Mappings"
                className="px-2.5 py-1 rounded bg-[#ffffff] hover:bg-[#f3f2f1] border border-[#d1d1d1] text-[#242424] text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-[#0f6cbd]" />
                <span>Map Columns</span>
              </button>
            )}

            <button
              onClick={() => fetchData()}
              title="Refresh Data"
              className="p-1.5 rounded bg-[#ffffff] hover:bg-[#f3f2f1] border border-[#d1d1d1] text-[#605e5c] hover:text-[#242424] transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-[#0f6cbd]" : ""}`} />
            </button>

            <button
              onClick={onClose}
              title="Close modal"
              className="p-1.5 rounded hover:bg-[#f3f2f1] text-[#605e5c] hover:text-[#242424] transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Workspace */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 bg-[#fde7e9] border border-[#f19999] rounded text-xs text-[#a80000]">
              {error}
            </div>
          )}

          {data?.configured === false && (
            <div className="p-6 text-center rounded border border-[#edebe9] bg-[#faf9f8] space-y-3">
              <Database className="w-8 h-8 text-[#605e5c] mx-auto opacity-50" />
              <p className="text-xs text-[#605e5c]">
                No Lakehouse or Warehouse logging tables configured for this workspace.
              </p>
              {onOpenConfig && (
                <button
                  onClick={onOpenConfig}
                  className="px-3 py-1.5 rounded bg-[#0f6cbd] text-white text-xs font-medium hover:bg-[#0b5a2f] cursor-pointer"
                >
                  Configure Table Logging
                </button>
              )}
            </div>
          )}

          {data?.configured && allTableRows.length === 0 && (
            <div className="p-3.5 rounded-lg bg-[#fff4ce] border border-[#f3d97f] text-[#242424] flex items-start gap-2.5 shadow-2xs">
              <Info className="w-4 h-4 text-[#8a660a] shrink-0 mt-0.5" />
              <div className="text-xs space-y-0.5">
                <p className="font-semibold text-[#8a660a]">
                  Batch #{currentBatchHeader?.batchId || selectedBatchId || "N/A"} has 0 recorded table loads.
                </p>
              </div>
            </div>
          )}

          {/* Metric Cards */}
          <TableLogsMetricCards
            data={data}
            allTableRows={allTableRows}
            silverData={silverData}
            bronzeData={bronzeData}
          />

          {/* Filters */}
          <TableLogsFilterBar
            layerFilter={layerFilter}
            onLayerFilterChange={setLayerFilter}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            totalCount={allTableRows.length}
            silverCount={allTableRows.filter(r => r.layer?.toLowerCase() === 'silver').length}
            bronzeCount={allTableRows.filter(r => r.layer?.toLowerCase() === 'bronze').length}
          />

          {/* Table Data */}
          <TableLogsDataTable
            filteredRows={filteredRows}
            isLoading={isLoading}
            onOpenDebugRow={handleOpenDebugRow}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearFilters}
          />
        </div>

        {/* AI Debug Modal */}
        <TableLogAiDebugModal
          debugRow={debugRow}
          onClose={() => setDebugRow(null)}
          tableAiData={tableAiData}
          isLoadingTableAi={isLoadingTableAi}
          tableAiError={tableAiError}
          onFetchAiDiagnosis={fetchTableAiDiagnosis}
        />
      </div>
    </div>
  );
}
