import React from 'react';
import { Search, RefreshCw, Database, Check } from 'lucide-react';

/**
 * StepDataSourceSelect renders Step 1 of the Table Catalog configuration wizard.
 * Enables searching, filtering, and selecting a Microsoft Fabric Lakehouse or Warehouse.
 *
 * @param {Object} props
 * @param {Array} props.artifacts - All discovered workspace data items.
 * @param {string} props.selectedArtifactId - Selected artifact ID.
 * @param {Function} props.onSelectArtifact - Callback when an artifact card is clicked.
 * @param {boolean} props.isLoadingArtifacts - Loading spinner indicator.
 * @param {string} props.sourceSearch - Search filter text.
 * @param {Function} props.onSearchChange - Search text change handler.
 * @param {string} props.sourceTypeFilter - Type filter ('ALL' | 'WAREHOUSE' | 'LAKEHOUSE').
 * @param {Function} props.onTypeFilterChange - Type filter change handler.
 */
export default function StepDataSourceSelect({
  artifacts = [],
  selectedArtifactId,
  onSelectArtifact,
  isLoadingArtifacts = false,
  sourceSearch = '',
  onSearchChange,
  sourceTypeFilter = 'ALL',
  onTypeFilterChange
}) {
  const filteredArtifacts = artifacts.filter(art => {
    const matchesSearch = !sourceSearch || 
      art.displayName?.toLowerCase().includes(sourceSearch.toLowerCase()) ||
      art.databaseName?.toLowerCase().includes(sourceSearch.toLowerCase()) ||
      art.serverFqdn?.toLowerCase().includes(sourceSearch.toLowerCase());
    
    if (sourceTypeFilter === 'WAREHOUSE') {
      return matchesSearch && art.type?.toLowerCase().includes('warehouse');
    }
    if (sourceTypeFilter === 'LAKEHOUSE') {
      return matchesSearch && art.type?.toLowerCase().includes('lakehouse');
    }
    return matchesSearch;
  });

  return (
    <div className="space-y-6 flex-1 flex flex-col">
      <div>
        <h2 className="text-sm font-semibold text-[#242424]">
          Choose from existing Microsoft Fabric sources
        </h2>
        <p className="text-xs text-[#616161] mt-0.5">
          Select the Fabric Warehouse or Lakehouse where your ETL batch logging tables reside.
        </p>
      </div>

      {/* Search and Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#616161] absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search Lakehouses and Warehouses..."
            value={sourceSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-[#fafafa] border border-[#d1d1d1] rounded-md pl-9 pr-3 py-1.5 text-xs text-[#242424] focus:outline-none focus:border-[#117865] focus:bg-white transition"
          />
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto text-xs">
          <button
            type="button"
            onClick={() => onTypeFilterChange('ALL')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition ${
              sourceTypeFilter === 'ALL'
                ? 'bg-[#117865] text-white shadow-xs'
                : 'bg-[#f5f5f5] text-[#616161] hover:bg-[#edebe9]'
            }`}
          >
            All ({artifacts.length})
          </button>
          <button
            type="button"
            onClick={() => onTypeFilterChange('WAREHOUSE')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition ${
              sourceTypeFilter === 'WAREHOUSE'
                ? 'bg-[#117865] text-white shadow-xs'
                : 'bg-[#f5f5f5] text-[#616161] hover:bg-[#edebe9]'
            }`}
          >
            Warehouses ({artifacts.filter(a => a.type?.toLowerCase().includes('warehouse')).length})
          </button>
          <button
            type="button"
            onClick={() => onTypeFilterChange('LAKEHOUSE')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition ${
              sourceTypeFilter === 'LAKEHOUSE'
                ? 'bg-[#117865] text-white shadow-xs'
                : 'bg-[#f5f5f5] text-[#616161] hover:bg-[#edebe9]'
            }`}
          >
            Lakehouses ({artifacts.filter(a => a.type?.toLowerCase().includes('lakehouse')).length})
          </button>
        </div>
      </div>

      {/* Sources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 flex-1 content-start">
        {isLoadingArtifacts && (
          <div className="col-span-full p-12 text-center text-xs text-[#616161] flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 text-[#117865] animate-spin" />
            <span>Discovering Microsoft Fabric artifacts...</span>
          </div>
        )}

        {!isLoadingArtifacts && filteredArtifacts.length === 0 && (
          <div className="col-span-full p-12 text-center text-[#616161] bg-[#fafafa] rounded-lg border border-[#edebe9] text-xs">
            No artifacts matching filter. Ensure your Azure Service Principal has permissions on workspace SQL Endpoints.
          </div>
        )}

        {!isLoadingArtifacts && filteredArtifacts.map((art) => {
          const isSelected = art.id === selectedArtifactId;
          const isLakehouse = art.type?.toLowerCase().includes('lakehouse');

          return (
            <button
              key={art.id}
              type="button"
              onClick={() => onSelectArtifact(art.id)}
              className={`p-4 rounded-lg border text-left transition flex flex-col justify-between gap-3 relative ${
                isSelected
                  ? 'bg-[#e3f7ef]/50 border-[#117865] ring-2 ring-[#117865]/20 shadow-xs'
                  : 'bg-white border-[#edebe9] hover:border-[#d1d1d1] hover:bg-[#fafafa]'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-md shrink-0 ${
                  isLakehouse ? 'bg-[#fff4ce] text-[#8a660a]' : 'bg-[#e3f7ef] text-[#117865]'
                }`}>
                  <Database className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-xs text-[#242424] truncate">
                      {art.displayName}
                    </span>
                  </div>
                  <span className={`inline-block px-1.5 py-0.5 text-[9px] font-medium uppercase rounded mt-1 ${
                    isLakehouse ? 'bg-[#fff4ce] text-[#8a660a]' : 'bg-[#e3f7ef] text-[#117865]'
                  }`}>
                    {art.type}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-[#edebe9] w-full text-[10px] text-[#616161] space-y-0.5">
                <div className="truncate font-mono" title={art.serverFqdn}>
                  Endpoint: {art.serverFqdn || "Discovering..."}
                </div>
                <div className="flex items-center justify-between">
                  <span>Database: {art.databaseName || art.displayName}</span>
                  {isSelected && (
                    <span className="text-[#117865] font-semibold flex items-center gap-0.5">
                      <Check className="w-3 h-3 stroke-[3]" /> Selected
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
