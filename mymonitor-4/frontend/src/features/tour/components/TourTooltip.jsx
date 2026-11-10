import React, { useMemo } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Sparkles
} from 'lucide-react';

/**
 * Enterprise Tour Tooltip Card
 * Clean, compact, single-container design with 4 to 5 lines of focused content.
 */
export default function TourTooltip({
  step,
  stepIndex,
  totalSteps,
  targetRect,
  onNext,
  onPrev,
  onSkip,
  onPause,
  onFinish
}) {
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;
  const progressPercent = Math.round(((stepIndex + 1) / totalSteps) * 100);

  // Calculate position and beak pointer based on targetRect and viewport bounds
  const { tooltipStyle, arrowStyle } = useMemo(() => {
    const cardWidth = 360;
    const cardHeight = 200;
    const margin = 14;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (!targetRect) {
      return {
        tooltipStyle: {
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10002
        },
        arrowStyle: null
      };
    }

    let top = targetRect.bottom + margin;
    let left = targetRect.left + (targetRect.width / 2) - (cardWidth / 2);
    let placement = 'bottom';
    const pref = step.placement || 'bottom';

    if (pref === 'right' && targetRect.right + cardWidth + margin < viewportWidth) {
      placement = 'right';
      left = targetRect.right + margin;
      top = targetRect.top + (targetRect.height / 2) - (cardHeight / 2);
    } else if (pref === 'left' && targetRect.left - cardWidth - margin > 0) {
      placement = 'left';
      left = targetRect.left - cardWidth - margin;
      top = targetRect.top + (targetRect.height / 2) - (cardHeight / 2);
    } else if (pref === 'top' && targetRect.top - cardHeight - margin > 0) {
      placement = 'top';
      top = targetRect.top - cardHeight - margin;
      left = targetRect.left + (targetRect.width / 2) - (cardWidth / 2);
    } else if (targetRect.bottom + cardHeight + margin > viewportHeight && targetRect.top - cardHeight - margin > 0) {
      placement = 'top';
      top = targetRect.top - cardHeight - margin;
    }

    if (left < 16) left = 16;
    if (left + cardWidth > viewportWidth - 16) left = viewportWidth - cardWidth - 16;
    if (top < 16) top = 16;
    if (top + cardHeight > viewportHeight - 16) top = viewportHeight - cardHeight - 16;

    const targetCenterX = targetRect.left + targetRect.width / 2;
    const arrowLeft = Math.max(24, Math.min(cardWidth - 24, targetCenterX - left));

    return {
      tooltipStyle: {
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${cardWidth}px`,
        zIndex: 10002
      },
      arrowStyle: { placement, arrowLeft }
    };
  }, [targetRect, step.placement]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Tour Step: ${step.featureName}`}
      style={tooltipStyle}
      className="bg-[#ffffff] text-[#242424] rounded-xl shadow-[0_16px_36px_rgba(0,0,0,0.22),0_4px_12px_rgba(0,0,0,0.08)] border border-[#e1dfdd] overflow-visible select-none animate-in fade-in zoom-in-95 duration-200 font-['Segoe_UI'] relative"
    >
      {/* Physical Connector Arrow Pointing to Highlighted Bar */}
      {arrowStyle && arrowStyle.placement === 'bottom' && (
        <div
          style={{ left: `${arrowStyle.arrowLeft}px` }}
          className="absolute -top-2 -translate-x-1/2 w-4 h-4 bg-[#ffffff] border-t border-l border-[#e1dfdd] rotate-45 z-20"
        />
      )}
      {arrowStyle && arrowStyle.placement === 'top' && (
        <div
          style={{ left: `${arrowStyle.arrowLeft}px` }}
          className="absolute -bottom-2 -translate-x-1/2 w-4 h-4 bg-[#faf9f8] border-b border-r border-[#e1dfdd] rotate-45 z-20"
        />
      )}
      {arrowStyle && arrowStyle.placement === 'right' && (
        <div
          className="absolute top-1/2 -left-2 -translate-y-1/2 w-4 h-4 bg-[#ffffff] border-b border-l border-[#e1dfdd] rotate-45 z-20"
        />
      )}
      {arrowStyle && arrowStyle.placement === 'left' && (
        <div
          className="absolute top-1/2 -right-2 -translate-y-1/2 w-4 h-4 bg-[#ffffff] border-t border-r border-[#e1dfdd] rotate-45 z-20"
        />
      )}

      {/* Top Header: Microsoft Fabric branding & step progress */}
      <div className="px-4 pt-3.5 pb-2 bg-[#ffffff] border-b border-[#f3f2f1] flex items-center justify-between rounded-t-xl relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-[#0f6cbd]/10 text-[#0f6cbd] flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-[#0f6cbd]" />
          </div>
          <span className="text-xs font-semibold text-[#242424] tracking-tight">
            Application Tour
          </span>
          <span className="text-[#a19f9d] text-[11px]">•</span>
          <span className="text-[11px] font-medium text-[#605e5c]">
            Step {stepIndex + 1} of {totalSteps}
          </span>
        </div>

        <button
          type="button"
          onClick={onSkip}
          title="Close Tour"
          aria-label="Close Tour"
          className="w-6 h-6 rounded flex items-center justify-center text-[#797775] hover:text-[#242424] hover:bg-[#edebe9] transition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Fluent Progress Bar */}
      <div className="w-full h-1 bg-[#edebe9] relative z-10">
        <div
          className="h-full bg-gradient-to-r from-[#0f6cbd] to-[#00b7c3] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Main Content Body: Single unified clean container */}
      <div className="p-4 space-y-2 relative z-10">
        {/* Title and Module Category Badge */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#242424] leading-snug">
            {step.featureName}
          </h3>
          {step.category && (
            <span className="text-[10px] uppercase font-semibold text-[#0f6cbd] bg-[#eef6fc] border border-[#0f6cbd]/20 px-2 py-0.5 rounded-full shrink-0">
              {step.category}
            </span>
          )}
        </div>

        {/* 4 to 5 lines of focused, unified description */}
        <p className="text-xs text-[#323130] leading-relaxed">
          {step.description || [step.whatItIs, step.whyItExists, step.whenToUse].filter(Boolean).join(' ')}
        </p>
      </div>

      {/* Footer Action Panel */}
      <div className="px-3.5 py-2.5 bg-[#faf9f8] border-t border-[#f3f2f1] flex items-center justify-between rounded-b-xl relative z-10">
        {/* Left Utilities */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPause}
            className="text-[11px] text-[#605e5c] hover:text-[#242424] hover:underline"
          >
            Resume later
          </button>
          <span className="text-[#d1d1d1]">•</span>
          <button
            type="button"
            onClick={onSkip}
            className="text-[11px] text-[#605e5c] hover:text-[#242424] hover:underline"
          >
            Skip
          </button>
        </div>

        {/* Right Buttons: Previous & Next / Finish */}
        <div className="flex items-center gap-2">
          {!isFirst && (
            <button
              type="button"
              onClick={onPrev}
              className="h-7 px-2.5 rounded-md text-xs font-medium border border-[#d1d1d1] bg-white hover:bg-[#f3f2f1] text-[#242424] transition flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
          )}

          <button
            type="button"
            onClick={isLast ? onFinish : onNext}
            className="h-7 px-3 rounded-md text-xs font-semibold bg-[#0f6cbd] hover:bg-[#115ea3] active:bg-[#0c5999] text-white transition flex items-center gap-1 shadow-xs"
          >
            <span>{isLast ? 'Finish Tour' : 'Next'}</span>
            {isLast ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
