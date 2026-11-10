import React from 'react';
import { Award, ArrowRight, RotateCcw, HelpCircle, CheckCircle2 } from 'lucide-react';

export default function TourSummaryModal({
  isOpen,
  onClose,
  onRestart
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4 bg-[#0f172a]/70 backdrop-blur-xs select-none font-['Segoe_UI'] animate-in fade-in duration-200">
      <div className="bg-[#ffffff] rounded-2xl shadow-2xl border border-[#edebe9] max-w-md w-full overflow-hidden text-center p-6 space-y-4">
        {/* Celebration Badge */}
        <div className="w-14 h-14 rounded-full bg-[#dff6dd] text-[#107c41] flex items-center justify-center mx-auto shadow-inner">
          <Award className="w-7 h-7" />
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-bold text-[#242424]">
            Walkthrough Completed!
          </h2>
          <p className="text-xs text-[#605e5c]">
            You've completed the full application walkthrough for Microsoft Fabric Monitoring Hub.
          </p>
        </div>

        {/* Takeaway Highlights */}
        <div className="bg-[#faf9f8] p-3.5 rounded-xl border border-[#edebe9] text-left space-y-2 text-xs text-[#323130]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#107c41] shrink-0" />
            <span>Real-time pipeline monitoring and live WebSocket sync</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#107c41] shrink-0" />
            <span>Automated schedules, duration tracking, and SLA alerts</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#107c41] shrink-0" />
            <span>Root-cause error diagnostics and one-click incident sign-off</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#107c41] shrink-0" />
            <span>Role-based team administration and quick global search</span>
          </div>
        </div>

        <p className="text-[11px] text-[#605e5c] flex items-center justify-center gap-1">
          <HelpCircle className="w-3 h-3 text-[#0f6cbd]" />
          <span>You can replay this walkthrough anytime from the top Help menu or by pressing <b>Ctrl+/</b></span>
        </p>

        {/* Modal Buttons */}
        <div className="pt-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onRestart}
            className="flex-1 h-8 rounded-md text-xs font-medium border border-[#d1d1d1] bg-white hover:bg-[#f3f2f1] text-[#242424] transition flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restart Tour</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-8 rounded-md text-xs font-semibold bg-[#0f6cbd] hover:bg-[#115ea3] text-white transition flex items-center justify-center gap-1.5 shadow-sm"
          >
            <span>Start Exploring</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

