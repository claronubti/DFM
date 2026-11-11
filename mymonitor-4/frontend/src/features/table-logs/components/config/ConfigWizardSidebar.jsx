import React from 'react';
import { Check } from 'lucide-react';

/**
 * ConfigWizardSidebar renders the left navigation rail with a vertical stepper
 * aligned to the Microsoft Fabric UI Kit wizard design pattern.
 *
 * @param {Object} props
 * @param {Array} props.steps - List of wizard step definitions.
 * @param {number} props.activeStep - Currently active step number (1-based).
 * @param {Function} props.onSelectStep - Handler when user clicks a step.
 */
export default function ConfigWizardSidebar({ steps = [], activeStep, onSelectStep }) {
  return (
    <aside className="w-64 lg:w-72 bg-[#f5f5f5] border-r border-[#edebe9] p-6 shrink-0 flex flex-col overflow-y-auto">
      <nav className="space-y-6">
        {steps.map((step, idx) => {
          const isActive = activeStep === step.number;
          const isCompleted = step.isCompleted;
          const isLast = idx === steps.length - 1;

          return (
            <div key={step.id} className="relative">
              {/* Vertical Connecting Line */}
              {!isLast && (
                <div 
                  className={`absolute left-[9px] top-6 bottom-[-24px] w-[2px] transition-colors duration-200 ${
                    isCompleted ? 'bg-[#117865]' : 'bg-[#d1d1d1]'
                  }`}
                  style={{ zIndex: 0 }}
                />
              )}

              {/* Step Row Item */}
              <button
                type="button"
                onClick={() => onSelectStep(step.number)}
                className="relative z-10 w-full text-left flex items-start gap-3 group focus:outline-none"
              >
                {/* Status Icon Node */}
                <div className="shrink-0 mt-0.5">
                  {isActive ? (
                    <div className="w-[20px] h-[20px] rounded-full bg-[#117865] flex items-center justify-center shadow-xs">
                      <div className="w-[7px] h-[7px] rounded-full bg-white" />
                    </div>
                  ) : isCompleted ? (
                    <div className="w-[20px] h-[20px] rounded-full bg-[#117865] flex items-center justify-center text-white shadow-xs">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  ) : (
                    <div className="w-[20px] h-[20px] rounded-full bg-white border-2 border-[#d1d1d1] group-hover:border-[#117865] transition-colors" />
                  )}
                </div>

                {/* Step Details */}
                <div className="min-w-0 flex-1">
                  <h3 className={`text-xs font-semibold leading-tight ${
                    isActive ? 'text-[#117865]' : 'text-[#242424]'
                  }`}>
                    {step.title}
                  </h3>
                  <p className="text-[11px] text-[#616161] leading-tight mt-1">
                    {step.subtitle}
                  </p>
                </div>
              </button>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
