# Coder Survival — Technology Stack

> Generated: 2026-05-20  
> Scope: backend, frontend, bot, infrastructure, CI/CD

---

## 1. Languages

| Language | Where | Notes |
|----------|-------|-------|
| **JavaScript (ES modules)** | backend, frontend, bot, scripts | `"type": "module"` in all `package.json` files; `import`/`export` syntax throughout |
| **SQL** | `backend/migrations/`, `observation/` | PostgreSQL DDL/DML; 23 numbered migration files |
| **PowerShell** | `scripts/*.ps1` | Production release, smoke tests, DNS update, VM setup |
| **Bash** | `backend/deploy.sh`, `scripts/deploy.sh` | Legacy; deprecated in favor of PowerShell |
| **CSS** | `frontend/src/assets/animations.css`, component CSS | Plain CSS, no preprocessor |

---

## 2. Runtime & Engines

| Component | Engine | Minimum Version | Source |
|-----------|--------|-----------------|--------|
| Backend | Node.js | `>=20.0.0` | `backend/package.json` engines |
| Frontend build | Node.js | 20 (used in CI) | `.github/workflows/ci.yml` |
| Bot | Node.js | `>=18.0.0` | `bot/package.json` engines |
| Production containers | `node:20-alpine` | — | All Dockerfiles |

---

## 3. Monorepo Structure

```
backend/      — Express REST API, PostgreSQL client, game logic
frontend/     — Preact + Phaser 3 Telegram Mini App
bot/          — Telegram bot (grammy), Vercel serverless functions
nginx/        — Legacy reference nginx config
shared/       — Empty (reserved)
calculator/   — Standalone revenue model script
analytics/    — Amplitude event taxonomy & integration helpers
observation/  — SQL dashboards / operator queries
scripts/      — PowerShell release & operational tooling
payments/     — Legacy docs only (empty dir)
ads/          — Ad network research & integration specs
```

---

## 4. Backend (`backend/`)

### 4.1 Framework & Core Dependencies
- **`express`** `^4.18.2` — HTTP server, routing, middleware
- **`pg`** `^8.11.3` — PostgreSQL native driver (pool-based)
- **`helmet`** `^7.2.0` — Security headers middleware
- **`cors`** `^2.8.5` — CORS middleware
- **`dotenv`** `^16.4.7` — Environment variable loading

### 4.2 Dev & Test Dependencies
- **`jest`** `^29.7.0` — Unit & integration tests (run via `node --experimental-vm-modules`)
- **`nodemon`** `^3.0.2` — Hot reload in development

### 4.3 Configuration Files
- `backend/package.json` — Scripts, dependencies, engine constraints
- `backend/.env` / `backend/.env.example` — Runtime env vars (DB, Telegram tokens, rate limits)
- `backend/docker-compose.yml` — Local dev compose (PostgreSQL 16 + backend app with hot-reload)
- `backend/Dockerfile` — Multi-stage build (`node:20-alpine` → production image)
- `backend/src/config/balance.js` — Game balance constants (Stages 2–4)

### 4.4 Application Architecture
- **Entry:** `backend/src/index.js` — Express app setup, route mounting, pool config, graceful shutdown
- **Migrations:** `backend/src/migrate.js` — Schema migration runner (file-based, transactional)
- **Middleware:**
  - `initData.js` — Telegram WebApp `initData` HMAC-SHA256 verification
  - `rateLimit.js` — Tap rate limiting
  - `antiCheat.js` — Anti-cheat heuristics
  - `errorHandler.js` — Centralized error response formatting
- **Routes (~20):** tap, state, buy, leaderboard, referral, playerLevel, quests, shop, battle, event, events, pass, team, offers, rewards, coffee, teamBattle, skins, onboarding, streak, rewardedVideo, internalPayments, internalObservation
- **Jobs:** `backend/src/jobs/balanceAudit.js` — Periodic balance anomaly detection (5 min interval)

---

## 5. Frontend (`frontend/`)

### 5.1 Framework & Libraries
- **`preact`** `^10.19.3` — ~10KB React alternative; JSX runtime
- **`phaser`** `^3.60.0` — WebGL/Canvas 2D game engine (pixel-art scenes)
- **`@preact/preset-vite`** `^2.8.1` — Vite plugin for Preact JSX/refresh

