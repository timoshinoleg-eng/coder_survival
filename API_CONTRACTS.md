# API Contracts — Coder Survival

> **Version:** 1.0.0  
> **Last updated:** 2026-06-03  
> **Base URL:** `https://api.codersurvival.app` (prod) / `http://localhost:3000` (local)  
> **Auth:** Telegram WebApp InitData via `X-Telegram-Init-Data` header (except where noted)

---

## Endpoints

### 1. POST /api/auth/telegram

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **Path** | `/api/auth/telegram` |
| **Auth** | `X-Telegram-Init-Data` header — Telegram WebApp initData |
| **Description** | Implicit auth via `initDataMiddleware` on all protected routes. No standalone endpoint; the middleware validates initData HMAC and populates `req.telegramUser`. |

**Request body:**
```json
{
  "initData": "query_id=...&user=...&auth_date=...&hash=..."
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 123456789,
    "username": "johndoe",
    "first_name": "John",
    "last_name": "Doe"
  }
}
```

**Error responses:**
- `401` — Invalid or expired initData
- `403` — Bot authentication failed

---

### 2. POST /api/user/tap

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **Path** | `/api/tap` |
| **Auth** | `initDataMiddleware` required |
| **Description** | Core tap mechanic. Processes taps, calculates rewards, applies anti-cheat, updates progression, quests, team contributions, and streak. |

**Request body:**
```json
{
  "tapCount": 5,
  "session_id": "uuid-v4",
  "timezoneOffset": 180
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "telegram_id": 123456789,
    "username": "johndoe",
    "commits_total": 1000,
    "commits_current": 500,
    "energy": 80,
    "depression_level": 1,
    "streak_days": 3
  },
  "tapResult": {
    "commitsEarned": 25,
    "energyConsumed": 5,
    "xpGained": 10,
    "levelUp": false
  },
  "antiCheat": {
    "banScore": 0,
    "warning": null
  }
}
```

**Error responses:**
- `401` — Session expired / no user in initData
- `429` — Rate limited (tap rate limit)
- `500` — Database or processing error

---

### 3. POST /api/user/upgrade-booster

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **Path** | `/api/buy` |
| **Auth** | `initDataMiddleware` required |
| **Description** | Purchase and apply consumable items / boosters. Real item delivery happens after Telegram successful_payment webhook. |

**Request body:**
```json
{
  "item_type": "energy_refill"
}
```

**Valid item types:** `energy_refill`, `depression_cure`, `tier_boost`, `streak_protect`, `streak_saver`, `premium_pass`

**Response (success):**
```json
{
  "success": true,
  "purchase_id": 42,
  "item_type": "energy_refill",
  "status": "pending_payment"
}
```

**Error responses:**
- `400` — Invalid item_type
- `401` — No user in initData
- `404` — User not found
- `409` — Premium pass already unlocked / insufficient balance

---

### 4. GET /api/user/profile

| Field | Value |
|-------|-------|
| **Method** | `GET` |
| **Path** | `/api/state` |
| **Auth** | `initDataMiddleware` required |
| **Description** | Full user state — profile, progression, active effects, quests, pass, team, battle status, onboarding, streak, and context offers. |

