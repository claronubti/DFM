import React from 'react';
import { Sparkles, ArrowRight, X, CheckCircle2 } from 'lucide-react';

export default function TourWelcomeModal({
  isOpen,
  onStart,
  onDismiss
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4 bg-[#0f172a]/70 backdrop-blur-xs select-none font-['Segoe_UI'] animate-in fade-in duration-200">
      <div className="bg-[#ffffff] rounded-2xl shadow-2xl border border-[#edebe9] max-w-lg w-full overflow-hidden">
        {/* Banner with Microsoft Fabric Diamond Theme */}
        <div className="bg-gradient-to-r from-[#0f6cbd] via-[#1177d7] to-[#00b7c3] p-6 text-white relative">
          <button
            type="button"
            onClick={onDismiss}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-1 rounded hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs uppercase font-bold tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full text-white">
              Application Walkthrough
            </span>
          </div>

          <h2 className="text-xl font-bold tracking-tight">
            Welcome to Microsoft Fabric Monitoring Hub
          </h2>
          <p className="text-xs text-white/90 mt-1 max-w-md leading-relaxed">
            Take a 2-minute interactive guided tour through the entire application from setup and configuration to live monitoring, diagnostics, and administration.
          </p>
        </div>

        {/* Walkthrough Scope Highlights */}
        <div className="p-6 space-y-3.5">
          <div className="text-xs font-semibold text-[#605e5c] uppercase tracking-wider">
            What you'll explore in this tour:
          </div>

          <div className="space-y-2 text-xs text-[#323130]">
            <div className="flex items-start gap-2.5 p-2 rounded-lg bg-[#faf9f8] border border-[#edebe9]">
              <CheckCircle2 className="w-4 h-4 text-[#107c41] shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-[#242424]">Navigation & Workspaces:</span> App launcher, workspace switching, and workload command navigation.
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2 rounded-lg bg-[#faf9f8] border border-[#edebe9]">
              <CheckCircle2 className="w-4 h-4 text-[#107c41] shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-[#242424]">Configuration & Deployment:</span> Automated pipeline schedules, SLA thresholds, and real-time live sync.
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2 rounded-lg bg-[#faf9f8] border border-[#edebe9]">
              <CheckCircle2 className="w-4 h-4 text-[#107c41] shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-[#242424]">Monitoring & Troubleshooting:</span> Health KPI cards, pipeline execution tree, side pane diagnostics, and incident sign-off.
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2 rounded-lg bg-[#faf9f8] border border-[#edebe9]">
              <CheckCircle2 className="w-4 h-4 text-[#107c41] shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-[#242424]">Governance & Search:</span> Role-based security console and quick global search.
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-4 bg-[#faf9f8] border-t border-[#edebe9] flex items-center justify-between">
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs font-medium text-[#605e5c] hover:text-[#242424] px-3 py-1.5 rounded hover:bg-[#edebe9] transition"
          >
            Explore on my own
          </button>

          <button
            type="button"
            onClick={onStart}
            className="h-8 px-4 rounded-md text-xs font-semibold bg-[#0f6cbd] hover:bg-[#115ea3] text-white transition flex items-center gap-1.5 shadow-sm"
          >
            <span>Start Guided Walkthrough</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

