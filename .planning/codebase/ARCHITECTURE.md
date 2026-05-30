# Coder Survival — Architecture Overview

> Date: 2026-05-20  
> Project: Coder Survival (Telegram Mini App — clicker game for programmers)

---

## 1. High-Level Pattern

Coder Survival is a **monorepo Telegram Mini App** composed of three primary runtime components:

| Component | Technology | Responsibility |
|-----------|-----------|----------------|
| **Frontend** | Preact + Vite + Phaser 3 | Game UI, tap interactions, WebGL rendering, audio |
| **Backend** | Express + node-postgres | API, game logic, economy, persistence, observability |
| **Bot** | Grammy (Telegram Bot Framework) | Webhook handler, payment flow, Mini App entrypoint |

Data is persisted in **PostgreSQL**. The backend owns all game-state mutations. The frontend is a thin client that renders state and forwards player actions. The bot acts as the Telegram-native bridge (launch, invoicing, payment confirmation).

---

## 2. Layer Breakdown

### 2.1 Frontend (`frontend/`)

| Layer | Location | Purpose |
|-------|----------|---------|
| **Entry** | `src/main.jsx` | Preact renderer mounting `<App>` into `#app` |
| **App Shell** | `src/App.jsx` | Top-level component tree: providers, layout, modals, banners |
| **State Management** | `src/hooks/useGameState.js` | Centralized game context (~70 fields), API orchestration, tap queue, polling |
| **Telegram Bridge** | `src/hooks/useTelegram.js` | `window.Telegram.WebApp` wrapper: haptics, share, initData extraction |
| **API Client** | `src/utils/api.js` | `fetch` wrapper with `X-Telegram-Init-Data` header, `ApiError` class |
| **Game Engine** | `src/game/PhaserGame.js` | Phaser 3 bootstrap (AUTO renderer, arcade physics, resize) |
| **Scenes** | `src/game/scenes/` | `BootScene` (procedural textures) → `GameScene` (desks, particles, overlays) |
| **UI Components** | `src/components/` | Preact JSX components: `TapArea`, `StatsBar`, `ShopPanel`, `BattleCard`, etc. |
| **Audio** | `src/utils/AudioManager.js` | Web Audio API + `<Audio>` BGM; SFX registry for procedural sounds |
| **Analytics** | `analytics/events.js` | Amplitude wrapper (not imported by default in frontend build) |

**Rendering strategy:**
- The **Phaser canvas** renders the animated core (programmer avatar, desk, monitor, particles, depression vignette).
- **Preact DOM overlays** render UI chrome (HUD, panels, banners, modals).
- Bridge: `window.__GAME_STATE__` is written by `useGameState`; `GameScene.update()` reads it every frame for depression overlay and skin tints.

### 2.2 Backend (`backend/`)

| Layer | Location | Purpose |
|-------|----------|---------|
| **Entry** | `src/index.js` | Express app setup, route mounting, pool export, graceful shutdown |
| **Middleware** | `src/middleware/` | `initData` (Telegram auth), `errorHandler`, `rateLimit`, `antiCheat` |
| **Routes** | `src/routes/` | One router per domain: `tap`, `state`, `buy`, `battle`, `quests`, `pass`, `team`, `shop`, etc. |
| **Utils** | `src/utils/` | Business-logic modules: `progression`, `vnext` (levels/quests), `events`, `pass`, `teams`, `battle`, `offers`, `achievements`, `shopCatalog` |
| **Config** | `src/config/balance.js` | Single source of truth for all economy constants (tap mechanics, quests, pass, stage 2–4 features) |
| **Jobs** | `src/jobs/` | `balanceAudit.js` — scheduled background integrity checks |
| **Migrations** | `migrations/` | Sequential `.sql` files applied by `src/migrate.js` |

**Data access pattern:**
- Raw SQL via `pg.Pool` (no ORM).
- Most routes acquire a client, wrap logic in `BEGIN … COMMIT/ROLLBACK`, then release.
- The `pool` is exported from `src/index.js` and imported by routes/utils.

### 2.3 Bot (`bot/`)