**Query params:**
- `timezoneOffset` — integer, minutes from UTC (default: 180)

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 123456789,
    "telegram_id": 123456789,
    "username": "johndoe",
    "first_name": "John",
    "tier": 1,
    "rank": 2,
    "xp_total": 5000,
    "commits_total": 10000,
    "commits_current": 5000,
    "energy": 80,
    "depression_level": 1,
    "streak_days": 3,
    "anti_cheat_state": {
      "banScore": 0,
      "warning": null
    }
  },
  "progression": {
    "recovery_eta": 3600,
    "generator_status": [],
    "active_effects": []
  },
  "dailyQuests": {
    "today": "2026-06-03",
    "quests": [],
    "streak": 3
  },
  "pass": {
    "active": true,
    "tier": 1,
    "xp": 150
  },
  "team": null,
  "contextOffer": null
}
```

**Error responses:**
- `401` — Session expired
- `500` — Database error

---

### 5. GET /api/leaderboard

| Field | Value |
|-------|-------|
| **Method** | `GET` |
| **Path** | `/api/leaderboard` |
| **Auth** | Optional — `initDataMiddleware` if `X-Telegram-Init-Data` header present; anonymous otherwise |
| **Description** | Top players leaderboard with optional period filtering, rank filtering, and "around me" mode. |

**Query params:**
- `limit` — integer, max 100 (default: 50)
- `period` — `all`, `week`, `today` (default: `all`)
- `rank` — filter by rank tier: 1-5
- `aroundMe` — `1` to show players around the authenticated user

**Response:**
```json
{
  "success": true,
  "period": "all",
  "players": [
    {
      "id": 1,
      "telegram_id": 123456789,
      "username": "alice",
      "first_name": "Alice",
      "commits_total": 100000,
      "tier": 3,
      "rank": 5
    }
  ],
  "userPosition": null
}
```

---

### 6. GET /api/quests

| Field | Value |
|-------|-------|
| **Method** | `GET` / `POST` |
| **Path** | `/api/quests` |
| **Auth** | `initDataMiddleware` required |
| **Description** | Daily quests + weekly sprint state. GET returns current quests; POST claims rewards. |

**GET query params:**
- `timezoneOffset` — integer, minutes from UTC (default: 180)

**GET response:**
```json
{
  "success": true,
  "today": "2026-06-03",
  "quests": [
    {
      "id": "daily_tap_100",
      "type": "daily",
      "title": "Tap 100 times",
      "progress": 45,
      "target": 100,
      "completed": false,
      "reward": { "commits": 50, "xp": 10 }
    }
  ],
  "streak": 3,
  "weeklySprint": {
    "week": "2026-W22",
    "tier": 1,
    "eligible": true,
    "canClaim": false
  }
}
```

**POST request body (claim):**
```json
{
  "questId": "daily_tap_100",
  "timezoneOffset": 180
}
```

---

### 7. GET /api/shop/products

| Field | Value |
|-------|-------|
| **Method** | `GET` |
| **Path** | `/api/shop/products` |
| **Auth** | None — public catalog |
| **Description** | Returns the static shop product catalog. |

**Response:**
```json
{
  "success": true,
  "products": [
    {
      "id": "energy_refill",
      "name": "Energy Refill",
      "description": "Restore 100 energy",
      "price_stars": 10,
      "category": "consumable"
    }
  ]
}
```

---

### 8. POST /api/payment/create

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **Path** | `/api/buy` (intention) + Telegram Stars invoice |
| **Auth** | `initDataMiddleware` required |
| **Description** | Creates a purchase intent. The frontend then triggers Telegram `requestPayment` with the returned `purchase_id` and `invoice_payload`. |

**Request body:**
```json
{
  "item_type": "energy_refill"
}
```

**Response:**
```json
{
  "success": true,
  "purchase_id": 42,
  "item_type": "energy_refill",
  "invoice_payload": "purchase:42:energy_refill",
  "status": "pending"
}
```

---

### 9. POST /api/payment/verify

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **Path** | `/api/internal/payments/telegram/invoice-context` |
| **Auth** | `X-Bot-Backend-Secret` header — server-to-server only |
| **Description** | Webhook for Telegram bot backend to verify invoice context before sending `successful_payment`. Called server-to-server, not from client. |

**Request body:**
```json
{
  "invoicePayload": "purchase:42:energy_refill"
}
```

**Response (valid):**
```json
{
  "valid": true,
  "purchase_id": 42,
  "item_type": "energy_refill",
  "stars_amount": 10
}
```

**Response (invalid):**
```json
{
  "valid": false,
  "error": "Purchase not found"
}
```

**Error responses:**
- `401` — Unauthorized (missing or wrong `X-Bot-Backend-Secret`)
- `400` — Invalid payload format
- `404` — Purchase not found

---

## Full Route Registry

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/tap` | initData | Tap mechanic |
| GET | `/api/state` | initData | Full user profile/state |
| POST | `/api/buy` | initData | Buy / upgrade booster |
| GET | `/api/leaderboard` | optional | Leaderboard |
| GET/POST | `/api/quests` | initData | Daily quests + weekly sprint |
| GET | `/api/shop/products` | none | Shop catalog |
| GET | `/api/shop` | none | Shop catalog (alias) |
| GET | `/api/player/level` | initData | Player level info |
| GET | `/api/referral` | initData | Referral link + stats |
| GET | `/api/team` | initData | Team info |
| GET | `/api/team-battle` | initData | Team battle status |
| GET | `/api/team/hackathon` | initData | Team hackathon state |
| GET | `/api/battle` | initData | Personal battle |
| POST | `/api/battle/distribute` | none | Cron-only distribution |
| GET | `/api/pass` | initData | Active pass status |
| GET | `/api/streak` | initData | Streak info |
| GET | `/api/skins` | initData | Owned skins |
| GET | `/api/achievements` | initData | User achievements |
| GET | `/api/offers` | initData | Context offers |
| GET | `/api/rewards` | initData | Rewarded video callbacks |
| POST | `/api/rewards/adsgram_callback` | none | AdsGram callback |
| POST | `/api/rewards/propeller_callback` | none | Propeller callback |
| GET | `/api/event` | initData | Active event |
| GET | `/api/events` | initData | Event list |
| GET | `/api/coffee` | initData | Coffee break state |
| GET | `/api/meme` | initData | Meme generator |
| GET | `/api/minigame` | initData | Mini game state |
| GET | `/api/daily-summary` | initData | Daily farm summary |
| GET | `/api/prestige` | initData | Prestige info |
| GET | `/api/generators` | initData | Generator status |
| POST | `/api/internal/payments/telegram/invoice-context` | server-secret | Payment verification |
| POST | `/api/internal/observation/...` | server-secret | Internal observation APIs |
| GET | `/health` | none | Health check |

---

## Auth Flow

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│  Telegram   │────▶│  initData (HMAC)  │────▶│  Backend    │
│  Mini App   │     │  X-Telegram-Init-Data  │  │  Middleware │
└─────────────┘     └─────────────────┘     └─────────────┘
                                                    │
                                                    ▼
                                           ┌─────────────┐
                                           │ req.telegramUser │
                                           │   validated     │
                                           └─────────────┘
```

## Versioning

- **v1.0** (2026-06-03) — Initial contract document
- Future changes: bump minor for additive, major for breaking

## Contact

- Backend issues: @timoshinoleg-eng (Kimi OpenClaw)
- Frontend issues: @kimi-desktop
- Docs: @hermes
