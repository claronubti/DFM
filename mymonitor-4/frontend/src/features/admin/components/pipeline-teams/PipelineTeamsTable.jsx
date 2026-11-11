import React from 'react';
import { GitFork, RefreshCw, Edit3 } from 'lucide-react';

/**
 * PipelineTeamsTable Component
 * 
 * Renders the table of discovered pipelines along with their designated L1 Support Leads,
 * L2 Escalation Owners, SLA warning/breach durations, and edit assignment actions.
 *
 * @param {Object} props
 * @param {Array<Object>} props.pipelines - Filtered list of pipelines with assignments.
 * @param {Object|null} props.selectedWorkspace - Workspace details object.
 * @param {string} props.selectedWorkspaceId - Selected workspace ID.
 * @param {boolean} props.isLoading - Loading state for pipeline data.
 * @param {(pipeline: Object) => void} props.onEditPipeline - Callback when user clicks 'Assign' on a pipeline.
 * @returns {JSX.Element}
 */
export default function PipelineTeamsTable({
  pipelines = [],
  selectedWorkspace,
  selectedWorkspaceId,
  isLoading,
  onEditPipeline,
}) {
  return (
    <div className="bg-white border border-[#edebe9] rounded-lg shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-[#faf9f8] text-[#605e5c] font-semibold border-b border-[#edebe9]">
            <tr>
              <th className="py-3 px-4 font-semibold w-[26%]">Pipeline Name</th>
              <th className="py-3 px-4 font-semibold w-[14%]">Domain</th>
              <th className="py-3 px-4 font-semibold w-[24%]">L1 Support Lead</th>
              <th className="py-3 px-4 font-semibold w-[20%]">L2 Escalation Owner</th>
              <th className="py-3 px-4 font-semibold w-[10%]">SLA (Warning / Breach)</th>
              <th className="py-3 px-4 text-right font-semibold w-[6%]">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edebe9]">
            {!selectedWorkspaceId ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-[#605e5c]">
                  <div className="w-10 h-10 rounded-full bg-[#eff6fc] border border-[#d1d1d1] flex items-center justify-center mx-auto text-[#0f6cbd] mb-2">
                    <GitFork className="w-5 h-5" />
                  </div>
                  <div className="text-sm font-semibold text-[#242424]">No workspace selected</div>
                  <p className="text-xs text-[#605e5c] max-w-sm mx-auto mt-1">
                    Please select a workspace above to view its data pipelines and configure L1/L2 support teams and SLA thresholds.
                  </p>
                </td>
              </tr>
            ) : isLoading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-[#605e5c]">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-[#0f6cbd]" />
                    <span>Loading pipeline assignments...</span>
                  </div>
                </td>
              </tr>
            ) : pipelines.length > 0 ? (
              pipelines.map((p) => (
                <tr key={p.pipelineId} className="hover:bg-[#faf9f8] transition">
                  {/* Pipeline Name */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded bg-[#eff6fc] text-[#0f6cbd] border border-[#0f6cbd]/20 shrink-0">
                        <GitFork className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-semibold text-[#242424] truncate" title={p.pipelineName}>
                        {p.pipelineName}
                      </span>
                    </div>
                  </td>

                  {/* Domain */}
                  <td className="py-3 px-4">
                    {p.domain ? (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#eff6fc] text-[#0f6cbd] border border-[#0f6cbd]/20">
                        {p.domain}
                      </span>
                    ) : (
                      <span className="text-[#a19f9d] italic">—</span>
                    )}
                  </td>

                  {/* L1 Support Person */}
                  <td className="py-3 px-4">
                    {p.l1Email ? (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#0f6cbd] text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                          {p.l1Name ? p.l1Name.slice(0, 2).toUpperCase() : 'L1'}
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-[#242424] block truncate">
                            {p.l1Name || p.l1Email}
                          </span>
                          {p.l1Name && (
                            <span className="text-[11px] text-[#605e5c] font-mono block truncate">
                              {p.l1Email}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[#a19f9d] italic">Unassigned</span>
                    )}
                  </td>

                  {/* L2 Escalation Person */}
                  <td className="py-3 px-4">
                    {p.l2Email ? (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#c45500] text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                          {p.l2Name ? p.l2Name.slice(0, 2).toUpperCase() : 'L2'}
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-[#242424] block truncate">
                            {p.l2Name || p.l2Email}
                          </span>
                          {p.l2Name && (
                            <span className="text-[11px] text-[#605e5c] font-mono block truncate">
                              {p.l2Email}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[#a19f9d] italic">Unassigned</span>
                    )}
                  </td>

                  {/* SLA Thresholds */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <span className="px-1.5 py-0.5 rounded bg-[#eff6fc] text-[#0f6cbd] border border-[#0f6cbd]/20" title="SLA1 Warning threshold">
                        {p.sla1Minutes || p.slaMinutes || 30}m
                      </span>
                      <span className="text-[#a19f9d]">/</span>
                      <span className="px-1.5 py-0.5 rounded bg-[#fdf3e7] text-[#c45500] border border-[#c45500]/20" title="SLA2 Breach threshold">
                        {p.sla2Minutes || (p.slaMinutes ? p.slaMinutes * 2 : 60)}m
                      </span>
                    </div>
                  </td>

                  {/* Action */}
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onEditPipeline(p)}
                      className="px-2.5 py-1 rounded text-xs font-semibold text-[#0f6cbd] hover:bg-[#eff6fc] border border-transparent hover:border-[#0f6cbd]/30 transition inline-flex items-center gap-1"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Assign</span>
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-12 text-center text-[#605e5c]">
                  No pipelines found in {selectedWorkspace?.displayName || 'selected workspace'}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
