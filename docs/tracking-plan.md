# Tracking Plan

## Overview

This document defines the analytics instrumentation for **Coder Survival**.

- **Analytics Provider:** [Amplitude](https://amplitude.com)
- **Environments:**
  - `dev` — local development, events may be sent to a test project
  - `staging` — pre-production validation
  - `prod` — live production project

The backend exposes a single relay endpoint (`POST /api/analytics/event`) that forwards server-side events to Amplitude. Frontend events are sent directly from the client using the Amplitude SDK.

---

## User Properties

The following user properties are attached to identify and segment users across platforms.

| Property | Type | Description |
|---|---|---|
| `telegram_id` | string | Unique Telegram user ID |
| `username` | string | Telegram handle (may be null) |
| `career_rank` | string | Current player rank title (e.g., "Junior", "Senior") |
| `total_xp` | number | Lifetime XP accumulated |

---

## Event Catalog

| Event | Trigger | Properties | Platform |
|---|---|---|---|
| `app_opened` | App mount | `source` | Frontend |
| `onboarding_started` | Modal open | — | Frontend |
| `onboarding_completed` | Last step | `duration_sec`, `steps` | Frontend |
| `tap` | User taps | `energy_before`, `energy_after`, `rank` | Frontend |
| `rank_up` | Rank changes | `old_rank`, `new_rank` | Frontend |
| `shop_opened` | Panel open | — | Frontend |
| `purchase_initiated` | Click buy | `product_id`, `price` | Frontend |
| `purchase_completed` | Success | `product_id`, `price`, `currency` | Frontend |
| `ad_watched` | Video complete | `ad_type`, `reward` | Frontend |
| `ad_reward_granted` | Backend confirms reward delivery | `reward_type`, `amount` | Backend |
| `api_error` | Backend returns HTTP 5xx | `endpoint`, `status_code` | Backend |

---

## Backend Events

Server-side events are emitted via the backend relay endpoint rather than the client SDK. This ensures that critical business events are recorded even if the client disconnects or blocks third-party scripts.

### Endpoint

```
POST /api/analytics/event
```

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `eventName` | string | Yes | Name of the event to log |
| `properties` | object | No | Key-value map of event properties |

### Authentication

The endpoint requires the standard Telegram `initData` header (`x-telegram-init-data`). The `userId` is extracted from `req.telegramUser.user.id` automatically.

### Forwarding Behavior

- Events are forwarded to Amplitude (`https://api2.amplitude.com/2/httpapi`) using the server-side API key defined in `AMPLITUDE_API_KEY`.
- If `AMPLITUDE_API_KEY` is not configured, the endpoint returns HTTP 200 with `forwarded: false` and logs a warning. This provides graceful degradation so that missing configuration does not break client flows.

### Currently Tracked Backend Events

- **`ad_reward_granted`** — Fired when the backend validates and grants a reward for watching an advertisement.
- **`api_error`** — Fired when an unhandled exception or 5xx response occurs on a backend route.
