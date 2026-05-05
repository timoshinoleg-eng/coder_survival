/**
 * Amplitude Analytics — Event Definitions & Helpers
 * Coder Survival — Frontend Integration
 *
 * Usage:
 *   import { Events, trackEvent, setUserProperties, initAnalytics } from './events.js';
 *   initAnalytics('YOUR_API_KEY');
 *   trackEvent(Events.TAP, { x: 100, y: 200 });
 */

import * as amplitude from '@amplitude/analytics-browser';

// ─── Event Constants ─────────────────────────────────────────────────
export const Events = {
  // Lifecycle
  FIRST_OPEN: 'first_open',
  SESSION_START: 'session_start',
  APP_CLOSE: 'app_close',

  // Onboarding
  TUTORIAL_COMPLETE: 'tutorial_complete',
  TUTORIAL_SKIP: 'tutorial_skip',

  // Core Gameplay
  TAP: 'tap',
  CODE_WRITTEN: 'code_written',
  ENERGY_SPENT: 'energy_spent',
  ENERGY_REFILL: 'energy_refill',

  // Depression System
  DEPRESSION_INCREASE: 'depression_increase',
  DEPRESSION_DECREASE: 'depression_decrease',
  DEPRESSION_CRITICAL: 'depression_critical',

  // Progression
  LEVEL_UP: 'level_up',
  ACHIEVEMENT_UNLOCKED: 'achievement_unlocked',

  // Monetization — Purchases
  PURCHASE_ATTEMPT: 'purchase_attempt',
  PURCHASE_SUCCESS: 'purchase_success',
  PURCHASE_FAIL: 'purchase_fail',
  PURCHASE_RESTORE: 'purchase_restore',

  // Monetization — Ads
  REWARDED_AD_REQUEST: 'rewarded_ad_request',
  REWARDED_AD_COMPLETE: 'rewarded_ad_complete',
  REWARDED_AD_SKIP: 'rewarded_ad_skip',
  REWARDED_AD_ERROR: 'rewarded_ad_error',
  BANNER_AD_IMPRESSION: 'banner_ad_impression',
  BANNER_AD_CLICK: 'banner_ad_click',

  // Items
  ITEM_USED: 'item_used',
  ITEM_EXPIRED: 'item_expired',
  SKIN_EQUIPPED: 'skin_equipped',
  SKIN_PREVIEW: 'skin_preview',

  // Social
  SHARE: 'share',
  INVITE_FRIEND: 'invite_friend',

  // Settings
  SETTINGS_CHANGED: 'settings_changed',
  NOTIFICATION_TOGGLE: 'notification_toggle',

  // Errors
  ERROR_CAUGHT: 'error_caught',
  API_ERROR: 'api_error'
};

// ─── Configuration ───────────────────────────────────────────────────
let isInitialized = false;
let commonProperties = {};

/**
 * Initialize Amplitude SDK
 * @param {string} apiKey — Amplitude project API key
 * @param {object} options — Optional config overrides
 */
export function initAnalytics(apiKey, options = {}) {
  if (isInitialized) {
    console.warn('[Analytics] Already initialized');
    return;
  }

  const tg = window.Telegram?.WebApp;
  const user = tg?.initDataUnsafe?.user;

  // Detect geo tier from language/country hints
  const geoTier = detectGeoTier(user?.language_code);

  // Common properties attached to every event
  commonProperties = {
    platform: 'telegram_mini_app',
    app_version: options.appVersion || '1.0.0',
    tg_version: tg?.version || 'unknown',
    tg_platform: tg?.platform || 'unknown',
    screen_width: window.innerWidth,
    screen_height: window.innerHeight,
    dark_mode: tg?.colorScheme === 'dark',
    language: user?.language_code || 'unknown',
    geo_tier: geoTier,
    ...options.commonProperties
  };

  const config = {
    logLevel: options.debug
      ? amplitude.Types.LogLevel.Debug
      : amplitude.Types.LogLevel.Warn,
    flushQueueSize: options.flushQueueSize || 30,
    flushIntervalMillis: options.flushIntervalMillis || 10000,
    autocapture: {
      sessions: true,
      elementInteractions: false,
      formInteractions: false,
      fileDownloads: false
    },
    ...options.amplitudeConfig
  };

  // Initialize with deviceId from Telegram user ID
  const deviceId = user?.id?.toString();
  if (deviceId) {
    amplitude.init(apiKey, deviceId, config);
  } else {
    amplitude.init(apiKey, config);
  }

  // Set initial user properties
  amplitude.setUserProperties({
    platform: 'telegram_mini_app',
    tg_premium: user?.is_premium || false,
    language: user?.language_code || 'unknown',
    geo_tier: geoTier,
    first_open_date: new Date().toISOString().split('T')[0]
  });

  isInitialized = true;

  // Track first open if not seen before
  if (!localStorage.getItem('cs_first_open')) {
    trackEvent(Events.FIRST_OPEN, { source: 'telegram_mini_app' });
    localStorage.setItem('cs_first_open', 'true');
  }

  // Track session start
  trackEvent(Events.SESSION_START, {
    time_since_last: getTimeSinceLastSession()
  });

  // Flush on page hide
  window.addEventListener('pagehide', () => {
    trackEvent(Events.APP_CLOSE, {
      session_duration: getSessionDuration()
    });
    amplitude.flush();
  });
}