### 5.2 Build Tool: Vite
- **Config:** `frontend/vite.config.js`
  - Preact preset with React compat aliases (`react` → `preact/compat`)
  - Manual chunk splitting: `phaser` isolated into its own chunk
  - Bundle visualizer via `rollup-plugin-visualizer` (mode `analyze`)
  - Dev proxy: `/api` → `http://localhost:3000`
  - Build target: `es2020`

### 5.3 Scripts
```json
"dev": "vite"
"build": "vite build"
"preview": "vite preview"
"analyze": "vite build --mode analyze"
```

### 5.4 Configuration Files
- `frontend/package.json`
- `frontend/index.html` — Inline viewport/Telegram meta, loads `telegram-web-app.js`
- `frontend/vite.config.js`
- `frontend/vercel.json` — Rewrite rules: `/api/(.*)` → `https://coder-survival-api.duckdns.org/api/$1`

### 5.5 Frontend Architecture
- **Entry:** `src/main.jsx` → renders `App.jsx` into `#app`
- **State:** `src/hooks/useGameState.js` — Server-authoritative game state sync
- **Telegram wrapper:** `src/hooks/useTelegram.js` — Haptic feedback, share links, MainButton
- **API client:** `src/utils/api.js` — Fetch wrapper with `X-Telegram-Init-Data` header
- **Game layer:** `src/game/PhaserGame.js` + `src/game/scenes/BootScene.js` / `GameScene.js`
- **Audio:** `src/utils/AudioManager.js` + `src/utils/sfx/` (actions, core, progression, states)
- **Purchases:** `src/utils/purchases.js` — Telegram Stars invoice flow
- **Ads:** `src/utils/AdsManager.js` — Provider-agnostic rewarded video abstraction

---

## 6. Bot (`bot/`)

### 6.1 Framework & Dependencies
- **`grammy`** `^1.38.4` — Telegram Bot API framework (webhook + polling support)
- **`dotenv`** `^16.4.7` — Env loading

### 6.2 Runtime Modes
1. **Production:** Vercel serverless function (`bot/api/webhook.js`) — webhook callback with secret token
2. **Local debug:** `bot/index.js` — polling mode (gated by `ENABLE_POLLING_BOT=true`)

### 6.3 Serverless Functions (Vercel)
- `bot/api/webhook.js` — Main Telegram webhook handler
- `bot/api/invoice-link.js` — Creates Telegram `createInvoiceLink` via Bot API

### 6.4 Configuration Files
- `bot/package.json`
- `bot/vercel.json` — Function memory (`1024MB`) and max duration (`10s`) for webhook
- `bot/.env.example` — `BOT_TOKEN`, `WEBAPP_URL`, `API_URL`, `TELEGRAM_WEBHOOK_SECRET`, `BOT_BACKEND_SECRET`, `BOT_USERNAME`

---

## 7. Database

| Aspect | Detail |
|--------|--------|
| **Engine** | PostgreSQL 16 (local dev) / PostgreSQL 15 (CI) |
| **Driver** | `pg` (node-postgres) Pool |
| **Migrations** | 23 numbered `.sql` files in `backend/migrations/` (001–022, 016–019 etc.) |
| **Migration runner** | Custom `backend/src/migrate.js` (tracks `schema_migrations` table) |
| **Production host** | Yandex Cloud Managed PostgreSQL (`rc1a-rt2j8d332gf773ap.mdb.yandexcloud.net:6432`) |
| **SSL** | `rejectUnauthorized: false` in production |

### 7.1 Key Tables (inferred from routes)
- `users`, `progression`, `sessions`, `purchases`, `star_payments`
- `daily_quests`, `login_rewards`, `streaks`
- `teams`, `team_battle_seasons`, `team_battle_contributions`, `team_battle_reward_claims`
- `ad_reward_sessions`, `ad_rewards`, `audit_logs`, `schema_migrations`
- `referrals`, `offers`, `events`, `player_levels`

---

## 8. Containerization

### 8.1 Images
| Service | Base Image | Dockerfile |
|---------|------------|------------|
| Backend | `node:20-alpine` (multi-stage) | `backend/Dockerfile` |
| Frontend | `node:20-alpine` builder → `nginx:alpine` | `frontend/Dockerfile` |
| Bot | `node:20-alpine` (multi-stage) | `bot/Dockerfile` |
| Nginx (legacy) | `nginx:alpine` | `nginx/Dockerfile` |

