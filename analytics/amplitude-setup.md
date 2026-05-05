# Amplitude Analytics Integration — Coder Survival

> SDK: Amplitude Browser SDK 2 (`@amplitude/analytics-browser`)  
> Environment: Telegram Mini App (WebView)  
> Fallback: Firebase Analytics (documented at end)

---

## SDK Choice

**Primary:** `@amplitude/analytics-browser` v2.x
- Lightweight (~30KB gzipped)
- Autocapture support (sessions, clicks, forms)
- Batch upload with retry
- EU data residency support

**Installation:**
```bash
npm install @amplitude/analytics-browser
```

**CDN (for quick prototype):**
```html
<script src="https://cdn.amplitude.com/libs/analytics-browser-2.11.0-min.js.gz"></script>
```

---

## Initialization

```javascript
import * as amplitude from '@amplitude/analytics-browser';

const AMPLITUDE_API_KEY = process.env.AMPLITUDE_API_KEY || 'dev-key';
const IS_PROD = process.env.NODE_ENV === 'production';

amplitude.init(AMPLITUDE_API_KEY, {
  // User ID set after Telegram WebApp init
  deviceId: Telegram.WebApp.initDataUnsafe?.user?.id?.toString(),
  
  // Config
  logLevel: IS_PROD ? amplitude.Types.LogLevel.Warn : amplitude.Types.LogLevel.Debug,
  flushQueueSize: 30,
  flushIntervalMillis: 10000,
  
  // Autocapture (minimal — we track manually for game events)
  autocapture: {
    sessions: true,        // session start/end
    elementInteractions: false,  // we track manually
    formInteractions: false,
    fileDownloads: false
  },
  
  // EU server (if needed)
  // serverZone: 'EU'
});

// Set user properties on init
amplitude.setUserProperties({
  platform: 'telegram_mini_app',
  tg_premium: Telegram.WebApp.initDataUnsafe?.user?.is_premium || false,
  language: Telegram.WebApp.initDataUnsafe?.user?.language_code || 'unknown',
  geo_tier: detectGeoTier() // tier1/tier2/tier3
});
```

---

## Event Taxonomy (20 Events)

| # | Event Name | Trigger | Key Properties |
|---|-----------|---------|----------------|
| 1 | `first_open` | App launched first time ever | `source`, `referrer` |
| 2 | `session_start` | App foregrounded | `session_id`, `time_since_last` |
| 3 | `tutorial_complete` | Finished onboarding | `step_count`, `duration_sec` |
| 4 | `tap` | User taps anywhere | `x`, `y`, `target_type` |
| 5 | `code_written` | Lines of code "written" | `lines`, `language`, `speed` |
| 6 | `energy_spent` | Energy consumed | `amount`, `activity` |
| 7 | `depression_increase` | Depression level up | `new_level`, `cause` |
| 8 | `depression_critical` | Depression ≥ 80% | `level`, `time_in_session` |
| 9 | `purchase_attempt` | Tap buy button | `item_id`, `price_stars`, `tier` |
| 10 | `purchase_success` | Payment confirmed | `item_id`, `price_stars`, `transaction_id` |
| 11 | `purchase_fail` | Payment cancelled/failed | `item_id`, `reason` |
| 12 | `rewarded_ad_request` | User asks for ad | `ad_provider`, `placement` |
| 13 | `rewarded_ad_complete` | Ad watched fully | `ad_provider`, `duration_sec` |
| 14 | `rewarded_ad_skip` | Ad skipped/closed | `ad_provider`, `progress_pct` |
| 15 | `item_used` | Consumable consumed | `item_id`, `context` |
| 16 | `skin_equipped` | Cosmetic applied | `skin_id` |
| 17 | `level_up` | Programmer level up | `new_level`, `total_lines` |
| 18 | `share` | Shared to chat/story | `channel_type`, `content` |
| 19 | `settings_changed` | Any setting toggled | `setting`, `new_value` |
| 20 | `app_close` | App backgrounded/closed | `session_duration`, `depression_final` |

---

## Event Properties Schema

### Common Properties (sent with every event)
```javascript
const commonProperties = {
  platform: 'telegram_mini_app',
  app_version: '1.0.0',
  tg_version: Telegram.WebApp.version,
  screen_width: window.innerWidth,
  screen_height: window.innerHeight,
  dark_mode: Telegram.WebApp.colorScheme === 'dark'
};
```

### Event-Specific Properties

