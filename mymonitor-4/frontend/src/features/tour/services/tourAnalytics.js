/**
 * Tour Analytics & Telemetry Tracking
 * Captures product adoption, drop-off rates, and step times.
 */

export function trackTourEvent(eventName, payload = {}) {
  try {
    const event = {
      event: eventName,
      timestamp: new Date().toISOString(),
      ...payload
    };

    const history = JSON.parse(localStorage.getItem('fabric_tour_analytics') || '[]');
    history.push(event);
    if (history.length > 100) history.shift();
    localStorage.setItem('fabric_tour_analytics', JSON.stringify(history));

    if (window?.fetch) {
      fetch('/api/tour/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      }).catch(() => {});
    }
  } catch (err) {
    console.debug('Tour telemetry skipped:', err);
  }
}

