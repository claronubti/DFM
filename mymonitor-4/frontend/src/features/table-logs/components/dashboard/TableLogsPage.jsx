import React, { useState, useEffect, useMemo } from 'react';
import { 
  Database, 
  RefreshCw, 
  Settings, 
  Info,
  ArrowLeft 
} from 'lucide-react';
import { getTableLogAiFix } from '../../api';
import { apiFetch } from '../../../../services/api/apiClient';

import BatchHeaderCard from './BatchHeaderCard';
import TableLogsMetricCards from './TableLogsMetricCards';
import TableLogsFilterBar from './TableLogsFilterBar';
import TableLogsDataTable from './TableLogsDataTable';
import TableLogAiDebugModal from './TableLogAiDebugModal';

/**
 * TableLogsPage renders the Lakehouse & Warehouse table telemetry monitoring hub.
 * Displays batch execution status, aggregate KPIs across layers, filtering tools,
 * 9-column audit data grid, and AI failure diagnostics.
 *
 * @param {Object} props
 * @param {string} props.workspaceId - Fabric workspace GUID.
 * @param {string} [props.workspaceName] - Fabric workspace display name.
 * @param {Object} [props.pipeline] - Currently selected pipeline run telemetry.
 * @param {Array} [props.pipelines=[]] - Available pipelines in the workspace.
 * @param {Function} [props.onSelectPipeline] - Callback when user selects another pipeline.
 * @param {Function} [props.onOpenConfig] - Callback to open the column mapping configuration wizard.
 * @param {Function} props.onBackToMonitoring - Close / Back to main hub handler.
 */
