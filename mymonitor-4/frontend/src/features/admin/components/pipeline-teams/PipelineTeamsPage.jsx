import React, { useState, useEffect, useMemo } from 'react';
import SlaConfigModal from '../../../../components/shared/SlaConfigModal';
import { listWorkspaces, getWorkspacePipelineAssignments } from '../../api/adminApi';
import PipelineTeamsFilterBar from './PipelineTeamsFilterBar';
import PipelineTeamsTable from './PipelineTeamsTable';

/**
 * PipelineTeamsPage Component
 * 
 * Provides an administrative management interface for configuring L1 support leads,
 * L2 escalation owners, and SLA warning/breach thresholds per pipeline in a selected workspace.
 *
 * @param {Object} props
 * @param {(workspaceId: string) => void} [props.onOpenTableConfig] - Optional callback to open Lakehouse/Warehouse table config.
 * @returns {JSX.Element}
 */
export default function PipelineTeamsPage({ onOpenTableConfig }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [pipelines, setPipelines] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingPipeline, setEditingPipeline] = useState(null);

  // 1. Fetch available workspaces
  useEffect(() => {
    async function loadWorkspaces() {
      try {
        const list = await listWorkspaces();
        if (Array.isArray(list)) {
          setWorkspaces(list);
        }
      } catch (err) {
        console.error('Failed to load workspaces:', err);
      }
    }
    loadWorkspaces();
  }, []);

  /**
   * Fetches pipeline assignments for the given workspace ID.
   *
   * @param {string} wsId - Fabric workspace ID.
   * @param {boolean} [forceSync=false] - Whether to bypass cache and sync directly from Fabric.
   */
  const fetchPipelineAssignments = async (wsId, forceSync = false) => {
    if (!wsId) return;
    setIsLoading(true);
    try {
      const data = await getWorkspacePipelineAssignments(wsId, forceSync);
      setPipelines(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load pipeline assignments:', err);
      setPipelines([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedWorkspaceId) {
      fetchPipelineAssignments(selectedWorkspaceId);
    }
  }, [selectedWorkspaceId]);

  const filteredPipelines = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return pipelines;
    return pipelines.filter((p) => (
      p.pipelineName?.toLowerCase().includes(q) ||
      p.domain?.toLowerCase().includes(q) ||
      p.l1Name?.toLowerCase().includes(q) ||
      p.l1Email?.toLowerCase().includes(q) ||
      p.l2Name?.toLowerCase().includes(q) ||
      p.l2Email?.toLowerCase().includes(q)
    ));
  }, [pipelines, searchTerm]);

  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#faf9f8] text-[#242424]">
      {/* Scrollable Content Area */}
      <div className="p-6 flex-1 min-h-0 overflow-y-auto space-y-4 font-sans select-none">
        {/* Top Filter & Control Bar */}
        <PipelineTeamsFilterBar
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          onSelectWorkspace={setSelectedWorkspaceId}
          isLoading={isLoading}
          onRefresh={() => fetchPipelineAssignments(selectedWorkspaceId, true)}
          onOpenTableConfig={onOpenTableConfig}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          pipelineCount={filteredPipelines.length}
        />

        {/* Grid of Pipelines */}
        <PipelineTeamsTable
          pipelines={filteredPipelines}
          selectedWorkspace={selectedWorkspace}
          selectedWorkspaceId={selectedWorkspaceId}
          isLoading={isLoading}
          onEditPipeline={setEditingPipeline}
        />

        {/* SLA & Team Assignment Modal */}
        {editingPipeline && (
          <SlaConfigModal
            workspaceId={selectedWorkspaceId}
            pipeline={editingPipeline}
            isOpen={!!editingPipeline}
            onClose={() => setEditingPipeline(null)}
            onSaved={() => {
              fetchPipelineAssignments(selectedWorkspaceId);
            }}
          />
        )}
      </div>
    </div>
  );
}
