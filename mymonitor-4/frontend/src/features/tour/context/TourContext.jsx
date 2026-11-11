import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { TOUR_STEPS } from '../config/tourStepsConfig';
import { trackTourEvent } from '../services/tourAnalytics';
import { saveTourProgress, getTourProgress } from '../api/tourApi';

const TourContext = createContext(null);

export function TourProvider({ children, currentView, setCurrentView }) {
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);

  // Single continuous flow for the whole application
  const activeSteps = TOUR_STEPS;
  const currentStep = activeSteps[stepIndex] || null;
  const totalSteps = activeSteps.length;

  // Check if first-time user and prompt welcome modal
  useEffect(() => {
    try {
      const saved = getTourProgress();
      if (!saved || (!saved.hasSeenWelcome && !saved.completed)) {
        const timer = setTimeout(() => {
          setIsWelcomeOpen(true);
        }, 1200);
        return () => clearTimeout(timer);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  // When step changes, automatically transition application view if needed
  useEffect(() => {
    if (isActive && currentStep && currentStep.view && setCurrentView) {
      if (currentStep.view !== currentView) {
        setCurrentView(currentStep.view);
      }
    }
  }, [isActive, currentStep, currentView, setCurrentView]);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextStep();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevStep();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        skipTour();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, stepIndex, totalSteps]);

  const startTour = useCallback((fromIndex = 0) => {
    setStepIndex(fromIndex);
    setIsWelcomeOpen(false);
    setIsSummaryOpen(false);
    setIsActive(true);

    trackTourEvent('tour_started', { fromIndex });
    saveTourProgress({ stepIndex: fromIndex, hasSeenWelcome: true });
  }, []);

  const nextStep = useCallback(() => {
    if (stepIndex < totalSteps - 1) {
      const nextIdx = stepIndex + 1;
      setStepIndex(nextIdx);
      trackTourEvent('tour_step_viewed', { stepIndex: nextIdx });
      saveTourProgress({ stepIndex: nextIdx });
    } else {
      finishTour();
    }
  }, [stepIndex, totalSteps]);

  const prevStep = useCallback(() => {
    if (stepIndex > 0) {
      const prevIdx = stepIndex - 1;
      setStepIndex(prevIdx);
      saveTourProgress({ stepIndex: prevIdx });
    }
  }, [stepIndex]);

  const skipTour = useCallback(() => {
    setIsActive(false);
    trackTourEvent('tour_skipped', { stepIndex });
    saveTourProgress({ stepIndex, skipped: true });
  }, [stepIndex]);

  const pauseTour = useCallback(() => {
    setIsActive(false);
    trackTourEvent('tour_paused', { stepIndex });
    saveTourProgress({ stepIndex, paused: true });
  }, [stepIndex]);

  const finishTour = useCallback(() => {
    setIsActive(false);
    setIsSummaryOpen(true);

    trackTourEvent('tour_completed', {});
    saveTourProgress({ completed: true, stepIndex: totalSteps - 1 });
  }, [totalSteps]);

  const restartTour = useCallback(() => {
    setIsSummaryOpen(false);
    startTour(0);
  }, [startTour]);

  const closeWelcomeModal = useCallback(() => {
    setIsWelcomeOpen(false);
    saveTourProgress({ hasSeenWelcome: true });
  }, []);

  const closeSummaryModal = useCallback(() => {
    setIsSummaryOpen(false);
  }, []);

  const value = {
    isActive,
    stepIndex,
    totalSteps,
    currentStep,
    isWelcomeOpen,
    isSummaryOpen,
    startTour,
    nextStep,
    prevStep,
    skipTour,
    pauseTour,
    finishTour,
    restartTour,
    closeWelcomeModal,
    closeSummaryModal
  };

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour() {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
}

