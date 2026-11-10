import React from 'react';
import { RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

/**
 * TableLogsDataTable renders the telemetry log table grid and row inspect action triggers.
 *
 * @param {Object} props
 * @param {Array} props.filteredRows - Processed and filtered list of table telemetry records.
 * @param {boolean} props.isLoading - Whether table logs are currently being fetched.
 * @param {Function} props.onOpenDebugRow - Handler to inspect a single table log row in modal.
 * @param {boolean} props.hasActiveFilters - Whether filters or search term are applied.
 * @param {Function} props.onClearFilters - Handler to reset active filters.
 */
export default function TableLogsDataTable({
  filteredRows = [],
  isLoading = false,
  onOpenDebugRow,
  hasActiveFilters = false,
  onClearFilters
}) {
  return (
    <div className="bg-white border border-[#edebe9] rounded-lg shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#f5f5f5] text-[#605e5c] font-semibold border-b border-[#edebe9]">
            <tr>
              <th className="py-2.5 px-4">Layer</th>
              <th className="py-2.5 px-4">Table Name</th>
              <th className="py-2.5 px-4">Schema</th>
              <th className="py-2.5 px-4">Operation</th>
              <th className="py-2.5 px-4">Status</th>
              <th className="py-2.5 px-4">Rows Processed</th>
              <th className="py-2.5 px-4">Duration</th>
              <th className="py-2.5 px-4">Execution Time</th>
              <th className="py-2.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edebe9]">
            {filteredRows.length > 0 ? (
              filteredRows.map((row, idx) => {
                const isSuccess = row.status?.toLowerCase() === 'success';
                return (
                  <tr key={`row-${idx}`} className="hover:bg-[#faf9f8] transition">
                    {/* Layer */}
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        row.layer?.toLowerCase() === 'silver'
                          ? 'bg-[#ebf3fc] text-[#0f6cbd]'
                          : 'bg-[#fff4ce] text-[#8a660a]'
                      }`}>
                        {row.layer?.toUpperCase()}
                      </span>
                    </td>

                    {/* Table Name */}
                    <td className="py-3 px-4 font-semibold text-[#242424]">
                      {row.tableName}
                    </td>

                    {/* Schema */}
                    <td className="py-3 px-4 font-mono text-[#605e5c]">
                      {row.schema || 'dbo'}
                    </td>

                    {/* Operation */}
                    <td className="py-3 px-4 text-[#605e5c]">
                      {row.operation || 'Data Load'}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider inline-flex items-center gap-1 border ${
                        isSuccess
                          ? 'bg-[#dff6dd] text-[#107c41] border-[#92c353]'
                          : 'bg-[#fde7e9] text-[#a80000] border-[#f19999]'
                      }`}>
                        {isSuccess ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        <span>{row.status}</span>
                      </span>
                    </td>

                    {/* Rows Processed */}
                    <td className="py-3 px-4 font-mono text-[#242424]">
                      {typeof row.rowsProcessed === 'number' 
                        ? row.rowsProcessed.toLocaleString() 
                        : (row.rowsProcessed || '0')}
                    </td>

                    {/* Duration */}
                    <td className="py-3 px-4 text-[#605e5c]">
                      {row.duration || '—'}
                    </td>

                    {/* Execution Time */}
                    <td className="py-3 px-4 text-[11px] text-[#605e5c] font-mono">
                      {row.startTime ? row.startTime.slice(0, 19) : '—'}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenDebugRow(row)}
                        className="px-2 py-1 rounded text-xs font-medium text-[#0f6cbd] hover:bg-[#eff6fc] transition cursor-pointer"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={9} className="py-12 text-center text-[#605e5c]">
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-[#117865]" />
                      <span>Loading table logs...</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="font-semibold text-[#242424]">No table logs found</p>
                      <p className="text-xs text-[#605e5c]">
                        {hasActiveFilters
                          ? 'Try clearing active filters to see all recorded table logs.'
                          : 'No tables were recorded for this batch execution.'}
                      </p>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={onClearFilters}
                          className="text-xs font-semibold text-[#117865] hover:underline mt-2 inline-block cursor-pointer"
                        >
                          Reset filters
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
