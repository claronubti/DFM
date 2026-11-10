import React from 'react';
import { Search, RefreshCw, Database } from 'lucide-react';
import WorkspaceSelector from '../../../../components/shared/WorkspaceSelector';

/**
 * PipelineTeamsFilterBar Component
 * 
 * Provides top controls for the Pipeline Teams administration view:
 * - Workspace dropdown selector
 * - Fabric live sync and refresh action
 * - Quick jump button to Lakehouse/Warehouse Table Log Configuration
 * - Search filter input by pipeline name or personnel
 *
 * @param {Object} props
 * @param {Array<Object>} props.workspaces - List of available Fabric workspaces.
 * @param {string} props.selectedWorkspaceId - Currently active workspace ID.
 * @param {(id: string) => void} props.onSelectWorkspace - Callback when active workspace changes.
 * @param {boolean} props.isLoading - Whether pipeline assignments are loading/refreshing.
 * @param {() => void} props.onRefresh - Callback to sync/refresh pipelines from Fabric.
 * @param {((wsId: string) => void)|undefined} [props.onOpenTableConfig] - Optional callback to jump to table log config.
 * @param {string} props.searchTerm - Search filter text.
 * @param {(term: string) => void} props.onSearchChange - Callback when search text changes.
 * @param {number} props.pipelineCount - Total matching pipelines count.
 * @returns {JSX.Element}
 */
export default function PipelineTeamsFilterBar({
  workspaces = [],
  selectedWorkspaceId,
  onSelectWorkspace,
  isLoading,
  onRefresh,
  onOpenTableConfig,
  searchTerm,
  onSearchChange,
  pipelineCount,
}) {
  return (
    <div className="bg-white border border-[#edebe9] rounded-lg p-5 shadow-xs space-y-4">
      {/* Title & Top Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[#242424]">
              Pipeline L1 / L2 Team &amp; SLA Assignments
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#eff6fc] text-[#0f6cbd] border border-[#0f6cbd]/20">
              Admin Scope
            </span>
          </div>
          <p className="text-xs text-[#605e5c] mt-0.5">
            Select any workspace to configure and manage dedicated L1 Support and L2 Escalation personnel for individual pipelines.
          </p>
        </div>

        {/* Workspace Switcher & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#605e5c]">Workspace:</span>
          <WorkspaceSelector
            currentWorkspaceId={selectedWorkspaceId}
            onSelectWorkspace={onSelectWorkspace}
            workspaces={workspaces}
            align="right"
          />

          <button
            type="button"
            onClick={onRefresh}
            title="Refresh and sync pipelines from Microsoft Fabric"
            className="p-1.5 rounded bg-white hover:bg-[#f3f2f1] border border-[#d1d1d1] text-[#605e5c] hover:text-[#242424] transition shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#0f6cbd]' : ''}`} />
          </button>

          {/* Table Log Config Shortcut */}
          {onOpenTableConfig && selectedWorkspaceId && (
            <button
              type="button"
              onClick={() => onOpenTableConfig(selectedWorkspaceId)}
              title="Configure Lakehouse / Warehouse table logging for this workspace"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#f3f2f1] hover:bg-[#edebe9] border border-[#d1d1d1] text-[#242424] hover:text-[#008272] transition text-xs font-semibold shadow-xs"
            >
              <Database className="w-3.5 h-3.5 text-[#008272]" />
              <span>Table Log Config</span>
            </button>
          )}
        </div>
      </div>

      {/* Search Bar and Pipeline Count */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div className="relative max-w-md w-full">
          <Search className="w-3.5 h-3.5 text-[#797775] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter pipelines or assigned personnel..."
            className="w-full bg-[#fafafa] border border-[#d1d1d1] rounded pl-9 pr-3 py-1.5 text-xs text-[#242424] focus:outline-none focus:border-[#0f6cbd] focus:bg-white transition"
          />
        </div>
        <div className="text-xs font-semibold text-[#605e5c] shrink-0">
          Showing {pipelineCount} {pipelineCount === 1 ? 'pipeline' : 'pipelines'}
        </div>
      </div>
    </div>
  );
}
