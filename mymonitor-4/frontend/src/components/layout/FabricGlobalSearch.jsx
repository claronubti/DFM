import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ChevronRight, Compass, LayoutGrid, Activity, Settings, CornerDownLeft, Sparkles } from 'lucide-react';

function getHighlightedSegments(text, query) {
  if (!query || !query.trim() || !text) {
    return [{ text: text || '', highlight: false }];
  }
  const q = query.trim().toLowerCase();
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) {
    return [{ text, highlight: false }];
  }
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length);
  const segments = [];
  if (before) segments.push({ text: before, highlight: false });
  segments.push({ text: match, highlight: true });
  if (after) segments.push({ text: after, highlight: false });
  return segments;
}

export default function FabricGlobalSearch({
  currentView,
  onSelectView,
  pipelines = [],
  onSelectPipeline,
  onStartTour,
  onRefresh,
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const flyoutRef = useRef(null);

  // Keyboard shortcut Ctrl+/ to focus
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        flyoutRef.current &&
        !flyoutRef.current.contains(e.target) &&
        inputRef.current &&
        !inputRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Built-in searchable catalog items
  const staticItems = useMemo(() => [
    {
      id: 'view-monitoring',
      title: 'Monitoring Hub',
      category: 'Workspaces & Views',
      description: 'Real-time pipeline monitoring, status cards, and live telemetry.',
      keywords: ['monitoring', 'hub', 'dashboard', 'status', 'kpi', 'live', 'telemetry'],
      type: 'view',
      viewKey: 'monitoring',
      icon: LayoutGrid
    },
    {
      id: 'view-admin',
      title: 'Admin Console',
      category: 'Workspaces & Views',
      description: 'User access management, role assignments, system health, and audit logs.',
      keywords: ['admin', 'users', 'roles', 'permissions', 'console', 'security', 'governance'],
      type: 'view',
      viewKey: 'admin',
      icon: Settings
    },
    {
      id: 'action-tour',
      title: 'Start Interactive Application Walkthrough',
      category: 'Guided Walkthrough',
      description: 'Launch the comprehensive guided onboarding tour covering all modules.',
      keywords: ['tour', 'walkthrough', 'help', 'guide', 'tutorial', 'onboarding', 'learn'],
      type: 'action',
      action: 'tour',
      icon: Compass
    },
    {
      id: 'action-refresh',
      title: 'Refresh Telemetry Data',
      category: 'Quick Actions',
      description: 'Force an instant polling sync with Microsoft Fabric API.',
      keywords: ['refresh', 'reload', 'sync', 'update', 'latest', 'poll'],
      type: 'action',
      action: 'refresh',
      icon: Activity
    },
    {
      id: 'feature-sla',
      title: 'SLA Tracking & Alerts',
      category: 'Platform Features',
      description: 'Set expected runtime duration limits and get warned when pipelines exceed SLAs.',
      keywords: ['sla', 'target', 'duration', 'alert', 'breach', 'threshold'],
      type: 'feature',
      viewKey: 'monitoring',
      icon: Activity
    }
  ], []);

  const allSearchableItems = useMemo(() => {
    const pipelineItems = (pipelines || []).map((pipe) => ({
      id: `pipe-${pipe.id || pipe.pipelineId}`,
      title: pipe.name || pipe.pipelineName || 'Pipeline',
      category: 'Pipelines & Data Assets',
      description: `Status: ${pipe.status || 'Active'} • Type: ${pipe.type || 'Data Pipeline'} • Last Run: ${pipe.lastRunTime || 'Recent'}`,
      keywords: [
        'pipeline',
        pipe.name || '',
        pipe.status || '',
        pipe.type || '',
        pipe.id || ''
      ].filter(Boolean),
      type: 'pipeline',
      item: pipe,
      icon: Activity
    }));

    return [...staticItems, ...pipelineItems];
  }, [staticItems, pipelines]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return staticItems.slice(0, 5);
    }
    return allSearchableItems
      .filter((item) => {
        const titleMatch = item.title?.toLowerCase().includes(q);
        const descMatch = item.description?.toLowerCase().includes(q);
        const keywordMatch = item.keywords?.some((k) => k.toLowerCase().includes(q));
        return titleMatch || descMatch || keywordMatch;
      })
      .sort((a, b) => {
        const aStarts = a.title?.toLowerCase().startsWith(q);
        const bStarts = b.title?.toLowerCase().startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        const aTitleInc = a.title?.toLowerCase().includes(q);
        const bTitleInc = b.title?.toLowerCase().includes(q);
        if (aTitleInc && !bTitleInc) return -1;
        if (!aTitleInc && bTitleInc) return 1;
        return 0;
      })
      .slice(0, 8);
  }, [allSearchableItems, query, staticItems]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchResults]);

  const handleSelectItem = (item) => {
    if (!item) return;

    if (item.type === 'view') {
      if (onSelectView) onSelectView(item.viewKey);
    } else if (item.type === 'action') {
      if (item.action === 'tour' && onStartTour) onStartTour();
      if (item.action === 'refresh' && onRefresh) onRefresh();
    } else if (item.type === 'pipeline') {
      if (onSelectPipeline) onSelectPipeline(item.item);
    } else if (item.type === 'feature') {
      if (onSelectView) onSelectView(item.viewKey);
    }

    setIsOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown') setIsOpen(true);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, searchResults.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + searchResults.length) % Math.max(1, searchResults.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults[selectedIndex]) {
        handleSelectItem(searchResults[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div className="relative w-full max-w-md lg:max-w-lg select-none font-['Segoe_UI']">
      {/* Search Input Box matching native Microsoft Fabric */}
      <div className="relative w-full flex items-center">
        <Search className="w-3.5 h-3.5 text-[#605e5c] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search Microsoft Fabric (Pipelines, runs, workspaces)"
          className="w-full h-8 bg-[#f3f2f1] hover:bg-[#edebe9] focus:bg-[#ffffff] border border-transparent focus:border-[#0f6cbd] focus:ring-1 focus:ring-[#0f6cbd] text-xs text-[#242424] placeholder-[#797775] rounded-md pl-8 pr-16 transition duration-150 focus:outline-none shadow-2xs"
          style={{ fontFamily: "'Segoe UI', sans-serif" }}
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            title="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#797775] hover:text-[#242424] p-1 rounded hover:bg-[#edebe9] transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#605e5c] font-mono border border-[#d1d1d1] rounded px-1.5 py-0.5 bg-[#ffffff] pointer-events-none shadow-2xs leading-none select-none flex items-center justify-center">
            Ctrl+/
          </span>
        )}
      </div>

      {/* Google-Style Instant Suggestions Flyout */}
      {isOpen && (
        <div
          ref={flyoutRef}
          className="absolute left-0 right-0 top-full mt-1.5 bg-[#ffffff] border border-[#edebe9] rounded-lg shadow-xl z-50 overflow-hidden py-1.5 transition-all duration-150 animate-in fade-in slide-in-from-top-1"
          style={{ fontFamily: "'Segoe UI', sans-serif" }}
        >
          <div className="px-3 py-1 flex items-center justify-between text-[11px] text-[#605e5c] border-b border-[#f3f2f1] mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px] text-[#605e5c]">
              {query ? 'Search Suggestions' : 'Recommended Quick Navigation'}
            </span>
            <span className="text-[10px] text-[#a19f9d] flex items-center gap-1">
              Navigate <CornerDownLeft className="w-2.5 h-2.5 inline" /> Select
            </span>
          </div>

          {searchResults.length === 0 ? (
            <div className="py-6 px-4 text-center">
              <Search className="w-6 h-6 text-[#a19f9d] mx-auto mb-2 opacity-50" />
              <div className="text-xs font-semibold text-[#242424]">No matching items found</div>
              <div className="text-[11px] text-[#605e5c] mt-0.5">
                Try searching for "monitoring", "pipeline", "sla", or "admin".
              </div>
            </div>
          ) : (
            <ul className="max-h-[340px] overflow-y-auto divide-y divide-[#f8f7f6]">
              {searchResults.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const IconComponent = item.icon || Activity;
                const titleSegments = getHighlightedSegments(item.title, query);

                return (
                  <li
                    key={item.id}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => handleSelectItem(item)}
                    className={`px-3 py-2 flex items-center gap-2.5 cursor-pointer transition-colors duration-100 ${
                      isSelected ? 'bg-[#f3f2f1] border-l-2 border-[#0f6cbd]' : 'hover:bg-[#faf9f8]'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-[#0f6cbd] text-white' : 'bg-[#f3f2f1] text-[#605e5c]'
                      }`}
                    >
                      <IconComponent className="w-3.5 h-3.5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-[#242424] font-medium truncate">
                          {titleSegments.map((seg, sIdx) =>
                            seg.highlight ? (
                              <mark
                                key={sIdx}
                                className="bg-[#fff1a8] text-[#242424] font-bold rounded-xs px-0.5"
                              >
                                {seg.text}
                              </mark>
                            ) : (
                              <span key={sIdx}>{seg.text}</span>
                            )
                          )}
                        </span>
                        <span className="text-[10px] text-[#605e5c] bg-[#edebe9] px-1.5 py-0.2 rounded-full shrink-0">
                          {item.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#605e5c] truncate mt-0.5">
                        {item.description}
                      </p>
                    </div>

                    <ChevronRight
                      className={`w-3.5 h-3.5 shrink-0 transition-opacity ${
                        isSelected ? 'opacity-100 text-[#0f6cbd]' : 'opacity-0'
                      }`}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-1 pt-1.5 border-t border-[#f3f2f1] px-3 py-1 bg-[#faf9f8] flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-[#0f6cbd]">
              <Sparkles className="w-3 h-3 text-[#0f6cbd]" />
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  if (onStartTour) onStartTour();
                }}
                className="font-medium hover:underline cursor-pointer"
              >
                New here? Take the interactive Fabric tour
              </button>
            </div>
            <span className="text-[10px] text-[#a19f9d]">ESC to dismiss</span>
          </div>
        </div>
      )}
    </div>
  );
}

