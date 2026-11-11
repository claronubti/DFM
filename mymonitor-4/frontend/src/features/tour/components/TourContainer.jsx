import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTour } from '../context/TourContext';
import TourOverlay from './TourOverlay';
import TourTooltip from './TourTooltip';
import TourWelcomeModal from './TourWelcomeModal';
import TourSummaryModal from './TourSummaryModal';

export default function TourContainer() {
  const {
    isActive,
    currentStep,
    stepIndex,
    totalSteps,
    nextStep,
    prevStep,
    skipTour,
    pauseTour,
    finishTour,
    restartTour,
    startTour,
    isWelcomeOpen,
    closeWelcomeModal,
    isSummaryOpen,
    closeSummaryModal
  } = useTour();

  const [targetRect, setTargetRect] = useState(null);

  // Update target bounding box and smooth-scroll target element into view
  const updateTargetPosition = useCallback(() => {
    if (!isActive || !currentStep) {
      setTargetRect(null);
      return;
    }

    const selectorString = currentStep.targetSelector;
    if (!selectorString) {
      setTargetRect(null);
      return;
    }

    // Support comma-separated fallback selectors
    const selectors = selectorString.split(',').map((s) => s.trim()).filter(Boolean);
    let element = null;

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          element = el;
          break;
        }
      }
    }

    if (!element) {
      setTargetRect(null);
      return;
    }

    // Scroll element into view smoothly if not visible (prevent horizontal shifting)
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'start'
    });

    // Ensure any horizontal table container is never shifted to the right
    document.querySelectorAll('.overflow-x-auto').forEach((c) => {
      c.scrollLeft = 0;
    });

    const rect = element.getBoundingClientRect();
    setTargetRect(rect);
  }, [isActive, currentStep]);

  // Recalculate target position on step change, resize, or scroll with progressive retries
  useEffect(() => {
    if (!isActive) {
      setTargetRect(null);
      return;
    }

    updateTargetPosition();
    const t1 = setTimeout(updateTargetPosition, 60);
    const t2 = setTimeout(updateTargetPosition, 180);
    const t3 = setTimeout(updateTargetPosition, 360);

    const handleScrollOrResize = () => {
      requestAnimationFrame(updateTargetPosition);
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isActive, currentStep, updateTargetPosition]);

  return (
    <>
      {/* 1. First-time User Welcome Dialog */}
      <TourWelcomeModal
        isOpen={isWelcomeOpen}
        onStart={() => startTour()}
        onDismiss={closeWelcomeModal}
      />

      {/* 2. Active Tour Focus Spotlight & Floating Card */}
      {isActive && currentStep && (
        <>
          <TourOverlay
            targetRect={targetRect}
            onClickBackground={() => {}}
          />

          <TourTooltip
            step={currentStep}
            stepIndex={stepIndex}
            totalSteps={totalSteps}
            targetRect={targetRect}
            onNext={nextStep}
            onPrev={prevStep}
            onSkip={skipTour}
            onPause={pauseTour}
            onFinish={finishTour}
          />
        </>
      )}

      {/* 3. End-of-Tour Completion Summary */}
      <TourSummaryModal
        isOpen={isSummaryOpen}
        onClose={closeSummaryModal}
        onRestart={restartTour}
      />
    </>
  );
}

