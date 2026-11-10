import React from 'react';
import { RefreshCw, Info, Check } from 'lucide-react';

/**
 * StepTableSelect renders Step 2 of the Table Catalog configuration wizard.
 * Allows assigning catalog SQL tables to Batch Header, Bronze Ingestion, and Silver Refinement roles.
 *
 * @param {Object} props
 * @param {Object} props.currentArtifact - Currently selected Fabric data artifact object.
 * @param {Array} props.availableTables - Discovered SQL tables in the artifact.
 * @param {boolean} props.isLoadingTables - Loading state while querying SQL endpoint tables.
 * @param {string} props.batchHeaderTable - Selected full table name for Batch Header.
 * @param {string} props.bronzeTable - Selected full table name for Bronze.
 * @param {string} props.silverTable - Selected full table name for Silver.
 * @param {number} props.batchHeaderColCount - Count of discovered columns in Batch Header table.
 * @param {number} props.bronzeColCount - Count of discovered columns in Bronze table.
 * @param {number} props.silverColCount - Count of discovered columns in Silver table.
 * @param {Function} props.onTableChange - Handler when a table dropdown changes: (role, tableName) => void.
 */
export default function StepTableSelect({
  currentArtifact,
  availableTables = [],
  isLoadingTables = false,
  batchHeaderTable = '',
  bronzeTable = '',
  silverTable = '',
  batchHeaderColCount = 0,
  bronzeColCount = 0,
  silverColCount = 0,
  onTableChange
}) {
  return (
    <div className="space-y-6 flex-1 flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#242424]">
            Select table catalog for {currentArtifact?.displayName || "selected artifact"}
          </h2>
          <p className="text-xs text-[#616161] mt-0.5">
            Assign which SQL tables in this artifact correspond to Batch Header, Bronze Ingestion, and Silver Refinement.
          </p>
        </div>

        {isLoadingTables && (
          <span className="flex items-center gap-1.5 text-xs text-[#117865] animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Querying SQL Endpoint tables...
          </span>
        )}
      </div>

      {!isLoadingTables && availableTables.length === 0 && (
        <div className="p-4 rounded-lg bg-[#fff4ce] border border-[#fde896] text-[#8a660a] text-xs flex items-center gap-2.5">
          <Info className="w-4 h-4 shrink-0" />
          <span>
            No user tables or views were found in <strong>{currentArtifact?.displayName}</strong>. 
            Please ensure the artifact has tables created (or select an artifact containing batch metadata like <strong>WH_MetaData</strong>).
          </span>
        </div>
      )}

      {/* 3 Role Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Batch Header Table */}
        <div className="p-4 rounded-lg border border-[#edebe9] bg-[#fafafa] space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-[#242424]">1. Batch Header Log Table</span>
              <span className="text-[10px] text-[#117865] font-medium px-2 py-0.5 bg-[#e3f7ef] rounded">Master</span>
            </div>
            <p className="text-[11px] text-[#616161] mt-1">
              Stores overall pipeline execution, Run ID, Batch ID, and total duration.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-[#616161] block">
              Table Selection:
            </label>
            <select
              value={batchHeaderTable}
              onChange={(e) => onTableChange('batch_header', e.target.value)}
              className="w-full bg-white border border-[#d1d1d1] rounded-md px-2.5 py-1.5 text-xs text-[#242424] focus:outline-none focus:border-[#117865] font-mono cursor-pointer shadow-xs"
            >
              <option value="">-- Select Table --</option>
              {availableTables.map(t => (
                <option key={`bh-${t.fullName}`} value={t.fullName}>{t.fullName}</option>
              ))}
            </select>

            {batchHeaderTable && (
              <div className="text-[11px] text-[#117865] font-medium flex items-center gap-1 mt-1">
                <Check className="w-3 h-3 stroke-[3]" /> {batchHeaderColCount} columns discovered
              </div>
            )}
          </div>
        </div>

        {/* Bronze Log Table */}
        <div className="p-4 rounded-lg border border-[#edebe9] bg-[#fafafa] space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-[#242424]">2. Bronze Layer Audit Table</span>
              <span className="text-[10px] text-[#8a660a] font-medium px-2 py-0.5 bg-[#fff4ce] rounded">Raw Layer</span>
            </div>
            <p className="text-[11px] text-[#616161] mt-1">
              Stores raw extraction audit logs, ingested row counts, and status per table.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-[#616161] block">
              Table Selection:
            </label>
            <select
              value={bronzeTable}
              onChange={(e) => onTableChange('bronze', e.target.value)}
              className="w-full bg-white border border-[#d1d1d1] rounded-md px-2.5 py-1.5 text-xs text-[#242424] focus:outline-none focus:border-[#117865] font-mono cursor-pointer shadow-xs"
            >
              <option value="">-- Select Table --</option>
              {availableTables.map(t => (
                <option key={`br-${t.fullName}`} value={t.fullName}>{t.fullName}</option>
              ))}
            </select>

            {bronzeTable && (
              <div className="text-[11px] text-[#117865] font-medium flex items-center gap-1 mt-1">
                <Check className="w-3 h-3 stroke-[3]" /> {bronzeColCount} columns discovered
              </div>
            )}
          </div>
        </div>

        {/* Silver Log Table */}
        <div className="p-4 rounded-lg border border-[#edebe9] bg-[#fafafa] space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-[#242424]">3. Silver Layer Audit Table</span>
              <span className="text-[10px] text-[#117865] font-medium px-2 py-0.5 bg-[#e3f7ef] rounded">Refined Layer</span>
            </div>
            <p className="text-[11px] text-[#616161] mt-1">
              Stores transformation logs, refined row counts, and stage execution metrics.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-[#616161] block">
              Table Selection:
            </label>
            <select
              value={silverTable}
              onChange={(e) => onTableChange('silver', e.target.value)}
              className="w-full bg-white border border-[#d1d1d1] rounded-md px-2.5 py-1.5 text-xs text-[#242424] focus:outline-none focus:border-[#117865] font-mono cursor-pointer shadow-xs"
            >
              <option value="">-- Select Table --</option>
              {availableTables.map(t => (
                <option key={`sl-${t.fullName}`} value={t.fullName}>{t.fullName}</option>
              ))}
            </select>

            {silverTable && (
              <div className="text-[11px] text-[#117865] font-medium flex items-center gap-1 mt-1">
                <Check className="w-3 h-3 stroke-[3]" /> {silverColCount} columns discovered
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
