/**
 * FabricCommandBar Component
 * 
 * Microsoft Fabric Native Command Bar:
 * - Seamless Fluent 2 toolbar styling (h: 44px)
 * - Refresh command action
 * - Time window dropdown menu with calendar presets & custom date picker
 * - Status filter dropdown menu
 * - Reset active filters action
 * - Live background sync progress indicator
 * - Fluent 2 keyword search input
 *
 * @param {Object} props
 * @param {string} props.search - Search term string.
 * @param {(val: string) => void} props.onSearchChange - Callback when search term changes.
 * @param {string} props.statusFilter - Active status filter key.
 * @param {(val: string) => void} props.onStatusFilterChange - Callback when status filter changes.
 * @param {Object} [props.dateFilter={}] - Active date filter settings.
 * @param {Object} [props.dateFilterInfo={}] - Server date filter metadata.
 * @param {(filter: Object) => void} props.onDateFilterChange - Callback when date filter changes.
 * @param {() => void} props.onRefresh - Refresh activities callback.
 * @param {boolean} props.isLoading - Whether manual refresh is active.
 * @param {boolean} props.isSyncing - Whether background sync is active.
 * @param {Object|null} props.syncProgress - Sync progress payload.
 * @param {boolean} [props.isInitialLoad=false] - Whether initial load is running.
 * @param {string|Date} [props.lastUpdated] - Last data sync timestamp.
 * @param {() => void} [props.onOpenTableLogConfig] - Open table logging config.
 * @returns {JSX.Element}
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  RefreshCw,
  Calendar,
  Filter,
  Search,
  ChevronDown,
  Check,
  RotateCcw,
  Sparkles,
  Loader2,
  X,
  Clock
} from 'lucide-react';

export default function FabricCommandBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  dateFilter = {},
  dateFilterInfo = {},
  onDateFilterChange,
  onRefresh,
  isLoading,
  isSyncing,
  syncProgress,
  isInitialLoad = false,
  lastUpdated,
  onOpenTableLogConfig
}) {
  const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const timeMenuRef = useRef(null);
  const statusMenuRef = useRef(null);

  const currentPreset = dateFilter?.preset || 'latest';
  const customDate = currentPreset === 'custom' ? dateFilter?.startDate : null;

  // Close menus on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (timeMenuRef.current && !timeMenuRef.current.contains(e.target)) {
        setIsTimeDropdownOpen(false);
      }
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target)) {
        setIsStatusDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const timePresets = [
    { id: 'latest', label: 'Latest runs' },
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'tomorrow', label: 'Tomorrow (Upcoming forecast)', isForecast: true },
    { id: 'last_week', label: 'Last 7 days' },
    { id: 'next_week', label: 'Next 7 days (Upcoming forecast)', isForecast: true }
  ];

  const statusOptions = [
    { id: 'ALL', label: 'All statuses' },
    { id: 'RUNNING', label: 'In progress' },
    { id: 'SUCCEEDED', label: 'Completed' },
    { id: 'FAILED', label: 'Failed' },
    { id: 'SLA_BREACHED', label: 'SLA breached' },
    { id: 'CANCELLED', label: 'Cancelled' },
    { id: 'NO_RUNS', label: 'Not run' },
    { id: 'SCHEDULED', label: 'Scheduled' },
    { id: 'NOT_SCHEDULED', label: 'Not scheduled' }
  ];

  const getTimeLabel = () => {
    if (currentPreset === 'custom') {
      return `Date: ${customDate || 'Custom'}`;
    }
    const found = timePresets.find(p => p.id === currentPreset);
    return found ? found.label : 'Time range';
  };

  const getStatusLabel = () => {
    const found = statusOptions.find(s => s.id === statusFilter);
    return found ? found.label : 'Status';
  };

  const hasActiveFilters = currentPreset !== 'latest' || statusFilter !== 'ALL' || Boolean(search);

  return (
    <div className="bg-[#ffffff] border border-[#edebe9] rounded-md px-3 py-2 flex flex-col md:flex-row md:items-center justify-between gap-2.5 select-none shadow-[0_1px_2px_rgba(0,0,0,0.02)] font-sans">
      {/* Left: Fluent Command Actions */}
      <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
        {/* Refresh Command */}
        <button
          onClick={onRefresh}
          title="Refresh activities from Fabric"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-[#242424] hover:bg-[#f3f2f1] active:bg-[#edebe9] transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-[#0f6cbd]" : "text-[#605e5c]"}`} />
          <span>Refresh</span>
        </button>

        <div className="h-4 w-[1px] bg-[#edebe9] mx-0.5"></div>

        {/* Time Window Dropdown */}
        <div className="relative" ref={timeMenuRef} data-tour="date-filter">
          <button
            onClick={() => setIsTimeDropdownOpen(!isTimeDropdownOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition border ${currentPreset !== 'latest'
                ? 'bg-[#eff6fc] border-[#0f6cbd]/30 text-[#0f6cbd]'
                : 'text-[#242424] hover:bg-[#f3f2f1] border-transparent'
              }`}
          >
            <Calendar className="w-3.5 h-3.5 text-[#605e5c]" />
            <span>{getTimeLabel()}</span>
            <ChevronDown className={`w-3 h-3 text-[#605e5c] transition-transform duration-150 ${isTimeDropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {isTimeDropdownOpen && (
            <div className="absolute left-0 mt-1 w-64 rounded-md bg-[#ffffff] border border-[#edebe9] shadow-xl z-50 overflow-hidden py-1 animate-in fade-in duration-100">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#605e5c] border-b border-[#edebe9] bg-[#faf9f8]">
                Execution time window
              </div>
              {timePresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    onDateFilterChange({ preset: preset.id, startDate: null, endDate: null });
                    setIsTimeDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition ${currentPreset === preset.id
                      ? 'bg-[#eff6fc] text-[#0f6cbd] font-semibold'
                      : 'text-[#323130] hover:bg-[#f3f2f1] hover:text-[#242424]'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    {preset.isForecast ? (
                      <Sparkles className="w-3.5 h-3.5 text-[#008272]" />
                    ) : (
                      <span className="w-3.5 h-3.5"></span>
                    )}
                    <span>{preset.label}</span>
                  </div>
                  {currentPreset === preset.id && <Check className="w-3.5 h-3.5 text-[#0f6cbd]" />}
                </button>
              ))}

              <div className="border-t border-[#edebe9] pt-2 mt-1 px-3 pb-2 bg-[#faf9f8]">
                <span className="text-[11px] text-[#605e5c] font-medium block mb-1">Specific calendar date:</span>
                <input
                  type="date"
                  value={customDate || ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) {
                      onDateFilterChange({ preset: 'custom', startDate: v, endDate: v });
                      setIsTimeDropdownOpen(false);
                    }
                  }}
                  className="w-full bg-[#ffffff] border border-[#d1d1d1] rounded px-2 py-1 text-xs text-[#242424] focus:outline-none focus:border-[#0f6cbd] cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Status Filter Dropdown */}
        <div className="relative" ref={statusMenuRef}>
          <button
            onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition border ${statusFilter !== 'ALL'
                ? 'bg-[#eff6fc] border-[#0f6cbd]/30 text-[#0f6cbd]'
                : 'text-[#242424] hover:bg-[#f3f2f1] border-transparent'
              }`}
          >
            <Filter className="w-3.5 h-3.5 text-[#605e5c]" />
            <span>{getStatusLabel()}</span>
            <ChevronDown className={`w-3 h-3 text-[#605e5c] transition-transform duration-150 ${isStatusDropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {isStatusDropdownOpen && (
            <div className="absolute left-0 mt-1 w-52 rounded-md bg-[#ffffff] border border-[#edebe9] shadow-xl z-50 overflow-hidden py-1 animate-in fade-in duration-100">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#605e5c] border-b border-[#edebe9] bg-[#faf9f8]">
                Filter by status
              </div>
              {statusOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    onStatusFilterChange(opt.id);
                    setIsStatusDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition ${statusFilter === opt.id
                      ? 'bg-[#eff6fc] text-[#0f6cbd] font-semibold'
                      : 'text-[#323130] hover:bg-[#f3f2f1] hover:text-[#242424]'
                    }`}
                >
                  <span>{opt.label}</span>
                  {statusFilter === opt.id && <Check className="w-3.5 h-3.5 text-[#0f6cbd]" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reset Filter Button if active */}
        {hasActiveFilters && (
          <button
            onClick={() => {
              onDateFilterChange({ preset: 'latest', startDate: null, endDate: null });
              onStatusFilterChange('ALL');
              onSearchChange('');
            }}
            title="Reset filters to default"
            className="flex items-center gap-1 px-2 py-1 text-xs rounded text-[#605e5c] hover:text-[#242424] hover:bg-[#f3f2f1] transition"
          >
            <RotateCcw className="w-3 h-3 text-[#0f6cbd]" />
            <span>Reset filters</span>
          </button>
        )}
      </div>

      {/* Right: Live Sync Progress + Keyword Search */}
      <div className="flex items-center gap-2.5 w-full md:w-auto">
        {/* Live Sync Progress Bar */}
        {Boolean(isInitialLoad && isSyncing && syncProgress && syncProgress.stage !== 'complete' && syncProgress.message) && (
          <div className="flex flex-col gap-1 px-2.5 py-1.5 rounded-md bg-[#eff6fc] border border-[#c7e0f4] text-[#0f6cbd] text-xs font-medium shadow-2xs whitespace-nowrap min-w-[220px] max-w-[340px]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 truncate">
                <Loader2 className="w-3 h-3 animate-spin text-[#0f6cbd] shrink-0" />
                <span className="truncate text-[11px] font-medium text-[#0f6cbd]">
                  {syncProgress.message}
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold text-[#0f6cbd] shrink-0">
                {Math.round(syncProgress.percent || 15)}%
              </span>
            </div>
            <div className="w-full bg-[#d0e6f9] h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-[#0f6cbd] h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.min(100, Math.max(10, syncProgress.percent || 15))}%` }}
              />
            </div>
          </div>
        )}

        {/* Table Keyword Search */}
        <div className="relative w-full md:w-60 flex items-center">
          <Search className="w-3.5 h-3.5 text-[#605e5c] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Filter activities..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-8 bg-[#ffffff] border border-[#d1d1d1] focus:border-[#0f6cbd] focus:ring-1 focus:ring-[#0f6cbd] text-xs text-[#242424] placeholder-[#797775] rounded-md pl-8 pr-7 transition focus:outline-none"
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              title="Clear filter"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#797775] hover:text-[#242424] p-1 rounded hover:bg-[#f3f2f1] transition"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
