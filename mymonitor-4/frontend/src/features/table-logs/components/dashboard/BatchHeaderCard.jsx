import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { formatTableLogDuration } from '../../utils/logFormatters';

/**
 * BatchHeaderCard renders the sub-strip for the currently selected active batch run,
 * showing pipeline title, batch ID badge, execution status badge, copyable RunId, and duration.
 *
 * @param {Object} props
 * @param {Object} props.currentBatchHeader - Batch header telemetry payload.
 * @param {Object} [props.pipeline] - Pipeline metadata object.
 * @param {string} [props.pipelineRunId] - Clean pipeline run ID string.
 */
export default function BatchHeaderCard({ 
  currentBatchHeader, 
  pipeline, 
  pipelineRunId 
}) {
  const [copied, setCopied] = useState(false);

  if (!currentBatchHeader) return null;

  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const status = currentBatchHeader.status || '';
  const statusLower = status.toLowerCase();
  const isSuccess = statusLower.includes('success') || statusLower.includes('completed');
  const isFailed = statusLower.includes('fail');

  const runId = pipelineRunId || currentBatchHeader.pipelineRunId;

  return (
    <div className="flex items-center gap-4 text-xs pt-2 border-t border-[#edebe9] flex-wrap">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-[#242424]">
          {currentBatchHeader.pipelineName || pipeline?.pipelineName || "Pipeline"}
        </span>
        {currentBatchHeader.batchId && (
          <span className="px-2 py-0.5 rounded bg-[#f3f2f1] text-[#323130] border border-[#e1dfdd] font-mono text-[11px] font-semibold">
            Batch #{currentBatchHeader.batchId}
          </span>
        )}
        {status && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${
            isSuccess
              ? 'bg-[#dff6dd] text-[#107c41] border-[#92c353]'
              : isFailed
              ? 'bg-[#fde7e9] text-[#a80000] border-[#f19999]'
              : 'bg-[#fff4ce] text-[#8a660a] border-[#fed9cc]'
          }`}>
            {status}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 text-[11px] text-[#605e5c] font-mono">
        {runId && (
          <button 
            type="button"
            onClick={() => copyToClipboard(runId)}
            title="Click to copy Pipeline Run ID"
            className="flex items-center gap-1 text-[#605e5c] hover:text-[#0f6cbd] transition cursor-pointer"
          >
            <span>RunId: {runId.slice(0, 20)}...</span>
            {copied ? <Check className="w-3 h-3 text-[#107c41]" /> : <Copy className="w-3 h-3 text-[#a19f9d]" />}
          </button>
        )}
        {currentBatchHeader.startTime && (
          <span>Started: {currentBatchHeader.startTime.slice(0, 19)}</span>
        )}
        {(currentBatchHeader.duration || currentBatchHeader.endTime) && (
          <span>
            Duration: {formatTableLogDuration(currentBatchHeader.duration, currentBatchHeader.startTime, currentBatchHeader.endTime)}
          </span>
        )}
      </div>
    </div>
  );
}
