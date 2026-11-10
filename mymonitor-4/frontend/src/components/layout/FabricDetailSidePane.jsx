/**
 * FabricDetailSidePane Component
 * 
 * Provides an administrative slide-over detail pane for pipeline and activity telemetry:
 * - Overview Tab: Status summary, execution timestamps, duration, SLA countdown, and quick links.
 * - Diagnostics & AI Fix Tab: Azure OpenAI failure analysis, root cause, fix checklist, and raw traces.
 *
 * @param {Object} props
 * @param {Object|null} props.item - Currently inspected pipeline or activity execution record.
 * @param {boolean} props.isOpen - Whether the slide-over pane is open.
 * @param {() => void} props.onClose - Callback to close pane.
 * @param {((item: Object) => void)|undefined} [props.onOpenRunHistory] - Callback to view run history.
 * @param {((item: Object) => void)|undefined} [props.onOpenSchedule] - Callback to view recurrence schedules.
 * @param {((item: Object) => void)|undefined} [props.onOpenSlaConfig] - Callback to configure SLA thresholds.
 * @param {((item: Object) => void)|undefined} [props.onOpenTableLogs] - Callback to view table logs.
 * @param {() => void} props.onResolveIncident - Callback to resolve SLA incident.
 * @returns {JSX.Element|null}
 */

import React, { useState, useEffect } from 'react';
import { 
  X, 
  AlertTriangle 
} from 'lucide-react';
import { getActivityIcon, computeDuration } from '../../features/monitoring/utils/formatters';
import SidePaneOverviewTab from './side-pane/SidePaneOverviewTab';
import SidePaneDiagnosticsTab from './side-pane/SidePaneDiagnosticsTab';


