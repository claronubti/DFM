import React from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  History, 
  Calendar, 
  Users, 
  Database 
} from 'lucide-react';
import SlaCountdownBadge from '../../../features/monitoring/components/badges/SlaCountdownBadge';
import { 
  formatDateTime, 
  formatDuration 
} from '../../../features/monitoring/utils/formatters';

/**
 * SidePaneOverviewTab Component
 * 
 * Renders the execution overview tab inside the FabricDetailSidePane:
 * - Status summary banner with duration and quick view error action
 * - Metadata properties list (item name, type, run ID, start/end timestamps, SLA assignees)
 * - Live SLA countdown badge
 * - Related workload jump actions (Run History, Schedules, SLA Config, Lakehouse Table Logs)
 *
 * @param {Object} props
 * @param {Object} props.item - Currently inspected pipeline or activity item.
 * @param {boolean} props.isFailed - Whether the execution failed.
 * @param {number} props.duration - Calculated execution duration in ms.
 * @param {string|null} props.startTime - Execution start timestamp.
 * @param {string|null} props.endTime - Execution end timestamp.
 * @param {Object|null} props.slaData - Live SLA and L1/L2 assignee configuration.
 * @param {() => void} props.onSwitchToDiagnostics - Callback to switch to the Diagnostics tab.
 * @param {((item: Object) => void)|undefined} [props.onOpenRunHistory] - Callback to open run history.
 * @param {((item: Object) => void)|undefined} [props.onOpenSchedule] - Callback to open schedule modal.
 * @param {((item: Object) => void)|undefined} [props.onOpenSlaConfig] - Callback to open SLA config modal.
 * @param {((item: Object) => void)|undefined} [props.onOpenTableLogs] - Callback to open table logs modal.
 * @param {() => void} props.onResolveIncident - Callback to resolve active SLA incident.
 * @returns {JSX.Element}
 */