### 8.2 Compose Files
- **`backend/docker-compose.yml`** — Local dev: PostgreSQL 16 + backend with volume-mounted `src/` for hot reload
- **`docker-compose.backend.yml`** — Production compose (backend-only, pulls from YCR)
- **`docker-compose.prod.yml`** — Legacy full-stack compose (frontend + backend + bot); not used in current prod path

### 8.3 Container Registry
- **Yandex Container Registry:** `cr.yandex/crpduv7gci2puq300f38/coder-survival-backend:latest`

---

## 9. CI/CD

### 9.1 GitHub Actions (`.github/workflows/`)

| Workflow | File | Trigger | What it does |
|----------|------|---------|--------------|
| **CI** | `ci.yml` | Push/PR on any branch | Install backend deps → run integration/smoke tests with Postgres 15 → install frontend deps → build frontend |
| **Backend Tests** | `backend-tests.yml` | Push/PR on `backend/**` | Dedicated Jest run with Postgres 15 service |
| **Battle Distribution** | `battle-distribute.yml` | Daily cron (`5 0 * * *`) + manual | Calls `/api/battle/distribute` via secrets |
| **Manual Release** | `manual-release.yml` | `workflow_dispatch` | PowerShell-based release: preflight checks → Vercel deploy (frontend + bot) → SSH to VM → Docker build + migrate + restart backend → smoke tests |

### 9.2 Runner Configuration
- Default: `ubuntu-latest`
- Node 20 via `actions/setup-node@v4`
- PostgreSQL 15 service container for test jobs

---

## 10. Build & Deploy Scripts

| Script | Path | Purpose |
|--------|------|---------|
| `release-prod.ps1` | `scripts/release-prod.ps1` | Full production release (Vercel + VM backend + smoke) |
| `smoke-prod.ps1` | `scripts/smoke-prod.ps1` | Post-deploy health & offer smoke tests |
| `smoke-offers.ps1` | `scripts/smoke-offers.ps1` | Offer system validation |
| `set-api-origin.ps1` | `scripts/set-api-origin.ps1` | Rewrites `frontend/vercel.json` API origin |
| `duckdns-update.ps1` | `scripts/duckdns-update.ps1` | Updates DuckDNS A record for API subdomain |
| `domain-cutover-check.ps1` | `scripts/domain-cutover-check.ps1` | DNS cutover validation |
| `observe-economy.ps1` | `scripts/observe-economy.ps1` | Economy health checks |
| `setup-api-host-on-vm.ps1` | `scripts/setup-api-host-on-vm.ps1` | VM provisioning helper |

---

## 11. Environment Variable Conventions

### 11.1 Backend (`backend/.env.example`)
```
NODE_ENV=development
PORT=3000
DATABASE_URL / DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD / DB_PASS
BOT_TOKEN
WEBAPP_URL
RATE_LIMIT_MAX_TAPS_PER_SECOND
RATE_LIMIT_SOFT_BAN_THRESHOLD
RATE_LIMIT_DAILY_CAP_PER_IP
INIT_DATA_MAX_AGE_SECONDS
BOT_BACKEND_SECRET
TIER_THRESHOLDS
```

### 11.2 Bot (`bot/.env.example`)
```
BOT_TOKEN
WEBAPP_URL
API_URL
TELEGRAM_WEBHOOK_SECRET
BOT_BACKEND_SECRET
BOT_USERNAME
```

### 11.3 Root (`.env.example`)
```
DB_HOST (Yandex Cloud host)
DB_PORT=6432
DB_NAME=codersurvival
DB_USER=codersurvival
DB_PASSWORD
BOT_TOKEN
BOT_BACKEND_SECRET
WEBAPP_URL
INIT_DATA_MAX_AGE_SECONDS
```

---

## 12. Notable Absences

- **No TypeScript** — Pure JavaScript with JSDoc-style comments in docs
- **No ORM** — Raw SQL via `pg` driver
- **No frontend router** — Single-page Mini App with no URL routing
- **No CSS framework** — Inline styles + plain CSS files
- **No state management library** — Custom `useGameState` hook
- **No Redis / caching layer** — PostgreSQL is the sole data store
- **No message queue** — Battle distribution triggered by GitHub Actions cron
