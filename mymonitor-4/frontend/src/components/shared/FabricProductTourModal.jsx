import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  Activity,
  Database,
  Box,
  Layers,
  Sparkles
} from 'lucide-react';

const TOUR_STORAGE_KEY = 'fabric_monitoring_tour_completed';

const TOUR_STEPS = [
  {
    id: 'welcome',
    badge: 'Microsoft Fabric Workload',
    title: 'Welcome to Microsoft Fabric Monitoring',
    subtitle: 'Unified pipeline telemetry, activity tracing, and Lakehouse ingestion tracking designed for enterprise data teams.',
    icon: Activity,
    accentColor: '#0f6cbd',
    bullets: [
      'Built with the Fluent 2 design system for seamless Microsoft Fabric integration.',
      'Real-time WebSocket telemetry keeps your team updated with zero latency.',
      'Comprehensive monitoring for Data Factory pipelines and Lakehouse delta tables.'
    ],
    preview: (
      <div className="bg-[#f8fafd] border border-[#d0e2f7] rounded-lg p-3.5 space-y-2">
        <div className="flex items-center justify-between pb-2 border-b border-[#e1dfdd]">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none">
              <path d="M16 2.5 L29.5 16 L16 29.5 L2.5 16 Z" fill="#00A2ED" />
              <path d="M16 6.5 L25.5 16 L16 25.5 L6.5 16 Z" fill="#1177D7" />
            </svg>
            <span className="text-xs font-bold text-[#242424]">Microsoft Fabric</span>
            <span className="text-[#a19f9d]">|</span>
            <span className="text-xs text-[#0f6cbd] font-semibold">Monitoring hub</span>
          </div>
          <span className="text-[10px] bg-[#dff6dd] text-[#107c41] px-2 py-0.5 rounded-full font-semibold border border-[#107c41]/30">
            Live Connected
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="bg-white p-2 rounded border border-[#edebe9]">
            <span className="text-[10px] text-[#605e5c] block">Workload</span>
            <span className="font-semibold text-[#0f6cbd]">Data Factory</span>
          </div>
          <div className="bg-white p-2 rounded border border-[#edebe9]">
            <span className="text-[10px] text-[#605e5c] block">Capacity</span>
            <span className="font-semibold text-[#107c41]">Fabric F-SKU</span>
          </div>
          <div className="bg-white p-2 rounded border border-[#edebe9]">
            <span className="text-[10px] text-[#605e5c] block">Engine</span>
            <span className="font-semibold text-[#773adc]">Lakehouse Delta</span>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'workspaces',
    badge: 'Scope & Context',
    title: 'Workspace Switching & Scoping',
    subtitle: 'Inspect any Fabric workspace seamlessly from the top workspace picker without losing your telemetry context.',
    icon: Box,
    accentColor: '#0f6cbd',
    bullets: [
      'Search through all authorized Fabric workspaces instantly.',
      'Active workspace indicator reflects your Azure Active Directory scope.',
      'Live background polling synchronizes all pipelines as soon as you switch.'
    ],
    preview: (
      <div className="bg-[#f8fafd] border border-[#d0e2f7] rounded-lg p-3.5 space-y-2">
        <div className="flex items-center gap-2 text-xs text-[#605e5c]">
          <Box className="w-3.5 h-3.5 text-[#0f6cbd]" />
          <span>Workspaces</span>
          <ChevronRight className="w-3 h-3 text-[#a19f9d]" />
          <span className="font-semibold text-[#242424] bg-white px-2 py-0.5 rounded border border-[#d1d1d1]">
            Contoso Analytics Workspace
          </span>
        </div>
        <div className="bg-white p-2.5 rounded border border-[#edebe9] text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#107c41] animate-ping" />
            <span className="text-[#242424] font-medium">Telemetry Synced</span>
          </div>
          <span className="text-[11px] font-mono text-[#605e5c]">Ctrl+/ for global search</span>
        </div>
      </div>
    )
  },
  {
    id: 'metrics',
    badge: 'Executive Health',
    title: 'Interactive KPI Strip & Filters',
    subtitle: 'Filter pipelines in one click by execution status: Running, Completed, Failed, or SLA Breached.',
    icon: Layers,
    accentColor: '#107c41',
    bullets: [
      'Click any KPI card to instantly isolate pipeline runs of that state.',
      'Adaptive table height wraps snugly around filtered rows with zero dead space.',
      'SLA breached badge flags critical runs that require immediate team escalation.'
    ],
    preview: (
      <div className="bg-[#ffffff] border border-[#edebe9] rounded-lg p-3 space-y-2">
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="p-2 rounded bg-[#eff6fc] border border-[#0f6cbd] text-[#0f6cbd]">
            <span className="text-[10px] block">In progress</span>
            <span className="text-base font-bold font-mono">2</span>
          </div>
          <div className="p-2 rounded bg-[#f2faf3] border border-[#107c41] text-[#107c41]">
            <span className="text-[10px] block">Completed</span>
            <span className="text-base font-bold font-mono">14</span>
          </div>
          <div className="p-2 rounded bg-[#fdf5f5] border border-[#c42b1c] text-[#c42b1c]">
            <span className="text-[10px] block">Failed</span>
            <span className="text-base font-bold font-mono">1</span>
          </div>
          <div className="p-2 rounded bg-[#fff5f5] border border-[#a80000] text-[#a80000]">
            <span className="text-[10px] block">SLA breached</span>
            <span className="text-base font-bold font-mono">1</span>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'tree',
    badge: 'Hierarchy & Tracing',
    title: 'Deep Pipeline Hierarchy & Actions',
    subtitle: 'Expand pipeline rows to inspect granular activity execution: ForEach loops, Notebooks, and Copy tasks.',
    icon: Activity,
    accentColor: '#773adc',
    bullets: [
      'Expandable tree hierarchy displays start times, durations, and status badges.',
      'Context menu (...) opens Run pipeline, Run history, Schedules, and Table logs.',
      'Floating context menus render seamlessly across the page without container clipping.'
    ],
    preview: (
      <div className="bg-white border border-[#edebe9] rounded-lg p-2.5 text-xs space-y-1 font-sans">
        <div className="flex items-center justify-between p-2 rounded bg-[#f8fafd] border border-[#0f6cbd]/20 font-semibold text-[#242424]">
          <div className="flex items-center gap-2">
            <ChevronRight className="w-3.5 h-3.5 text-[#0f6cbd] rotate-90" />
            <span>PL_Bronze_To_Silver_Ingestion</span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#dff6dd] text-[#107c41] font-semibold border border-[#92c353]">
            Succeeded
          </span>
        </div>
        <div className="pl-6 space-y-1">
          <div className="flex items-center justify-between p-1.5 rounded bg-[#faf9f8] text-[#605e5c]">
            <span>↳ Copy_Bronze_Raw_Data</span>
            <span className="font-mono text-[11px]">42s</span>
          </div>
          <div className="flex items-center justify-between p-1.5 rounded bg-[#faf9f8] text-[#605e5c]">
            <span>↳ Run_Spark_Transformation</span>
            <span className="font-mono text-[11px]">1m 24s</span>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'lakehouse',
    badge: 'Data Layer Telemetry',
    title: 'Lakehouse & Medallion Table Logs',
    subtitle: 'Trace granular Delta table loading metrics across Bronze (L1) and Silver (L2) layers with batch audit records.',
    icon: Database,
    accentColor: '#008272',
    bullets: [
      'Track table-level operations: MERGE, UPSERT, INSERT, and record counts.',
      'Medallion color badges clearly distinguish raw Bronze ingestion from curated Silver.',
      'Access Lakehouse logs directly from the left navigation rail or any pipeline row.'
    ],
    preview: (
      <div className="bg-white border border-[#edebe9] rounded-lg p-3 text-xs space-y-2">
        <div className="flex items-center justify-between pb-2 border-b border-[#edebe9]">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#f1f3f5] text-[#475569] border border-[#cbd5e1]">
              SILVER
            </span>
            <span className="font-semibold text-[#242424]">Dim_Customer_Delta</span>
          </div>
          <span className="text-[11px] font-mono text-[#008272]">184,200 rows</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-[#605e5c]">
          <span>Schema: <strong>sales_dwh</strong></span>
          <span>Operation: <strong>MERGE</strong></span>
          <span className="text-[#107c41] font-semibold">100% Integrity</span>
        </div>
      </div>
    )
  },
  {
    id: 'ai',
    badge: 'Azure OpenAI Copilot',
    title: 'AI Diagnostics & Automated Fixes',
    subtitle: 'One-click triage for failed pipeline activities with root-cause identification and remediation guides.',
    icon: Sparkles,
    accentColor: '#c42b1c',
    bullets: [
      'Click View error diagnostics or the Detail side pane to trigger AI analysis.',
      'Generates root-cause summaries and copy-paste remediation scripts.',
      'Assign incidents to L1/L2 teams and mark SLA alerts as Admin Resolved.'
    ],
    preview: (
      <div className="bg-[#fdf5f5] border border-[#fde7e9] rounded-lg p-3 text-xs space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#0f6cbd]" />
            <span className="font-semibold text-[#242424]">AI Root-Cause Diagnosis</span>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] bg-[#fde7e9] text-[#c42b1c] font-semibold">
            Activity Failure
          </span>
        </div>
        <p className="text-[11px] text-[#605e5c] leading-relaxed">
          The Lakehouse schema was altered: column <code>CustomerTier</code> is missing from bronze source.
        </p>
        <div className="bg-white p-2 rounded border border-[#edebe9] text-[10px] font-mono text-[#0f6cbd]">
          ALTER TABLE dbo.bronze_customers ADD COLUMN CustomerTier VARCHAR(50);
        </div>
      </div>
    )
  }
];

export default function FabricProductTourModal({
  isOpen,
  onClose,
  onNavigateView
}) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const stored = localStorage.getItem(TOUR_STORAGE_KEY);
      if (stored === 'true') {
        setDontShowAgain(true);
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        handleDismiss();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStepIndex, dontShowAgain]);

  if (!isOpen) return null;

  const currentStep = TOUR_STEPS[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === TOUR_STEPS.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      handleDismiss();
    } else {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleDismiss = () => {
    if (dontShowAgain) {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    }
    onClose();
  };

  const handleToggleDontShowAgain = (e) => {
    const checked = e.target.checked;
    setDontShowAgain(checked);
    if (checked) {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(TOUR_STORAGE_KEY);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fabric-tour-title"
      className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px] animate-in fade-in duration-200 font-sans select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleDismiss();
      }}
    >
      <div className="bg-white rounded-lg border border-[#edebe9] shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="px-5 py-3.5 border-b border-[#edebe9] flex items-center justify-between bg-[#faf9f8]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-white border border-[#edebe9] flex items-center justify-center shadow-2xs">
              <svg className="w-4 h-4" viewBox="0 0 32 32" fill="none">
                <path d="M16 2.5 L29.5 16 L16 29.5 L2.5 16 Z" fill="#00A2ED" />
                <path d="M16 6.5 L25.5 16 L16 25.5 L6.5 16 Z" fill="#1177D7" />
              </svg>
            </div>
            <div>
              <span className="text-[11px] font-bold text-[#605e5c] uppercase tracking-wider block">
                Product tour
              </span>
              <span className="text-xs font-semibold text-[#242424]">
                Step {currentStepIndex + 1} of {TOUR_STEPS.length}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            title="Close tour (Esc)"
            className="p-1 rounded-md text-[#605e5c] hover:text-[#242424] hover:bg-[#edebe9] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tour Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Visual Preview Card */}
          <div>{currentStep.preview}</div>

          {/* Title & Badge */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: `${currentStep.accentColor}15`,
                  color: currentStep.accentColor
                }}
              >
                {currentStep.badge}
              </span>
            </div>
            <h2 id="fabric-tour-title" className="text-lg font-bold text-[#242424] tracking-tight">
              {currentStep.title}
            </h2>
            <p className="text-xs text-[#605e5c] leading-relaxed">
              {currentStep.subtitle}
            </p>
          </div>

          {/* Key Bullet Highlights */}
          <div className="space-y-2 pt-1">
            {currentStep.bullets.map((bullet, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-[#323130]">
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    backgroundColor: `${currentStep.accentColor}20`,
                    color: currentStep.accentColor
                  }}
                >
                  <Check className="w-2.5 h-2.5" />
                </div>
                <span>{bullet}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Navigation Bar */}
        <div className="px-5 py-3.5 bg-[#faf9f8] border-t border-[#edebe9] flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Left: Step indicator dots & Don't show again */}
          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
            {/* Step Dots */}
            <div className="flex items-center gap-1.5">
              {TOUR_STEPS.map((step, idx) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setCurrentStepIndex(idx)}
                  title={`Go to step ${idx + 1}: ${step.title}`}
                  className={`transition-all rounded-full cursor-pointer ${
                    idx === currentStepIndex
                      ? 'w-5 h-2 bg-[#0f6cbd]'
                      : 'w-2 h-2 bg-[#d1d1d1] hover:bg-[#a19f9d]'
                  }`}
                />
              ))}
            </div>

            {/* Don't Show Again Toggle */}
            <label className="flex items-center gap-1.5 text-xs text-[#605e5c] cursor-pointer hover:text-[#242424]">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={handleToggleDontShowAgain}
                className="w-3.5 h-3.5 rounded border-[#d1d1d1] text-[#0f6cbd] focus:ring-[#0f6cbd]"
              />
              <span className="text-[11px]">Don't show on start</span>
            </label>
          </div>

          {/* Right: Previous & Next / Finish Buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {!isFirstStep && (
              <button
                type="button"
                onClick={handlePrev}
                className="px-3 py-1.5 rounded-md border border-[#d1d1d1] bg-white text-xs font-semibold text-[#242424] hover:bg-[#f3f2f1] transition cursor-pointer flex items-center gap-1 shadow-2xs"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="px-4 py-1.5 rounded-md bg-[#0f6cbd] hover:bg-[#115ea3] active:bg-[#0c5096] text-xs font-semibold text-white transition cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <span>{isLastStep ? 'Get started' : 'Next'}</span>
              {isLastStep ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