```javascript
// purchase_attempt / purchase_success / purchase_fail
{
  item_id: 'coffee',           // string
  price_stars: 10,             // integer
  tier: 'tier1',               // tier1 | tier2 | tier3
  currency: 'XTR'              // string
}

// depression_critical
{
  level: 85,                   // integer 0-100
  time_in_session: 420,        // seconds
  energy_remaining: 12         // integer
}

// rewarded_ad_complete
{
  ad_provider: 'adsgram',      // adsgram | adton | telegram
  duration_sec: 15,            // integer
  reward_granted: true          // boolean
}

// tap
{
  x: 120,                      // integer
  y: 340,                      // integer
  target_type: 'code_area',    // string
  target_id: 'main_editor'     // string
}
```

---

## User Properties

Set once per session or on significant changes:

```javascript
amplitude.setUserProperties({
  // Geo / Segment
  geo_tier: 'tier1',           // tier1 | tier2 | tier3
  country: 'RU',               // ISO code
  language: 'ru',              // ISO code
  
  // Game State
  programmer_level: 5,           // integer
  total_lines_written: 15420,  // integer
  highest_depression: 78,      // integer 0-100
  total_purchases: 3,          // integer
  total_stars_spent: 160,      // integer
  
  // Engagement
  days_since_first_open: 7,    // integer
  sessions_count: 23,          // integer
  avg_session_minutes: 4.5,    // float
  
  // Monetization
  paying_user: true,           // boolean
  first_purchase_date: '2026-05-01', // ISO date
  ad_supported: true            // boolean
});
```

---

## Revenue Tracking

```javascript
// Track purchase as revenue event
amplitude.track('purchase_success', {
  item_id: 'energy_pack',
  price_stars: 50,
  revenue: 0.50,               // estimated USD value
  revenue_type: 'stars',
  transaction_id: 'XTR_123...'
});

// Amplitude Revenue API (if using their revenue features)
amplitude.revenue({
  productId: 'energy_pack',
  price: 0.50,
  quantity: 1,
  revenueType: 'stars',
  eventProperties: {
    tier: 'tier1'
  }
});
```

---

## Implementation Pattern (Frontend)

```javascript
// analytics/events.js — see full implementation in events.js
import { Events, trackEvent, setUserProperties } from './events.js';

// On game tap
trackEvent(Events.TAP, {
  x: e.clientX,
  y: e.clientY,
  target_type: 'code_button'
});

// On depression critical
if (depressionLevel >= 80) {
  trackEvent(Events.DEPRESSION_CRITICAL, {
    level: depressionLevel,
    time_in_session: getSessionDuration(),
    energy_remaining: energy
  });
}

// On purchase attempt
trackEvent(Events.PURCHASE_ATTEMPT, {
  item_id: 'coffee',
  price_stars: 10,
  tier: currentTier
});
```

---

## Privacy & Compliance

- No PII collected (no names, emails, phone numbers)
- Only Telegram user_id (hashed internally by Amplitude)
- EU server zone available
- Data retention: standard Amplitude terms
- User deletion: handle via Amplitude API if user requests

---

## Dashboard Setup (Amplitude UI)

### Recommended Charts
1. **DAU / MAU** — `session_start` unique users
2. **Retention** — Day 1, Day 7, Day 30 from `first_open`
3. **Funnel** — `first_open` → `tutorial_complete` → `purchase_success`
4. **Revenue** — Sum of `purchase_success` × estimated USD
5. **Ad Revenue** — `rewarded_ad_complete` × eCPM estimate
6. **Depression Crisis** — Frequency of `depression_critical`

### Cohorts
- Paying users vs non-paying
- Tier 1 vs Tier 2 vs Tier 3
- Premium Telegram vs free

---

## Fallback: Firebase Analytics

If Amplitude unavailable:

```javascript
import { getAnalytics, logEvent, setUserProperties } from 'firebase/analytics';

const analytics = getAnalytics(app);

// Equivalent tracking
logEvent(analytics, 'purchase_success', {
  item_id: 'coffee',
  price_stars: 10
});

setUserProperties(analytics, {
  geo_tier: 'tier1',
  paying_user: 'true'
});
```

**Pros:** Free tier generous, Google ecosystem  
**Cons:** Less game-oriented dashboards, harder cohort analysis

---

## Debug Mode

```javascript
// In development, enable verbose logging
amplitude.init(API_KEY, {
  logLevel: amplitude.Types.LogLevel.Debug,
  // ...
});

// Verify events in Amplitude → Data → User Look-Up
```

---

*Last updated: 2026-05-05*
