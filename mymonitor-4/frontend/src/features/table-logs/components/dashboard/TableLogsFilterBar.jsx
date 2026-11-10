import React from 'react';
import { Search } from 'lucide-react';

/**
 * TableLogsFilterBar provides toolbar filters for data layer, execution status, and text search.
 *
 * @param {Object} props
 * @param {string} props.layerFilter - Current layer filter ('All' | 'Silver' | 'Bronze').
 * @param {Function} props.onLayerFilterChange - (layer) => void.
 * @param {string} props.statusFilter - Current status filter ('All' | 'Success' | 'Failed').
 * @param {Function} props.onStatusFilterChange - (status) => void.
 * @param {string} props.searchTerm - Search keyword for table or schema.
 * @param {Function} props.onSearchChange - (val) => void.
 * @param {number} props.totalCount - Total table rows count.
 * @param {number} props.silverCount - Total Silver layer rows count.
 * @param {number} props.bronzeCount - Total Bronze layer rows count.
 */
export default function TableLogsFilterBar({
  layerFilter = 'All',
  onLayerFilterChange,
  statusFilter = 'All',
  onStatusFilterChange,
  searchTerm = '',
  onSearchChange,
  totalCount = 0,
  silverCount = 0,
  bronzeCount = 0
}) {
  return (
    <div className="bg-white border border-[#edebe9] rounded-lg p-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
      {/* Left: Layer & Status Filter Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Layer tabs */}
        <div className="flex items-center bg-[#f5f5f5] p-0.5 rounded border border-[#edebe9] text-xs">
          <button
            type="button"
            onClick={() => onLayerFilterChange('All')}
            className={`px-3 py-1 rounded text-xs font-medium transition cursor-pointer ${
              layerFilter === 'All'
                ? 'bg-white text-[#242424] shadow-xs font-semibold'
                : 'text-[#605e5c] hover:text-[#242424]'
            }`}
          >
            All Layers ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => onLayerFilterChange('Silver')}
            className={`px-3 py-1 rounded text-xs font-medium transition flex items-center gap-1 cursor-pointer ${
              layerFilter === 'Silver'
                ? 'bg-white text-[#0f6cbd] shadow-xs font-semibold'
                : 'text-[#605e5c] hover:text-[#242424]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#0f6cbd]" />
            <span>Silver (L2) ({silverCount})</span>
          </button>
          <button
            type="button"
            onClick={() => onLayerFilterChange('Bronze')}
            className={`px-3 py-1 rounded text-xs font-medium transition flex items-center gap-1 cursor-pointer ${
              layerFilter === 'Bronze'
                ? 'bg-white text-[#c19c00] shadow-xs font-semibold'
                : 'text-[#605e5c] hover:text-[#242424]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#c19c00]" />
            <span>Bronze (L1) ({bronzeCount})</span>
          </button>
        </div>

        {/* Status tabs */}
        <div className="flex items-center bg-[#f5f5f5] p-0.5 rounded border border-[#edebe9] text-xs">
          <button
            type="button"
            onClick={() => onStatusFilterChange('All')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
              statusFilter === 'All'
                ? 'bg-white text-[#242424] shadow-xs font-semibold'
                : 'text-[#605e5c] hover:text-[#242424]'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => onStatusFilterChange('Success')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
              statusFilter === 'Success'
                ? 'bg-white text-[#107c41] shadow-xs font-semibold'
                : 'text-[#605e5c] hover:text-[#242424]'
            }`}
          >
            Success
          </button>
          <button
            type="button"
            onClick={() => onStatusFilterChange('Failed')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
              statusFilter === 'Failed'
                ? 'bg-white text-[#a80000] shadow-xs font-semibold'
                : 'text-[#605e5c] hover:text-[#242424]'
            }`}
          >
            Failed
          </button>
        </div>
      </div>

      {/* Right: Search Input */}
      <div className="relative w-full sm:w-72">
        <Search className="w-3.5 h-3.5 text-[#797775] absolute left-3 top-2.5" />
        <input
          type="text"
          placeholder="Search table or schema..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full bg-[#fafafa] border border-[#d1d1d1] rounded pl-9 pr-3 py-1.5 text-xs text-[#242424] focus:outline-none focus:border-[#117865] focus:bg-white transition"
        />
      </div>
    </div>
  );
}
