import React from 'react';
import { Database, TableProperties, Check, ShieldCheck } from 'lucide-react';

/**
 * StepReviewSave renders Step 4 of the Table Catalog configuration wizard.
 * Presents a summary of the selected data source, catalog tables, health checklist,
 * and readiness validation before persisting.
 *
 * @param {Object} props
 * @param {Object} props.currentArtifact - Currently selected Fabric data artifact.
 * @param {string} props.batchHeaderTable - Selected Batch Header table name.
 * @param {string} props.bronzeTable - Selected Bronze table name.
 * @param {string} props.silverTable - Selected Silver table name.
 * @param {boolean} props.isStep1Complete - Whether artifact is selected.
 * @param {boolean} props.isStep2Complete - Whether at least 1 table is selected.
 * @param {string} props.pipelineRunIdCol - Batch header pipeline run ID mapped column name.
 * @param {number} props.totalMappedColumns - Total count of mapped columns across all layers.
 */
export default function StepReviewSave({
  currentArtifact,
  batchHeaderTable = '',
  bronzeTable = '',
  silverTable = '',
  isStep1Complete = false,
  isStep2Complete = false,
  pipelineRunIdCol = '',
  totalMappedColumns = 0
}) {
  return (
    <div className="space-y-6 flex-1 flex flex-col">
      <div>
        <h2 className="text-sm font-semibold text-[#242424]">
          Review configuration summary
        </h2>
        <p className="text-xs text-[#616161] mt-0.5">
          Verify your Microsoft Fabric data item, catalog tables, and column audit mappings before applying.
        </p>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Source Summary */}
        <div className="p-4 rounded-lg border border-[#edebe9] bg-[#fafafa] space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#117865]">
            <Database className="w-4 h-4" />
            <span>Data Source & SQL Endpoint</span>
          </div>
          <div className="text-xs space-y-1 pt-1 border-t border-[#edebe9]">
            <div className="flex justify-between">
              <span className="text-[#616161]">Item Name:</span>
              <span className="font-semibold text-[#242424]">{currentArtifact?.displayName || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#616161]">Item Type:</span>
              <span className="font-medium text-[#242424]">{currentArtifact?.type || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#616161]">Database:</span>
              <span className="font-mono text-[#242424]">{currentArtifact?.databaseName || "—"}</span>
            </div>
          </div>
        </div>

        {/* Tables Summary */}
        <div className="p-4 rounded-lg border border-[#edebe9] bg-[#fafafa] space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#117865]">
            <TableProperties className="w-4 h-4" />
            <span>Catalog Log Tables</span>
          </div>
          <div className="text-xs space-y-1 pt-1 border-t border-[#edebe9]">
            <div className="flex justify-between">
              <span className="text-[#616161]">Batch Header:</span>
              <span className="font-mono text-[#242424]">{batchHeaderTable || "Not selected"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#616161]">Bronze Layer:</span>
              <span className="font-mono text-[#242424]">{bronzeTable || "Not selected"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#616161]">Silver Layer:</span>
              <span className="font-mono text-[#242424]">{silverTable || "Not selected"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Readiness Checklist */}
      <div className="p-4 rounded-lg border border-[#edebe9] bg-white space-y-3 shadow-xs">
        <span className="text-xs font-semibold text-[#242424] block">
          Configuration Health Checklist
        </span>

        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            {isStep1Complete ? (
              <div className="w-4 h-4 rounded-full bg-[#117865] text-white flex items-center justify-center shrink-0">
                <Check className="w-2.5 h-2.5 stroke-[3]" />
              </div>
            ) : (
              <div className="w-4 h-4 rounded-full border border-[#d1d1d1] shrink-0" />
            )}
            <span className={isStep1Complete ? 'text-[#242424] font-medium' : 'text-[#616161]'}>
              Fabric Warehouse / Lakehouse Selected & Connected
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isStep2Complete ? (
              <div className="w-4 h-4 rounded-full bg-[#117865] text-white flex items-center justify-center shrink-0">
                <Check className="w-2.5 h-2.5 stroke-[3]" />
              </div>
            ) : (
              <div className="w-4 h-4 rounded-full border border-[#d1d1d1] shrink-0" />
            )}
            <span className={isStep2Complete ? 'text-[#242424] font-medium' : 'text-[#616161]'}>
              At least 1 log table selected in Table Catalog
            </span>
          </div>

          <div className="flex items-center gap-2">
            {pipelineRunIdCol ? (
              <div className="w-4 h-4 rounded-full bg-[#117865] text-white flex items-center justify-center shrink-0">
                <Check className="w-2.5 h-2.5 stroke-[3]" />
              </div>
            ) : (
              <div className="w-4 h-4 rounded-full bg-[#fff4ce] text-[#8a660a] flex items-center justify-center shrink-0 text-[10px] font-bold">
                !
              </div>
            )}
            <span className={pipelineRunIdCol ? 'text-[#242424] font-medium' : 'text-[#8a660a]'}>
              Pipeline Run ID correlated for Monitoring Hub telemetry
            </span>
          </div>

          <div className="flex items-center gap-2">
            {totalMappedColumns > 0 ? (
              <div className="w-4 h-4 rounded-full bg-[#117865] text-white flex items-center justify-center shrink-0">
                <Check className="w-2.5 h-2.5 stroke-[3]" />
              </div>
            ) : (
              <div className="w-4 h-4 rounded-full border border-[#d1d1d1] shrink-0" />
            )}
            <span className="text-[#242424] font-medium">
              {totalMappedColumns} audit attributes mapped across layers
            </span>
          </div>
        </div>
      </div>

      {/* Ready to apply banner */}
      <div className="p-3.5 rounded-lg bg-[#e3f7ef] border border-[#117865]/30 text-[#117865] text-xs flex items-center gap-2.5 mt-auto">
        <ShieldCheck className="w-5 h-5 shrink-0" />
        <span>
          Ready to apply! Click <strong>Save & Apply Configuration</strong> below to persist your mappings to the Monitoring Hub.
        </span>
      </div>
    </div>
  );
}