export default function FabricDetailSidePane({ 
  item, 
  isOpen, 
  onClose,
  onOpenRunHistory,
  onOpenSchedule,
  onOpenSlaConfig,
  onOpenTableLogs,
  onResolveIncident,
  userRole
}) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'diagnostics'
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedFixGuide, setCopiedFixGuide] = useState(false);

  // Live SLA & Assignee Config State
  const [slaData, setSlaData] = useState(item?.slaConfig || null);

  useEffect(() => {
    setSlaData(item?.slaConfig || null);
    const wsId = item?.workspaceId;
    const pid = item?.pipelineId || (item?.activityType === 'Pipeline' ? item?.id : null);
    if (wsId && pid && !pid.startsWith('norun-')) {
      fetch(`/api/workspaces/${wsId}/pipelines/${pid}/sla`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) {
            setSlaData(prev => ({ ...prev, ...data }));
          }
        })
        .catch(() => {});
    }
  }, [item]);

  // AI State
  const [aiData, setAiData] = useState(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [aiError, setAiError] = useState(null);

  const isFailed = item?.status?.toLowerCase() === 'failed';

  useEffect(() => {
    if (item) {
      if (item.status?.toLowerCase() === 'failed') {
        setActiveTab('diagnostics');
      } else {
        setActiveTab('overview');
      }
      setAiData(null);
      setAiError(null);
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const errorObj = item.error || {};
  const errorCode = errorObj.errorCode || (typeof errorObj === 'string' ? 'Error' : 'UserError');
  const errorMessage = errorObj.message || (typeof errorObj === 'string' ? errorObj : 'An execution error occurred.');
  const failureType = errorObj.failureType || 'ExecutionFailure';
  const target = errorObj.target || item.activityName || item.pipelineName;

  const duration = computeDuration(item);
  const startTime = item.startTime || item.activityRunStart;
  const endTime = item.endTime || item.activityRunEnd;

  const fullDiagnosticsJson = JSON.stringify({
    name: item.pipelineName || item.activityName,
    type: item.activityType || 'Pipeline',
    status: item.status,
    startTime: startTime,
    endTime: endTime,
    durationInMs: duration,
    error: item.error,
    output: item.output || errorObj.rawError
  }, null, 2);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(fullDiagnosticsJson);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleCopyScript = (script) => {
    navigator.clipboard.writeText(script);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const handleCopyFixGuide = () => {
    if (!aiData) return;
    const lines = [
      `*Microsoft Fabric AI Diagnosis: ${item.activityName || item.pipelineName}*`,
      `Root Cause: ${aiData.rootCause}`,
      '',
      `Likely Causes:`,
      ...(aiData.likelyCauses || []).map(c => `- ${c}`),
      '',
      `Fix Steps:`,
      ...(aiData.fixSteps || []).map((s, idx) => `${idx + 1}. ${s}`),
      '',
      aiData.fixScript ? `Fix Script:\n${aiData.fixScript}\n` : '',
      `Prevention Tip: ${aiData.preventionTip || 'N/A'}`
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(lines);
    setCopiedFixGuide(true);
    setTimeout(() => setCopiedFixGuide(false), 2000);
  };

  const fetchAiDiagnosis = async (forceRefresh = false) => {
    setIsLoadingAi(true);
    setAiError(null);
    try {
      const res = await fetch('/api/diagnostics/ai-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipelineName: item.pipelineName || 'Pipeline',
          activityName: item.activityName || item.pipelineName,
          activityType: item.activityType || 'Pipeline',
          errorCode: errorCode,
          errorMessage: errorMessage,
          failureType: failureType,
          target: target,
          rawError: item.output || item.error,
          forceRefresh: forceRefresh
        })
      });

      if (res.ok) {
        const json = await res.json();
        setAiData(json);
      } else {
        const errJson = await res.json().catch(() => ({ detail: 'Failed to contact AI service' }));
        setAiError(errJson.detail || 'Could not retrieve AI diagnostic.');
      }
    } catch (err) {
      console.error('AI diagnosis error:', err);
      setAiError('Network error while connecting to AI diagnostic service.');
    } finally {
      setIsLoadingAi(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 overflow-hidden select-none">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Pane Content */}
      <div className="fixed inset-y-0 right-0 z-40 w-full max-w-xl bg-[#ffffff] border-l border-[#edebe9] shadow-2xl flex flex-col select-none animate-in slide-in-from-right duration-200">
        {/* Pane Header */}
      <div className="px-4 py-3.5 border-b border-[#edebe9] bg-[#faf9f8] flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded bg-[#eff6fc] border border-[#d1d1d1] shrink-0 text-[#0f6cbd]">
            {getActivityIcon(item.activityType || 'Pipeline')}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[#242424] truncate">
              {item.pipelineName || item.activityName}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-[#605e5c] font-mono">
                {item.activityType || 'Pipeline'}
              </span>
              {item.id && !item.id.startsWith('norun-') && (
                <span className="text-[10px] text-[#797775] font-mono">
                  #{item.id.slice(0, 8)}
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          title="Close pane"
          className="p-1.5 rounded text-[#605e5c] hover:text-[#242424] hover:bg-[#f3f2f1] transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Fluent Pivot Tabs */}
      <div className="flex items-center px-4 border-b border-[#edebe9] bg-[#ffffff] text-xs font-medium space-x-4">
        <button
          onClick={() => setActiveTab('overview')}
          className={`py-2.5 border-b-2 transition ${
            activeTab === 'overview'
              ? 'border-[#0f6cbd] text-[#0f6cbd] font-semibold'
              : 'border-transparent text-[#605e5c] hover:text-[#242424]'
          }`}
        >
          Overview
        </button>

        {isFailed && (
          <button
            data-tour="error-diagnostics"
            onClick={() => setActiveTab('diagnostics')}
            className={`py-2.5 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'diagnostics'
                ? 'border-[#c42b1c] text-[#c42b1c] font-semibold'
                : 'border-transparent text-[#605e5c] hover:text-[#242424]'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-[#c42b1c]" />
            <span>Diagnostics & AI Fix</span>
          </button>
        )}
      </div>

      {/* Pane Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {activeTab === 'overview' && (
          <SidePaneOverviewTab
            item={item}
            isFailed={isFailed}
            duration={duration}
            startTime={startTime}
            endTime={endTime}
            slaData={slaData}
            onSwitchToDiagnostics={() => setActiveTab('diagnostics')}
            onOpenRunHistory={onOpenRunHistory}
            onOpenSchedule={onOpenSchedule}
            onOpenSlaConfig={onOpenSlaConfig}
            onOpenTableLogs={onOpenTableLogs}
            onResolveIncident={onResolveIncident}
            userRole={userRole}
          />
        )}

        {activeTab === 'diagnostics' && (
          <SidePaneDiagnosticsTab
            errorCode={errorCode}
            errorMessage={errorMessage}
            aiData={aiData}
            isLoadingAi={isLoadingAi}
            aiError={aiError}
            copiedFixGuide={copiedFixGuide}
            copiedScript={copiedScript}
            copiedJson={copiedJson}
            fullDiagnosticsJson={fullDiagnosticsJson}
            onFetchAiDiagnosis={fetchAiDiagnosis}
            onCopyFixGuide={handleCopyFixGuide}
            onCopyScript={handleCopyScript}
            onCopyJson={handleCopyJson}
          />
        )}
      </div>

      {/* Pane Footer */}
      <div className="p-3 border-t border-[#edebe9] bg-[#faf9f8] flex items-center justify-between">
        <div className="text-[10px] text-[#797775] font-mono">
          Microsoft Fabric Real-Time Diagnostics
        </div>
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded bg-[#ffffff] hover:bg-[#f3f2f1] border border-[#d1d1d1] text-[#323130] text-xs font-medium transition shadow-sm"
        >
          Close
        </button>
      </div>
    </div>
    </div>
  );
}
