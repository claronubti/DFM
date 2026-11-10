import React from 'react';
import { 
  Sparkles, 
  TableProperties, 
  Layers, 
  FileSpreadsheet 
} from 'lucide-react';
import MappingRow from './MappingRow';
import { 
  BATCH_HEADER_FIELD_DEFS, 
  BRONZE_FIELD_DEFS, 
  SILVER_FIELD_DEFS 
} from '../../constants/auditColumnDefinitions';

/**
 * StepColumnMapping renders Step 3 of the Table Catalog configuration wizard.
 * Allows mapping database columns to standardized telemetry attributes across Batch Header, Bronze, and Silver.
 *
 * @param {Object} props
 * @param {string} props.mappingSubTab - Active sub-tab ('batch_header' | 'bronze' | 'silver').
 * @param {Function} props.onSubTabChange - Sub-tab click handler.
 * @param {Function} props.onAutoMap - Handler to run the smart column auto-mapper.
 * @param {string} props.batchHeaderTable - Batch Header table name.
 * @param {string} props.bronzeTable - Bronze table name.
 * @param {string} props.silverTable - Silver table name.
 * @param {Array} props.batchHeaderCols - Column definitions for Batch Header.
 * @param {Array} props.bronzeCols - Column definitions for Bronze.
 * @param {Array} props.silverCols - Column definitions for Silver.
 * @param {Object} props.batchHeaderMapping - Batch Header column mapping dictionary.
 * @param {Object} props.bronzeMapping - Bronze column mapping dictionary.
 * @param {Object} props.silverMapping - Silver column mapping dictionary.
 * @param {Function} props.onUpdateBatchHeaderMapping - (fieldKey, colName) => void.
 * @param {Function} props.onUpdateBronzeMapping - (fieldKey, colName) => void.
 * @param {Function} props.onUpdateSilverMapping - (fieldKey, colName) => void.
 */
export default function StepColumnMapping({
  mappingSubTab = 'batch_header',
  onSubTabChange,
  onAutoMap,
  batchHeaderTable = '',
  bronzeTable = '',
  silverTable = '',
  batchHeaderCols = [],
  bronzeCols = [],
  silverCols = [],
  batchHeaderMapping = {},
  bronzeMapping = {},
  silverMapping = {},
  onUpdateBatchHeaderMapping,
  onUpdateBronzeMapping,
  onUpdateSilverMapping
}) {
  const bhMappedCount = Object.keys(batchHeaderMapping).filter(k => batchHeaderMapping[k]).length;
  const brMappedCount = Object.keys(bronzeMapping).filter(k => bronzeMapping[k]).length;
  const slMappedCount = Object.keys(silverMapping).filter(k => silverMapping[k]).length;

  return (
    <div className="space-y-4 flex-1 flex flex-col min-h-0">
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#edebe9]">
        <div>
          <h2 className="text-sm font-semibold text-[#242424]">
            Map source database columns to standard audit attributes
          </h2>
          <p className="text-xs text-[#616161] mt-0.5">
            These mappings allow the Monitoring Hub to extract Run IDs, row counts, and status dynamically.
          </p>
        </div>

        <button
          type="button"
          onClick={onAutoMap}
          className="px-3.5 py-1.5 rounded-md bg-[#e3f7ef] hover:bg-[#117865] text-[#117865] hover:text-white border border-[#117865]/30 text-xs font-semibold transition flex items-center gap-1.5 self-start sm:self-auto shadow-xs cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Auto-Map Matching Columns</span>
        </button>
      </div>

      {/* Sub Tabs: Batch Header / Bronze / Silver */}
      <div className="shrink-0 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSubTabChange('batch_header')}
          className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
            mappingSubTab === 'batch_header'
              ? 'bg-[#117865] text-white shadow-xs'
              : 'bg-[#f5f5f5] text-[#616161] hover:bg-[#edebe9]'
          }`}
        >
          <TableProperties className="w-3.5 h-3.5" />
          <span>Batch Header ({bhMappedCount}/{BATCH_HEADER_FIELD_DEFS.length})</span>
        </button>
        <button
          type="button"
          onClick={() => onSubTabChange('bronze')}
          className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
            mappingSubTab === 'bronze'
              ? 'bg-[#117865] text-white shadow-xs'
              : 'bg-[#f5f5f5] text-[#616161] hover:bg-[#edebe9]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Bronze Layer ({brMappedCount}/{BRONZE_FIELD_DEFS.length})</span>
        </button>
        <button
          type="button"
          onClick={() => onSubTabChange('silver')}
          className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
            mappingSubTab === 'silver'
              ? 'bg-[#117865] text-white shadow-xs'
              : 'bg-[#f5f5f5] text-[#616161] hover:bg-[#edebe9]'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Silver Layer ({slMappedCount}/{SILVER_FIELD_DEFS.length})</span>
        </button>
      </div>

      {/* Mapping Table for Selected Sub Tab */}
      <div className="bg-white border border-[#edebe9] rounded-lg p-4 sm:p-5 shadow-xs flex-1 min-h-0 flex flex-col overflow-hidden">
        {mappingSubTab === 'batch_header' && (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 text-xs font-semibold text-[#616161] pb-2.5 border-b border-[#edebe9] mb-2 flex items-center justify-between px-1">
              <span>Target Attribute</span>
              <span>Source Column ({batchHeaderTable || "No Table Selected"})</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-2">
              {BATCH_HEADER_FIELD_DEFS.map((field) => (
                <MappingRow
                  key={field.key}
                  label={field.label}
                  description={field.description}
                  currentVal={batchHeaderMapping[field.key]}
                  columns={batchHeaderCols}
                  onChange={(val) => onUpdateBatchHeaderMapping(field.key, val)}
                />
              ))}
            </div>
          </div>
        )}

        {mappingSubTab === 'bronze' && (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 text-xs font-semibold text-[#616161] pb-2.5 border-b border-[#edebe9] mb-2 flex items-center justify-between px-1">
              <span>Target Attribute</span>
              <span>Source Column ({bronzeTable || "No Table Selected"})</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-2">
              {BRONZE_FIELD_DEFS.map((field) => (
                <MappingRow
                  key={field.key}
                  label={field.label}
                  description={field.description}
                  currentVal={bronzeMapping[field.key]}
                  columns={bronzeCols}
                  onChange={(val) => onUpdateBronzeMapping(field.key, val)}
                />
              ))}
            </div>
          </div>
        )}

        {mappingSubTab === 'silver' && (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 text-xs font-semibold text-[#616161] pb-2.5 border-b border-[#edebe9] mb-2 flex items-center justify-between px-1">
              <span>Target Attribute</span>
              <span>Source Column ({silverTable || "No Table Selected"})</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-2">
              {SILVER_FIELD_DEFS.map((field) => (
                <MappingRow
                  key={field.key}
                  label={field.label}
                  description={field.description}
                  currentVal={silverMapping[field.key]}
                  columns={silverCols}
                  onChange={(val) => onUpdateSilverMapping(field.key, val)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