export default function TableLogsPage({ 
  workspaceId, 
  workspaceName,
  pipeline, 
  pipelines = [],
  onSelectPipeline,
  onOpenConfig,
  onBackToMonitoring
}) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBatchId, setSelectedBatchId] = useState('');

  // Filters
  const [layerFilter, setLayerFilter] = useState('All'); // 'All' | 'Bronze' | 'Silver'
  const [statusFilter, setStatusFilter] = useState('All'); // 'All' | 'Success' | 'Failed'
  const [searchTerm, setSearchTerm] = useState('');
  
  // Inspection / AI diagnostics
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
        pipelineName: data?.batchHeader?.pipelineName || pipeline?.pipelineName || 'Pipeline',
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

    const targetBatch = overrideBatchId !== null ? overrideBatchId : selectedBatchId;
    const params = new URLSearchParams();
    if (targetBatch) {
      params.set('batch_id', targetBatch);
    } else if (pipelineRunId) {
      params.set('pipeline_run_id', pipelineRunId);
    }

    try {
      const json = await apiFetch(`/api/workspaces/${workspaceId}/table-logs?${params.toString()}`);
      setData(json);
      if (json?.batchHeader?.batchId && !overrideBatchId && !selectedBatchId) {
        setSelectedBatchId(json.batchHeader.batchId);
      }
    } catch (err) {
      console.error("Table Logs fetch failed:", err);
      setError(err.message || 'Error loading table logs.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [workspaceId, pipelineRunId]);

  const handleBatchSelect = (batchId) => {
    setSelectedBatchId(batchId);
    fetchData(batchId);
  };

  const allTableRows = useMemo(() => {
    return data?.tableDetails || data?.tables || [];
  }, [data]);

  // Filtered table rows
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

  const hasActiveFilters = searchTerm !== '' || layerFilter !== 'All' || statusFilter !== 'All';
  const batches = data?.availableBatches || data?.recentBatches || [];
  const currentBatchHeader = data?.batchHeader;
  const silverData = data?.silverOverview || data?.layerOverviews?.silver;
  const bronzeData = data?.bronzeOverview || data?.layerOverviews?.bronze;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#faf9f8] text-[#242424] font-sans overflow-hidden">
      {/* 1. Page Header & Command Ribbon */}
      <div className="bg-white border-b border-[#edebe9] px-6 py-3.5 shrink-0 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Page Title & Pipeline Selector */}
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToMonitoring}
              title="Back to Monitoring Hub"
              className="p-1.5 rounded hover:bg-[#f3f2f1] text-[#605e5c] hover:text-[#242424] transition border border-[#edebe9] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-[#242424]">
                  Table logs
                </h1>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#e3f7ef] text-[#117865]">
                  L2
                </span>
                
                {/* Pipeline Selector if multiple pipelines exist */}
                {pipelines && pipelines.length > 0 && (
                  <div className="relative inline-block ml-2">
                    <select
                      value={pipeline?.id || pipeline?.pipelineId || ''}
                      onChange={(e) => {
                        const sel = pipelines.find(p => p.id === e.target.value || p.pipelineId === e.target.value);
                        if (sel && onSelectPipeline) {
                          onSelectPipeline(sel);
                        }
                      }}
                      className="bg-[#f5f5f5] hover:bg-[#edebe9] border border-[#d1d1d1] rounded px-2.5 py-1 text-xs font-semibold text-[#242424] focus:outline-none focus:border-[#117865] cursor-pointer"
                    >
                      {pipelines.map(p => (
                        <option key={p.id || p.pipelineId} value={p.id || p.pipelineId}>
                          {p.pipelineName || p.name || 'Pipeline'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <p className="text-xs text-[#605e5c] mt-0.5">
                Lakehouse & Warehouse bronze/silver ingestion telemetry, batch execution details, and AI diagnostics.
              </p>
            </div>
          </div>

          {/* Right: Batch Switcher & Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {batches.length > 0 && (
              <div className="flex items-center gap-1.5 bg-[#ffffff] border border-[#d1d1d1] px-2.5 py-1 rounded text-xs">
                <span className="text-[#605e5c] font-medium">Batch:</span>
                <select
                  value={selectedBatchId || currentBatchHeader?.batchId || ''}
                  onChange={(e) => handleBatchSelect(e.target.value)}
                  className="bg-transparent text-[#242424] font-mono focus:outline-none cursor-pointer max-w-[280px] truncate font-medium"
                >
                  {batches.map(b => (
                    <option key={`batch-${b.batchId}`} value={b.batchId}>
                      #{b.batchId} ({b.pipelineName || 'Pipeline'}) - {b.status} {b.tablesCount !== undefined ? `• ${b.tablesCount} tables` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {onOpenConfig && (
              <button
                type="button"
                onClick={onOpenConfig}
                title="Configure Lakehouse/Warehouse table catalog and audit column mappings"
                className="px-3 py-1.5 rounded bg-white hover:bg-[#f3f2f1] border border-[#d1d1d1] hover:border-[#117865] text-[#242424] hover:text-[#117865] text-xs font-medium flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-[#117865]" />
                <span>Map Columns</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => fetchData()}
              title="Refresh Table Logs"
              className="p-1.5 rounded bg-white hover:bg-[#f3f2f1] border border-[#d1d1d1] text-[#605e5c] hover:text-[#242424] transition shadow-2xs cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-[#117865]" : ""}`} />
            </button>
          </div>
        </div>

        {/* Sub-strip: Active Batch Run Information */}
        <BatchHeaderCard 
          currentBatchHeader={currentBatchHeader} 
          pipeline={pipeline} 
          pipelineRunId={pipelineRunId} 
        />
      </div>

      {/* 2. Main Scrollable Workspace Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Unconfigured State Banner */}
        {data?.configured === false && (
          <div className="p-8 text-center rounded-lg bg-white border border-[#edebe9] space-y-4 shadow-sm max-w-2xl mx-auto mt-8">
            <div className="w-12 h-12 rounded bg-[#e3f7ef] border border-[#117865]/20 text-[#117865] flex items-center justify-center mx-auto">
              <Database className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-[#242424]">No Lakehouse/Warehouse Mapping Configured</h3>
              <p className="text-xs text-[#605e5c] max-w-md mx-auto">
                To view table-level logging, select your Fabric Warehouse or Lakehouse and map the Batch Header, Bronze, and Silver log tables.
              </p>
            </div>
            {onOpenConfig && (
              <button
                type="button"
                onClick={onOpenConfig}
                className="px-4 py-2 rounded-md bg-[#117865] hover:bg-[#0c5e4f] text-white font-medium text-xs shadow-sm transition cursor-pointer"
              >
                Configure Lakehouse / Warehouse & Columns
              </button>
            )}
          </div>
        )}

        {/* Alert Banner for 0 Recorded Table Loads */}
        {data?.configured && allTableRows.length === 0 && (
          <div className="p-4 rounded-lg bg-[#fff4ce] border border-[#f3d97f] text-[#242424] flex items-start gap-3 shadow-2xs">
            <Info className="w-5 h-5 text-[#8a660a] shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-semibold text-[#8a660a]">
                Batch #{currentBatchHeader?.batchId || selectedBatchId || "N/A"} has 0 recorded table loads
                {currentBatchHeader?.status ? ` (Status: ${currentBatchHeader.status})` : ''}.
              </p>
              <p className="text-[#605e5c]">
                This batch run has not logged any tables to the Bronze or Silver log tables yet. 
                {batches.length > 1 && (
                  <span> You can switch to another batch with recorded tables using the Batch dropdown above.</span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* 3. Top KPI Metric Tiles and Layer Overviews */}
        <TableLogsMetricCards
          data={data}
          allTableRows={allTableRows}
          silverData={silverData}
          bronzeData={bronzeData}
        />

        {/* 4. Filter & Search Toolbar */}
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

        {/* 5. Telemetry Table Grid */}
        <TableLogsDataTable
          filteredRows={filteredRows}
          isLoading={isLoading}
          onOpenDebugRow={handleOpenDebugRow}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearFilters}
        />
      </div>

      {/* 6. Detailed Row Inspection & AI Diagnostic Modal */}
      <TableLogAiDebugModal
        debugRow={debugRow}
        onClose={() => setDebugRow(null)}
        tableAiData={tableAiData}
        isLoadingTableAi={isLoadingTableAi}
        tableAiError={tableAiError}
        onFetchAiDiagnosis={fetchTableAiDiagnosis}
      />
    </div>
  );
}