| Layer | Location | Purpose |
|-------|----------|---------|
| **Legacy Polling** | `index.js` | Local debug entrypoint (requires `ENABLE_POLLING_BOT=true`) |
| **Production Runtime** | `api/webhook.js` | Vercel serverless handler using `grammy/webhookCallback` |
| **Invoice Link** | `api/invoice-link.js` | Serverless handler: fetches invoice context from backend, calls Telegram `createInvoiceLink` |
| **Bot Logic** | `src/createBot.js` | Command handlers (`/start`, `/help`, `/leaderboard`), pre-checkout & successful-payment handlers |

---

## 3. Data Flow

### 3.1 Typical Tap Flow

```
User taps screen
  → Frontend: TapArea onClick
    → useGameState.tap() increments pendingTapsRef
      → flushTapQueue() sends POST /api/tap
        → Backend: initDataMiddleware verifies Telegram signature
          → tapRouter: rate limit → anti-cheat → calculateTapDelta
            → UPDATE progression (energy, depression, commits)
            → UPDATE sessions (taps_count, commits_earned)
            → Side effects: quests, pass XP, event contribution, team progress, achievements
          → JSON response { commitsDelta, energy, depression, isCrit, … }
        → Frontend: applyTapState() updates local state
          → GameScene emits particles via Phaser events
            → AudioManager plays SFX
```

### 3.2 State Hydration Flow

```
App mounts
  → useGameState.loadState()
    → Parallel batch of GET requests:
      /api/state, /api/quests, /api/streak, /api/pass,
      /api/rewarded-video/status, /api/team/hackathon,
      /api/battle/active, /api/referral/status, /api/events
    → applyServerState() merges everything into GameContext
```

### 3.3 Purchase Flow (Telegram Stars)

```
User clicks shop item
  → Frontend: POST /api/buy { item_type }
    → Backend: creates pending row in purchases table
      → Returns invoice payload: "purchase:<id>:<item_type>"
  → Frontend calls bot invoice-link endpoint (Vercel)
    → Bot: POST /api/internal/payments/telegram/invoice-context
      → Backend validates purchase row, returns invoice metadata
    → Bot calls Telegram createInvoiceLink
      → Returns invoice URL to frontend
  → User pays in Telegram UI
    → Bot receives successful_payment webhook
      → Bot POST /api/internal/payments/telegram/confirm
        → Backend: idempotency check (star_payments table)
          → applyItemEffect() mutates progression
          → Marks purchase completed
        → Bot replies success message to user
```

---

## 4. Key Abstractions

### 4.1 Telegram InitData Authentication

- Every protected route uses `initDataMiddleware` (`backend/src/middleware/initData.js`).
- Verifies HMAC-SHA256 signature against `BOT_TOKEN`.
- Parses `user`, `auth_date`, `start_param` into `req.telegramUser`.
- Dev fallback: if no `BOT_TOKEN` in non-production, parses initData without verification.

### 4.2 Game State Model

The backend truth is the `progression` table:

| Field | Meaning |
|-------|---------|
| `commits_total` | Lifetime score (leaderboard metric) |
| `commits_current` | XP-alike within current tier |
| `energy` | 0–max; tap cost = 1 |
| `depression_level` | 0–100; reduces tap efficiency, triggers burnout |
| `tier` | 1–5 (Junior → CTO) |
| `inventory` | JSONB: coffee_cups, etc. |
| `daily_quests_state` | JSONB: quest progress blob |
| `career_story` | JSONB: unlocked narrative beats |

Recovery (offline energy regen + depression decay) is computed on read in `recoverProgression()`.

### 4.3 Level / Rank System (`backend/src/utils/vnext.js`)

- Separate from `progression.tier`: a parallel XP-based leveling system.
- Ranks: Junior → Middle → Senior → Lead → CTO.
- Each rank has multiple `levelInRank` steps.
- `commitsPerTap` and `maxEnergy` are derived from resolved rank meta.

### 4.4 Economy Balance

All tunables live in `backend/src/config/balance.js`:

- `TAP_MECHANICS` — crit chances, depression gain, burnout multiplier, streak bonus.
- `STAGE2` — daily quest pools, pass season config, streak rewards, rewarded video.
- `STAGE3` — team hackathon, daily battles, referral milestones, share cards.
- `STAGE4` — rotating live events, career story beats, audio config.

### 4.5 Anti-Cheat & Rate Limiting

- **Rate limit:** Per-IP + per-user sliding window in PostgreSQL (`middleware/rateLimit.js`).
- **Anti-cheat:** In-memory tap-pattern analysis (`middleware/antiCheat.js`). Flags/bans suspicious rhythmic tapping. Metrics logged to `audit_logs`.
- **Referral antifraud:** IP limit (5/day hard reject), device-fingerprint multi-referrer check (`backend/src/routes/state.js`).

