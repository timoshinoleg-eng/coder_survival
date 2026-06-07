import * as amplitude from '@amplitude/analytics-browser';

export function initAnalytics(apiKey) {
  if (!apiKey) {
    console.warn('[Analytics] No Amplitude API key provided. Skipping initialization.');
    return;
  }
  try {
    amplitude.init(apiKey);
  } catch (err) {
    console.warn('[Analytics] Failed to initialize Amplitude:', err);
  }
}

export function trackEvent(eventName, properties = {}) {
  try {
    amplitude.track(eventName, properties);
  } catch (err) {
    console.warn('[Analytics] Failed to track event:', err);
  }
}

export function setUserProperties(properties) {
  try {
    const identify = new amplitude.Identify();
    Object.entries(properties).forEach(([key, value]) => {
      identify.set(key, value);
    });
    amplitude.identify(identify);
  } catch (err) {
    console.warn('[Analytics] Failed to set user properties:', err);
  }
}

export const Analytics = {
  init: initAnalytics,
  track: trackEvent,
  setUser: setUserProperties,
};