/**
 * Track an event with optional properties
 * @param {string} eventName — One of Events.* constants
 * @param {object} properties — Event-specific properties
 */
export function trackEvent(eventName, properties = {}) {
  if (!isInitialized) {
    console.warn(`[Analytics] Dropped event "${eventName}" — not initialized`);
    return;
  }

  const payload = {
    ...commonProperties,
    ...properties,
    _timestamp: Date.now()
  };

  amplitude.track(eventName, payload);

  if (commonProperties.debug) {
    console.log(`[Analytics] ${eventName}`, payload);
  }
}

/**
 * Set user properties (amplitude.setUserProperties wrapper)
 * @param {object} properties — User properties to set
 */
export function setUserProperties(properties) {
  if (!isInitialized) {
    console.warn('[Analytics] setUserProperties skipped — not initialized');
    return;
  }
  amplitude.setUserProperties(properties);
}

/**
 * Track revenue event
 * @param {string} productId — Item ID
 * @param {number} priceUsd — Estimated USD value
 * @param {number} quantity — Quantity (default 1)
 * @param {object} properties — Additional properties
 */
export function trackRevenue(productId, priceUsd, quantity = 1, properties = {}) {
  if (!isInitialized) return;

  amplitude.revenue({
    productId,
    price: priceUsd,
    quantity,
    revenueType: 'stars',
    eventProperties: {
      ...commonProperties,
      ...properties
    }
  });
}

/**
 * Identify user (when user_id becomes known)
 * @param {string} userId — Telegram user ID or custom ID
 */
export function identifyUser(userId) {
  if (!isInitialized) return;
  amplitude.setUserId(userId.toString());
}

/**
 * Flush pending events immediately
 */
export function flushEvents() {
  if (!isInitialized) return;
  amplitude.flush();
}

// ─── Helpers ─────────────────────────────────────────────────────────

function detectGeoTier(languageCode) {
  const tier1Langs = ['ru', 'uk', 'be', 'kk', 'uz', 'hy', 'az', 'ka', 'ky', 'ro', 'tg'];
  const tier2Langs = ['en', 'id', 'pt', 'es', 'tr', 'ar', 'vi', 'fil', 'hi', 'th'];

  if (!languageCode) return 'tier3';
  if (tier1Langs.includes(languageCode)) return 'tier1';
  if (tier2Langs.includes(languageCode)) return 'tier2';
  return 'tier3';
}

function getTimeSinceLastSession() {
  const last = localStorage.getItem('cs_last_session');
  const now = Date.now();
  localStorage.setItem('cs_last_session', now.toString());

  if (!last) return -1; // first session
  return Math.floor((now - parseInt(last)) / 1000); // seconds
}

function getSessionDuration() {
  const start = parseInt(sessionStorage.getItem('cs_session_start') || Date.now());
  return Math.floor((Date.now() - start) / 1000);
}

// Initialize session timer
sessionStorage.setItem('cs_session_start', Date.now().toString());

// ─── Debug Utilities ─────────────────────────────────────────────────

/**
 * Get current Amplitude session info
 */
export function getAnalyticsInfo() {
  return {
    isInitialized,
    commonProperties,
    deviceId: amplitude.getDeviceId?.(),
    userId: amplitude.getUserId?.()
  };
}

/**
 * Enable debug logging
 */
export function enableDebug() {
  if (!isInitialized) return;
  amplitude.setLogLevel(amplitude.Types.LogLevel.Debug);
}

/**
 * Disable debug logging
 */
export function disableDebug() {
  if (!isInitialized) return;
  amplitude.setLogLevel(amplitude.Types.LogLevel.Warn);
}