### 4.6 Context Offers

Dynamic in-game offers triggered by state thresholds (low energy, high stress, near rank-up). Rules defined in `CONTEXT_OFFER_RULES`. Impressions tracked in `offer_impressions` table. Cooldowns enforced in SQL + memory.

---

## 5. Component Interaction Map

```
┌─────────────────────────────────────────────────────────────┐
│                      Telegram Cloud                          │
│  (BotFather, Payments, WebApp container, Haptics)           │
└─────────────┬───────────────────────────────┬───────────────┘
              │                               │
        Webhook │                       Mini App URL
              │                               │
    ┌─────────▼─────────┐         ┌───────────▼────────────┐
    │   Bot (Vercel)    │         │   Frontend (Vercel)    │
    │  api/webhook.js   │         │   Preact + Phaser      │
    │  api/invoice-link │         │   useGameState         │
    └─────────┬─────────┘         └───────────┬────────────┘
              │                               │
              │  X-Bot-Backend-Secret         │ X-Telegram-Init-Data
              │                               │
    ┌─────────▼───────────────────────────────▼────────────┐
    │              Backend API (Express / Node)            │
    │  /api/tap  /api/state  /api/buy  /api/battle  …     │
    │  /api/internal/payments  /api/internal/observation  │
    └─────────────────────────┬────────────────────────────┘
                              │
                         node-postgres (pg)
                              │
    ┌─────────────────────────▼────────────────────────────┐
    │              PostgreSQL (Yandex Cloud / local)       │
    │  users, progression, sessions, purchases, battles,   │
    │  events, daily_quests, player_passes, audit_logs, …  │
    └──────────────────────────────────────────────────────┘
```

---

## 6. Entry Points

| Component | File | Command / Trigger |
|-----------|------|-------------------|
| Backend dev | `backend/src/index.js` | `npm run dev` (nodemon) |
| Backend prod | `backend/src/index.js` | `node src/index.js` or Docker |
| Backend migrations | `backend/src/migrate.js` | `npm run migrate` |
| Frontend dev | `frontend/src/main.jsx` | `npm run dev` (vite) |
| Frontend build | `frontend/src/main.jsx` | `npm run build` |
| Bot polling (debug) | `bot/index.js` | `ENABLE_POLLING_BOT=true node index.js` |
| Bot webhook (prod) | `bot/api/webhook.js` | Vercel serverless function |
| Bot invoice link | `bot/api/invoice-link.js` | Vercel serverless function |

---

## 7. Deployment Topology

- **Frontend:** Vercel (static + serverless functions for bot)
- **Backend:** Docker container on Yandex Cloud / VM behind nginx
- **Database:** Managed PostgreSQL (Yandex Cloud)
- **Bot webhook:** Vercel endpoint registered with BotFather
- **Domain:** TLS terminated at host-level nginx + certbot (`coder-survival-api.duckdns.org`)

The `nginx/` directory contains a **legacy reference config**; production uses host-level nginx rather than container nginx.

---

## 8. Testing & Quality

| Test Type | Location | Runner |
|-----------|----------|--------|
| Backend unit/integration | `backend/tests/` | Jest (`npm test`) |
| Smoke tests | `backend/tests/smoke.*.test.js` | Jest |
| Oracle/contract tests | `backend/tests/stage*.oracles.test.js` | Jest |

Test helpers (`backend/tests/helpers/`):
- `testDb.js` — spins up test DB connection
- `testServer.js` — mounts Express app for HTTP-level tests

---

## 9. Notable Design Decisions

1. **No ORM.** Raw SQL keeps query optimization explicit and aligns with the team’s PostgreSQL-centric observability.
2. **No shared code package.** `shared/` exists but is empty. Backend/frontend contracts are implicit and enforced by integration tests.
3. **Stateless API.** All user state is in PostgreSQL; sessions are just audit rows. No Redis or in-memory session store.
4. **Client-side tap queue.** Frontend queues taps and flushes sequentially to avoid race conditions and give instant feedback.
5. **Balance as code.** All game-economy constants are in one JS module with runtime assertions.
6. **A/B testing via feature_flags.** Stored on `users` row (JSONB); cohorts computed deterministically (`telegram_id % 100`).
