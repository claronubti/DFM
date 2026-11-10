import React from 'react';
import {
  AlertTriangle,
  RefreshCw,
  Check,
  Copy,
  HelpCircle,
  Wrench,
  Code,
  ShieldCheck,
  Terminal,
  Sparkles
} from 'lucide-react';

/**
 * Official Azure OpenAI / OpenAI swirl logo component.
 */
function AzureOpenAIIcon({ className = "w-4 h-4" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1683a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4947zm-9.66-4.504a4.4707 4.4707 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1402-2.025zm-1.741-9.4893a4.4755 4.4755 0 0 1 2.3418-1.9729V12.49a.7948.7948 0 0 0 .388.6814l5.8428 3.3685-2.02 1.1683a.071.071 0 0 1-.0662 0l-4.8398-2.796a4.4945 4.4945 0 0 1-1.6466-5.4674zm15.4265 2.1813l-5.8428-3.3685 2.02-1.1683a.071.071 0 0 1 .0662 0l4.8398 2.796a4.4945 4.4945 0 0 1-.7427 8.0838v-5.6599a.7948.7948 0 0 0-.3405-.6831zm2.3418-4.1065a4.4707 4.4707 0 0 1 .5346 3.0137l-.142-.0852-4.783-2.7582a.7712.7712 0 0 0-.7806 0L5.342 9.043v-2.3324a.0804.0804 0 0 1 .0332-.0615L10.26 3.84a4.4992 4.4992 0 0 1 6.1402 2.025zM12.008 13.565l-2.6563-1.5332 2.6563-1.5332 2.6563 1.5332-2.6563 1.5332z" />
    </svg>
  );
}

/**
 * SidePaneDiagnosticsTab Component
 * 
 * Renders the Failure Diagnostics & AI Fix tab within the FabricDetailSidePane:
 * - Execution failure banner with error code and raw message
 * - Azure OpenAI automated root cause analysis, fix checklist, remediation script, and prevention tips
 * - Copyable raw execution diagnostics JSON viewer
 *
 * @param {Object} props
 * @param {string} props.errorCode - Extracted failure error code.
 * @param {string} props.errorMessage - Formatted error message text.
 * @param {Object|null} props.aiData - AI diagnosis result payload.
 * @param {boolean} props.isLoadingAi - Whether AI diagnosis request is currently executing.
 * @param {string|null} props.aiError - Error message from AI diagnosis call if failed.
 * @param {boolean} props.copiedFixGuide - Feedback indicator for copying the fix guide.
 * @param {boolean} props.copiedScript - Feedback indicator for copying the remediation script.
 * @param {boolean} props.copiedJson - Feedback indicator for copying the raw diagnostics JSON.
 * @param {string} props.fullDiagnosticsJson - Formatted JSON string of full execution trace.
 * @param {(forceRefresh: boolean) => void} props.onFetchAiDiagnosis - Callback to trigger AI analysis.
 * @param {() => void} props.onCopyFixGuide - Callback to copy fix checklist.
 * @param {(script: string) => void} props.onCopyScript - Callback to copy remediation script.
 * @param {() => void} props.onCopyJson - Callback to copy JSON trace.
 * @returns {JSX.Element}
 */
