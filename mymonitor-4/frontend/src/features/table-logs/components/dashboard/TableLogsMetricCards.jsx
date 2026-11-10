import React from 'react';
import { 
  Database, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Layers 
} from 'lucide-react';

/**
 * TableLogsMetricCards renders the summary KPI tiles across all tables and
 * the dual overview cards for Silver (L2) and Bronze (L1) layers.
 *
 * @param {Object} props
 * @param {Object} props.data - Full table-logs API payload.
 * @param {Array} props.allTableRows - List of table execution rows.
 * @param {Object} props.silverData - Silver layer overview statistics.
 * @param {Object} props.bronzeData - Bronze layer overview statistics.
 */
export default function TableLogsMetricCards({
  data,
  allTableRows = [],
  silverData,
  bronzeData
}) {
  const kpis = data?.kpis || {};

  const totalTables = kpis.totalTables ?? allTableRows.length;
  const successfullyLoaded = kpis.successfullyLoaded ?? kpis.successCount ?? 0;
  const failedTables = kpis.failedTables ?? kpis.failedCount ?? 0;
  const avgLoadDuration = kpis.avgLoadDuration || kpis.avgDurationFormatted || "0.00s";
  const rowsProcessed = kpis.rowsProcessed || kpis.totalRowsFormatted || (kpis.totalRows ? kpis.totalRows.toLocaleString() : "0");

  return (
    <div className="space-y-4">
      {/* 1. Top KPI Metric Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white border border-[#edebe9] rounded-lg p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#605e5c] font-medium">Total Tables</span>
            <Database className="w-4 h-4 text-[#0f6cbd]" />
          </div>
          <div className="text-2xl font-bold text-[#242424] mt-1.5">
            {totalTables}
          </div>
          <span className="text-[11px] text-[#605e5c] mt-0.5 block">Loaded across all layers</span>
        </div>

        <div className="bg-white border border-[#edebe9] rounded-lg p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#605e5c] font-medium">Successfully Loaded</span>
            <CheckCircle2 className="w-4 h-4 text-[#107c41]" />
          </div>
          <div className="text-2xl font-bold text-[#107c41] mt-1.5">
            {successfullyLoaded}
          </div>
          <span className="text-[11px] text-[#107c41] font-semibold mt-0.5 block">100% data integrity</span>
        </div>

        <div className="bg-white border border-[#edebe9] rounded-lg p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#605e5c] font-medium">Failed Tables</span>
            <XCircle className="w-4 h-4 text-[#a80000]" />
          </div>
          <div className={`text-2xl font-bold mt-1.5 ${
            failedTables > 0 ? 'text-[#a80000]' : 'text-[#242424]'
          }`}>
            {failedTables}
          </div>
          <span className="text-[11px] text-[#605e5c] mt-0.5 block">Errors during ETL run</span>
        </div>

        <div className="bg-white border border-[#edebe9] rounded-lg p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#605e5c] font-medium">Avg. Load Duration</span>
            <Clock className="w-4 h-4 text-[#008272]" />
          </div>
          <div className="text-2xl font-bold text-[#242424] mt-1.5">
            {avgLoadDuration}
          </div>
          <span className="text-[11px] text-[#605e5c] mt-0.5 block">Per table average execution</span>
        </div>

        <div className="bg-white border border-[#edebe9] rounded-lg p-3.5 shadow-2xs col-span-2 sm:span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#605e5c] font-medium">Rows Processed</span>
            <Layers className="w-4 h-4 text-[#8764b8]" />
          </div>
          <div className="text-2xl font-bold text-[#242424] mt-1.5 font-mono">
            {rowsProcessed}
          </div>
          <span className="text-[11px] text-[#605e5c] mt-0.5 block">Total records transferred</span>
        </div>
      </div>

      {/* 2. Layer Overview Dual Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Silver Layer Overview (L2) */}
        <div className="bg-white border border-[#edebe9] rounded-lg p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#edebe9]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0f6cbd]" />
              <span className="text-xs font-semibold text-[#242424]">Silver Layer – Tables Overview</span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#ebf3fc] text-[#0f6cbd]">L2</span>
            </div>
            <span className="text-xs font-semibold text-[#107c41]">
              {silverData?.successRate || "100.0%"} Success
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded bg-[#faf9f8] border border-[#edebe9]">
              <span className="text-[11px] text-[#605e5c] block">Total Tables</span>
              <span className="text-sm font-bold text-[#242424]">{silverData?.totalTables ?? 0}</span>
            </div>
            <div className="p-2 rounded bg-[#faf9f8] border border-[#edebe9]">
              <span className="text-[11px] text-[#605e5c] block">Successfully Loaded</span>
              <span className="text-sm font-bold text-[#107c41]">{silverData?.successfullyLoaded ?? silverData?.successCount ?? 0}</span>
            </div>
            <div className="p-2 rounded bg-[#faf9f8] border border-[#edebe9]">
              <span className="text-[11px] text-[#605e5c] block">Failed</span>
              <span className={`text-sm font-bold ${
                (silverData?.failed ?? silverData?.failedCount ?? 0) > 0 ? 'text-[#a80000]' : 'text-[#242424]'
              }`}>
                {silverData?.failed ?? silverData?.failedCount ?? 0}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#605e5c] pt-1">
            <span>Avg. Load Duration: <strong className="text-[#242424]">{silverData?.avgLoadDuration || silverData?.avgDurationFormatted || "0.00s"}</strong></span>
            <span>Rows Processed: <strong className="text-[#242424]">{silverData?.rowsProcessed || silverData?.totalRowsFormatted || "0"}</strong></span>
          </div>
        </div>

        {/* Bronze Layer Overview (L1) */}
        <div className="bg-white border border-[#edebe9] rounded-lg p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#edebe9]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#c19c00]" />
              <span className="text-xs font-semibold text-[#242424]">Bronze Layer – Tables Overview</span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#fff4ce] text-[#8a660a]">L1</span>
            </div>
            <span className="text-xs font-semibold text-[#107c41]">
              {bronzeData?.successRate || "100.0%"} Success
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded bg-[#faf9f8] border border-[#edebe9]">
              <span className="text-[11px] text-[#605e5c] block">Total Tables</span>
              <span className="text-sm font-bold text-[#242424]">{bronzeData?.totalTables ?? 0}</span>
            </div>
            <div className="p-2 rounded bg-[#faf9f8] border border-[#edebe9]">
              <span className="text-[11px] text-[#605e5c] block">Successfully Loaded</span>
              <span className="text-sm font-bold text-[#107c41]">{bronzeData?.successfullyLoaded ?? bronzeData?.successCount ?? 0}</span>
            </div>
            <div className="p-2 rounded bg-[#faf9f8] border border-[#edebe9]">
              <span className="text-[11px] text-[#605e5c] block">Failed</span>
              <span className={`text-sm font-bold ${
                (bronzeData?.failed ?? bronzeData?.failedCount ?? 0) > 0 ? 'text-[#a80000]' : 'text-[#242424]'
              }`}>
                {bronzeData?.failed ?? bronzeData?.failedCount ?? 0}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#605e5c] pt-1">
            <span>Avg. Load Duration: <strong className="text-[#242424]">{bronzeData?.avgLoadDuration || bronzeData?.avgDurationFormatted || "0.00s"}</strong></span>
            <span>Rows Processed: <strong className="text-[#242424]">{bronzeData?.rowsProcessed || bronzeData?.totalRowsFormatted || "0"}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}
