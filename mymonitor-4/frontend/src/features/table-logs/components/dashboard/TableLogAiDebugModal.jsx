import React from 'react';
import { 
  X, 
  AlertOctagon, 
  Sparkles, 
  RefreshCw 
} from 'lucide-react';

/**
 * TableLogAiDebugModal provides detailed telemetry inspection for a selected table row,
 * including raw execution payload and AI root-cause diagnostics for ingestion failures.
 *
 * @param {Object} props
 * @param {Object} props.debugRow - Selected table row telemetry object.
 * @param {Function} props.onClose - Modal close handler.
 * @param {Object} props.tableAiData - AI diagnostic result (rootCause, recommendedFix).
 * @param {boolean} props.isLoadingTableAi - Loading state while requesting AI diagnosis.
 * @param {string} props.tableAiError - Error message if AI diagnostic request failed.
 * @param {Function} props.onFetchAiDiagnosis - Handler to request AI diagnostic analysis.
 */
export default function TableLogAiDebugModal({
  debugRow,
  onClose,
  tableAiData,
  isLoadingTableAi = false,
  tableAiError,
  onFetchAiDiagnosis
}) {
  if (!debugRow) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150 select-none">
      <div className="relative w-full max-w-2xl bg-white border border-[#edebe9] rounded-lg shadow-[0_16px_32px_rgba(0,0,0,0.16),0_4px_8px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#edebe9] flex items-center justify-between bg-[#faf9f8]">
          <div>
            <h3 className="text-sm font-semibold text-[#242424]">
              Table telemetry details: {debugRow.schema}.{debugRow.tableName}
            </h3>
            <span className="text-xs text-[#605e5c]">
              Layer: {debugRow.layer} • Status: {debugRow.status}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#ebebeb] text-[#605e5c] hover:text-[#242424] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {/* Row attributes summary */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-md bg-[#fafafa] border border-[#edebe9]">
            <div>
              <span className="text-[#605e5c] block text-[11px]">Table name</span>
              <span className="font-semibold text-[#242424]">{debugRow.tableName}</span>
            </div>
            <div>
              <span className="text-[#605e5c] block text-[11px]">Schema</span>
              <span className="font-semibold text-[#242424]">{debugRow.schema || 'dbo'}</span>
            </div>
            <div>
              <span className="text-[#605e5c] block text-[11px]">Rows Processed</span>
              <span className="font-mono font-semibold text-[#242424]">
                {debugRow.rowsProcessed?.toLocaleString() || '0'}
              </span>
            </div>
            <div>
              <span className="text-[#605e5c] block text-[11px]">Duration</span>
              <span className="font-semibold text-[#242424]">{debugRow.duration || '—'}</span>
            </div>
          </div>

          {/* Error Details if Failed */}
          {debugRow.errorMessage && (
            <div className="p-3.5 rounded-md bg-[#fde7e9] border border-[#f19999] text-[#a80000] space-y-1.5">
              <div className="flex items-center gap-2 font-semibold">
                <AlertOctagon className="w-4 h-4" />
                <span>Table Load Error</span>
              </div>
              <p className="font-mono text-[11px] whitespace-pre-wrap">{debugRow.errorMessage}</p>
            </div>
          )}

          {/* AI Diagnostic Trigger */}
          {debugRow.status?.toLowerCase() !== 'success' && (
            <div className="p-4 rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#15803d]">
                  <Sparkles className="w-4 h-4" />
                  <span>Azure OpenAI GPT-4o Failure Diagnostics</span>
                </div>
                {!tableAiData && (
                  <button
                    type="button"
                    onClick={() => onFetchAiDiagnosis(debugRow)}
                    disabled={isLoadingTableAi}
                    className="px-3 py-1 rounded bg-[#15803d] hover:bg-[#166534] text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {isLoadingTableAi ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Analyzing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Diagnose Failure</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {tableAiError && (
                <p className="text-xs text-[#a80000]">{tableAiError}</p>
              )}

              {tableAiData && (
                <div className="space-y-2 text-xs text-[#242424] pt-2 border-t border-[#bbf7d0]">
                  <div>
                    <span className="font-bold text-[#15803d]">Root Cause Analysis:</span>
                    <p className="mt-0.5">{tableAiData.rootCause || tableAiData.explanation}</p>
                  </div>
                  {tableAiData.recommendedFix && (
                    <div>
                      <span className="font-bold text-[#15803d]">Recommended Fix:</span>
                      <p className="mt-0.5">{tableAiData.recommendedFix}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Raw JSON Data */}
          <div>
            <span className="text-[11px] font-semibold text-[#605e5c] block mb-1">
              Raw Record Payload
            </span>
            <pre className="p-3 bg-[#f5f5f5] rounded border border-[#edebe9] text-[11px] font-mono overflow-x-auto text-[#242424]">
              {JSON.stringify(debugRow, null, 2)}
            </pre>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-[#edebe9] bg-[#faf9f8] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md border border-[#d1d1d1] bg-white text-xs font-medium hover:bg-[#f3f2f1] cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