export default function SidePaneDiagnosticsTab({
  errorCode,
  errorMessage,
  aiData,
  isLoadingAi,
  aiError,
  copiedFixGuide,
  copiedScript,
  copiedJson,
  fullDiagnosticsJson,
  onFetchAiDiagnosis,
  onCopyFixGuide,
  onCopyScript,
  onCopyJson,
}) {
  return (
    <div className="space-y-4">
      {/* Error Banner */}
      <div className="p-3.5 rounded bg-[#fde7e9] border border-[#f4b4b9] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#c42b1c] flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Execution Failure
          </span>
          <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-[#ffffff] text-[#c42b1c] border border-[#f4b4b9]">
            {errorCode}
          </span>
        </div>
        <p className="text-[#323130] text-xs font-mono select-text leading-relaxed">
          {errorMessage}
        </p>
      </div>

      {/* AI Assistant Section */}
      <div className="rounded-md border border-[#c7e0f4] bg-[#f8fbff] p-4 space-y-3.5 shadow-xs">
        <div className="flex items-center justify-between pb-2 border-b border-[#c7e0f4]/60">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gradient-to-r from-[#eff6fc] via-[#f3e8ff] to-[#eff6fc] border border-[#c7e0f4] text-[#773adc] text-[10px] font-semibold w-fit">
              <Sparkles className="w-3 h-3 text-[#773adc]" />
              <span>Microsoft Fabric Copilot</span>
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <h3 className="text-xs font-bold text-[#242424] flex items-center gap-1.5">
                Azure OpenAI diagnostics
                {aiData?.cached && (
                  <span className="px-1.5 py-0.2 text-[9px] font-mono rounded bg-[#dff6dd] text-[#107c41] border border-[#107c41]/30">
                    ⚡ Instant cached
                  </span>
                )}
              </h3>
            </div>
            <p className="text-[11px] text-[#605e5c]">Automated root cause &amp; fix checklist</p>
          </div>

          {!aiData && !isLoadingAi && (
            <button
              type="button"
              onClick={() => onFetchAiDiagnosis(false)}
              className="px-3 py-1.5 rounded bg-[#0f6cbd] hover:bg-[#115ea3] text-white font-medium text-xs transition flex items-center gap-1.5 shadow-sm"
            >
              <AzureOpenAIIcon className="w-3.5 h-3.5" />
              <span>Analyze &amp; Fix</span>
            </button>
          )}

          {aiData && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onCopyFixGuide}
                title="Copy fix checklist"
                className="px-2 py-1 rounded bg-[#ffffff] hover:bg-[#f3f2f1] text-[#323130] text-[11px] border border-[#d1d1d1] transition flex items-center gap-1"
              >
                {copiedFixGuide ? <Check className="w-3 h-3 text-[#107c41]" /> : <Copy className="w-3 h-3" />}
                <span>{copiedFixGuide ? 'Copied' : 'Copy Guide'}</span>
              </button>
              <button
                type="button"
                onClick={() => onFetchAiDiagnosis(true)}
                title="Re-run AI analysis"
                className="p-1 rounded text-[#605e5c] hover:text-[#242424] hover:bg-[#ffffff] border border-transparent hover:border-[#d1d1d1]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAi ? 'animate-spin text-[#0f6cbd]' : ''}`} />
              </button>
            </div>
          )}
        </div>

        {/* AI Loading */}
        {isLoadingAi && (
          <div className="py-8 text-center space-y-2">
            <RefreshCw className="w-6 h-6 text-[#0f6cbd] animate-spin mx-auto" />
            <div className="text-xs text-[#242424] font-medium">
              Analyzing activity failure context...
            </div>
            <div className="text-[11px] text-[#605e5c]">
              Formulating probable causes and actionable steps
            </div>
          </div>
        )}

        {/* AI Error */}
        {aiError && (
          <div className="p-2.5 rounded bg-[#fde7e9] border border-[#f4b4b9] text-[#c42b1c] text-xs">
            {aiError}
          </div>
        )}

        {/* AI Prompt state */}
        {!aiData && !isLoadingAi && !aiError && (
          <div className="py-4 text-center text-xs text-[#605e5c] space-y-1">
            <p>Click <strong>Analyze &amp; Fix</strong> to generate instant root cause diagnostics and step-by-step remediation commands.</p>
          </div>
        )}

        {/* AI Result View */}
        {aiData && !isLoadingAi && (
          <div className="space-y-3 pt-1">
            {/* Root Cause */}
            <div className="p-3 rounded bg-[#ffffff] border border-[#c7e0f4] space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#0f6cbd] flex items-center gap-1">
                <HelpCircle className="w-3 h-3" />
                Root Cause
              </span>
              <p className="text-[#242424] text-xs leading-relaxed">
                {aiData.rootCause}
              </p>
            </div>

            {/* Fix Steps */}
            {aiData.fixSteps && aiData.fixSteps.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-[#242424] flex items-center gap-1">
                  <Wrench className="w-3.5 h-3.5 text-[#008272]" />
                  Resolution Checklist:
                </span>
                <div className="space-y-1">
                  {aiData.fixSteps.map((step, idx) => (
                    <div key={idx} className="p-2 rounded bg-[#ffffff] border border-[#edebe9] flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-[#eff6fc] text-[#0f6cbd] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="text-[#323130] text-xs leading-relaxed">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fix Script */}
            {aiData.fixScript && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#107c41] flex items-center gap-1">
                    <Code className="w-3.5 h-3.5" />
                    Remediation Script:
                  </span>
                  <button
                    type="button"
                    onClick={() => onCopyScript(aiData.fixScript)}
                    className="text-[11px] text-[#605e5c] hover:text-[#242424] flex items-center gap-1"
                  >
                    {copiedScript ? <Check className="w-3 h-3 text-[#107c41]" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedScript ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="p-2.5 rounded bg-[#f8f8f7] border border-[#edebe9] font-mono text-[11px] text-[#107c41] overflow-x-auto select-text leading-relaxed">
                  {aiData.fixScript}
                </pre>
              </div>
            )}

            {/* Prevention Tip */}
            {aiData.preventionTip && (
              <div className="p-2.5 rounded bg-[#ffffff] border border-[#edebe9] flex items-start gap-2 text-[11px] text-[#323130]">
                <ShieldCheck className="w-3.5 h-3.5 text-[#107c41] shrink-0 mt-0.5" />
                <span>{aiData.preventionTip}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Raw JSON Trace */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold text-[#605e5c] flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-[#605e5c]" />
            Raw Execution Diagnostics JSON
          </span>
          <button
            type="button"
            onClick={onCopyJson}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#ffffff] hover:bg-[#f3f2f1] text-[#323130] text-[11px] border border-[#d1d1d1] transition"
          >
            {copiedJson ? <Check className="w-3 h-3 text-[#107c41]" /> : <Copy className="w-3 h-3" />}
            <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
          </button>
        </div>
        <pre className="p-3 rounded bg-[#f8f8f7] border border-[#edebe9] text-[11px] font-mono text-[#242424] overflow-x-auto max-h-48 leading-relaxed select-text">
          {fullDiagnosticsJson}
        </pre>
      </div>
    </div>
  );
}
