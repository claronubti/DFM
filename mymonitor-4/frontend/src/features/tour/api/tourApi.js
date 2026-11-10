/**
 * Tour Progress State Persistence API
 * Synchronizes onboarding state with backend and localStorage.
 */

const STORAGE_KEY = 'fabric_tour_progress_v2';

export function getTourProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveTourProgress(progressData) {
  try {
    const existing = getTourProgress() || {};
    const updated = {
      ...existing,
      ...progressData,
      lastUpdated: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    if (window?.fetch) {
      fetch('/api/tour/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      }).catch(() => {});
    }

    return updated;
  } catch (err) {
    console.debug('Failed to save tour progress:', err);
    return progressData;
  }
}

export function resetTourProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    if (window?.fetch) {
      fetch('/api/tour/reset', { method: 'POST' }).catch(() => {});
    }
  } catch (err) {
    console.debug('Failed to reset tour progress:', err);
  }
}

