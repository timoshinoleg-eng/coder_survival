import * as amplitude from '@amplitude/analytics-browser';

/**
 * Stable pseudonymized analytics id. Raw Telegram ids/usernames must never
 * reach Amplitude (PII). Uses WebCrypto SHA-256 when available; falls back
 * to a deterministic FNV-1a hash on insecure contexts so the id stays stable.
 */
export async function analyticsUserId(telegramId) {
  const seed = `coder-survival::${String(telegramId)}`;
  try {
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    }
  } catch {
    // fall through to FNV
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv-${hash.toString(16)}-${seed.length}`;
}

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

export function flushAnalytics() {
  try {
    amplitude.flush();
  } catch (err) {
    console.warn('[Analytics] Failed to flush:', err);
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

export function setAnalyticsUserId(hashedId) {
  try {
    amplitude.setUserId(hashedId);
  } catch (err) {
    console.warn('[Analytics] Failed to set user id:', err);
  }
}

export const Analytics = {
  init: initAnalytics,
  track: trackEvent,
  setUser: setUserProperties,
  setUserId: setAnalyticsUserId,
  hashedId: analyticsUserId,
  flush: flushAnalytics,
};