export default function SidePaneOverviewTab({
  item,
  isFailed,
  duration,
  startTime,
  endTime,
  slaData,
  onSwitchToDiagnostics,
  onOpenRunHistory,
  onOpenSchedule,
  onOpenSlaConfig,
  onOpenTableLogs,
  onResolveIncident,
  userRole,
}) {
  return (
    <div className="space-y-4">
      {/* Status Summary Banner */}
      <div className={`p-3 rounded border flex items-center justify-between ${
        isFailed 
          ? 'bg-[#fde7e9] border-[#f4b4b9] text-[#c42b1c]'
          : item.status?.toLowerCase() === 'completed' || item.status?.toLowerCase() === 'succeeded'
          ? 'bg-[#dff6dd] border-[#107c41]/30 text-[#107c41]'
          : 'bg-[#faf9f8] border-[#edebe9] text-[#242424]'
      }`}>
        <div className="flex items-center gap-2">
          {isFailed ? (
            <XCircle className="w-4 h-4 text-[#c42b1c]" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-[#107c41]" />
          )}
          <div>
            <div className="font-semibold text-xs">
              Execution {item.status || 'Unknown'}
            </div>
            <div className="text-[11px] opacity-80 mt-0.5">
              Duration: {formatDuration(duration)}
            </div>
          </div>
        </div>

        {isFailed && (
          <button
            type="button"
            onClick={onSwitchToDiagnostics}
            className="px-2.5 py-1 rounded bg-[#c42b1c] hover:bg-[#a80000] text-white text-[11px] font-medium transition shadow-sm"
          >
            View Error
          </button>
        )}
      </div>

      {/* Properties List */}
      <div className="rounded border border-[#edebe9] bg-[#ffffff] overflow-hidden divide-y divide-[#edebe9] shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-[#605e5c]">Activity Name</span>
          <span className="text-[#242424] font-medium">{item.pipelineName || item.activityName}</span>
        </div>
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-[#605e5c]">Item Type</span>
          <span className="text-[#242424] font-mono">{item.activityType || 'Pipeline'}</span>
        </div>
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-[#605e5c]">Run ID</span>
          <span className="text-[#323130] font-mono text-[11px]">
            {item.id || item.activityRunId || 'N/A'}
          </span>
        </div>
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-[#605e5c]">Start Time</span>
          <span className="text-[#323130] font-mono text-[11px]">{formatDateTime(startTime)}</span>
        </div>
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-[#605e5c]">End Time</span>
          <span className="text-[#323130] font-mono text-[11px]">{formatDateTime(endTime)}</span>
        </div>
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-[#605e5c]">Duration</span>
          <span className="text-[#242424] font-mono font-medium">{formatDuration(duration)}</span>
        </div>

        {/* L1 Support Lead */}
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-[#605e5c] flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${slaData?.l1Email ? 'bg-[#0f6cbd]' : 'bg-[#a19f9d]'}`} />
            L1 Support Lead
          </span>
          {slaData?.l1Email ? (
            <div className="text-right">
              <span className="text-[#242424] font-semibold block">
                {slaData.l1Name || slaData.l1Email}
              </span>
              {slaData.l1Name && (
                <span className="text-[11px] text-[#605e5c] font-mono block">
                  {slaData.l1Email}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[#a19f9d] italic">Unassigned</span>
          )}
        </div>

        {/* L2 Escalation Owner */}
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-[#605e5c] flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${slaData?.l2Email ? 'bg-[#c45500]' : 'bg-[#a19f9d]'}`} />
            L2 Escalation Owner
          </span>
          {slaData?.l2Email ? (
            <div className="text-right">
              <span className="text-[#242424] font-semibold block">
                {slaData.l2Name || slaData.l2Email}
              </span>
              {slaData.l2Name && (
                <span className="text-[11px] text-[#605e5c] font-mono block">
                  {slaData.l2Email}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[#a19f9d] italic">Unassigned</span>
          )}
        </div>

        {/* SLA 1 (Warning) */}
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-[#605e5c] flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#0f6cbd]" />
            SLA 1 (Warning)
          </span>
          <span className="px-2 py-0.5 rounded bg-[#eff6fc] text-[#0f6cbd] border border-[#0f6cbd]/20 font-mono font-semibold">
            {slaData?.sla1Minutes || slaData?.slaMinutes || 30} minutes
          </span>
        </div>

        {/* SLA 2 (Breach) */}
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-[#605e5c] flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#c45500]" />
            SLA 2 (Breach)
          </span>
          <span className="px-2 py-0.5 rounded bg-[#fdf3e7] text-[#c45500] border border-[#c45500]/20 font-mono font-semibold">
            {slaData?.sla2Minutes || (slaData?.slaMinutes ? slaData.slaMinutes * 2 : 60)} minutes
          </span>
        </div>

        {/* Active SLA Incident Countdown / Status */}
        {(isFailed || item?.incident?.status === 'RESOLVED') && (item?.incident || slaData || item?.slaConfig) && (
          <div className="px-3 py-2 flex items-center justify-between bg-[#faf9f8] border-t border-[#edebe9]">
            <span className="text-[#605e5c] text-xs font-semibold">Live Incident SLA</span>
            <SlaCountdownBadge
              incident={item.incident}
              slaConfig={slaData || item.slaConfig}
              onResolve={onResolveIncident}
              pipeline={item}
              userRole={userRole}
            />
          </div>
        )}
      </div>

      {/* Direct Context Actions */}
      <div className="space-y-2 pt-2">
        <span className="text-[11px] font-semibold text-[#605e5c] uppercase tracking-wider block">
          Related Workload Actions
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {onOpenRunHistory && (
            <button
              type="button"
              onClick={() => onOpenRunHistory(item)}
              className="flex items-center gap-2 p-2.5 rounded bg-[#faf9f8] hover:bg-[#f3f2f1] border border-[#edebe9] text-[#242424] transition text-left"
            >
              <History className="w-4 h-4 text-[#0f6cbd]" />
              <div>
                <div className="font-medium text-xs text-[#242424]">Run History</div>
                <div className="text-[10px] text-[#605e5c]">Historical telemetry &amp; runs</div>
              </div>
            </button>
          )}

          {onOpenSchedule && (
            <button
              type="button"
              onClick={() => onOpenSchedule(item)}
              className="flex items-center gap-2 p-2.5 rounded bg-[#faf9f8] hover:bg-[#f3f2f1] border border-[#edebe9] text-[#242424] transition text-left"
            >
              <Calendar className="w-4 h-4 text-[#773adc]" />
              <div>
                <div className="font-medium text-xs text-[#242424]">Schedules</div>
                <div className="text-[10px] text-[#605e5c]">View recurrence rules</div>
              </div>
            </button>
          )}

          {onOpenSlaConfig && (
            <button
              type="button"
              onClick={() => onOpenSlaConfig(item)}
              className="flex items-center gap-2 p-2.5 rounded bg-[#faf9f8] hover:bg-[#f3f2f1] border border-[#edebe9] text-[#242424] transition text-left"
            >
              <Users className="w-4 h-4 text-[#0078d4]" />
              <div>
                <div className="font-medium text-xs text-[#242424]">Team &amp; SLA</div>
                <div className="text-[10px] text-[#605e5c]">L1/L2 assignees &amp; thresholds</div>
              </div>
            </button>
          )}

          {onOpenTableLogs && (
            <button
              type="button"
              onClick={() => onOpenTableLogs(item)}
              className="flex items-center gap-2 p-2.5 rounded bg-[#faf9f8] hover:bg-[#f3f2f1] border border-[#edebe9] text-[#242424] transition text-left"
            >
              <Database className="w-4 h-4 text-[#008272]" />
              <div>
                <div className="font-medium text-xs text-[#242424]">Lakehouse Logs</div>
                <div className="text-[10px] text-[#605e5c]">Bronze/Silver ingestion</div>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
