<!-- GSD:project-start source:PROJECT.md -->
## Project

**Coder Survival**

Coder Survival — Telegram Mini App для программистов, где "тап = строки кода". Игрок управляет двумя ресурсами (энергией и депрессией), прокачивает уровни, проходит IT-тематические мини-игры, генерирует мемы из игрового состояния и соревнуется с коллегами в рабочих чатах. Основная цель — дать разработчику 5 минут веселья и возможность посмеяться над собственным выгоранием.

**Core Value:** «Coder Survival – это место, где программист приходит поржать над своим выгоранием, устроить мини‑баттл с коллегой и на 5 минут забыть про дедлайны.»

### Constraints

- **Tech stack:** Node.js 20, Express 4, PostgreSQL, Preact 10, Phaser 3.60, grammy, Vite 5. Сохраняем текущий стек.
- **Timeline:** дорожная карта рассчитана на 2–3 месяца (9 недель).
- **Platform:** Telegram Mini App — ограничения WebView, работа через initData.
- **Compatibility:** должен работать на мобильных устройствах (основная платформа Mini App).
- **Performance:** бэкенд на Express + PostgreSQL без кэширующего слоя — нужно держать горячие пути лёгкими.
- **Security:** нельзя допустить подделку игровых переменных — мемы и ачивки формируются на бэкенде.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## 1. Languages
| Language | Where | Notes |
|----------|-------|-------|
| **JavaScript (ES modules)** | backend, frontend, bot, scripts | `"type": "module"` in all `package.json` files; `import`/`export` syntax throughout |
| **SQL** | `backend/migrations/`, `observation/` | PostgreSQL DDL/DML; 23 numbered migration files |
| **PowerShell** | `scripts/*.ps1` | Production release, smoke tests, DNS update, VM setup |
| **Bash** | `backend/deploy.sh`, `scripts/deploy.sh` | Legacy; deprecated in favor of PowerShell |
| **CSS** | `frontend/src/assets/animations.css`, component CSS | Plain CSS, no preprocessor |
## 2. Runtime & Engines
| Component | Engine | Minimum Version | Source |
|-----------|--------|-----------------|--------|
| Backend | Node.js | `>=20.0.0` | `backend/package.json` engines |
| Frontend build | Node.js | 20 (used in CI) | `.github/workflows/ci.yml` |
| Bot | Node.js | `>=18.0.0` | `bot/package.json` engines |
| Production containers | `node:20-alpine` | — | All Dockerfiles |
## 3. Monorepo Structure
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
- **Routes (~20):** tap, state, buy, leaderboard, referral, playerLevel, quests, shop, battle, event, events, pass, team, offers, rewards, coffee, teamBattle, skins, onboarding, streak, rewardedVideo, internalPayments, internalObservation
- **Jobs:** `backend/src/jobs/balanceAudit.js` — Periodic balance anomaly detection (5 min interval)
## 5. Frontend (`frontend/`)
### 5.1 Framework & Libraries
- **`preact`** `^10.19.3` — ~10KB React alternative; JSX runtime
- **`phaser`** `^3.60.0` — WebGL/Canvas 2D game engine (pixel-art scenes)
- **`@preact/preset-vite`** `^2.8.1` — Vite plugin for Preact JSX/refresh
### 5.2 Build Tool: Vite
- **Config:** `frontend/vite.config.js`
### 5.3 Scripts
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
## 6. Bot (`bot/`)
### 6.1 Framework & Dependencies
- **`grammy`** `^1.38.4` — Telegram Bot API framework (webhook + polling support)
- **`dotenv`** `^16.4.7` — Env loading
### 6.2 Runtime Modes
### 6.3 Serverless Functions (Vercel)
- `bot/api/webhook.js` — Main Telegram webhook handler
- `bot/api/invoice-link.js` — Creates Telegram `createInvoiceLink` via Bot API
### 6.4 Configuration Files
- `bot/package.json`
- `bot/vercel.json` — Function memory (`1024MB`) and max duration (`10s`) for webhook
- `bot/.env.example` — `BOT_TOKEN`, `WEBAPP_URL`, `API_URL`, `TELEGRAM_WEBHOOK_SECRET`, `BOT_BACKEND_SECRET`, `BOT_USERNAME`
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
## 11. Environment Variable Conventions
### 11.1 Backend (`backend/.env.example`)
### 11.2 Bot (`bot/.env.example`)
### 11.3 Root (`.env.example`)
## 12. Notable Absences
- **No TypeScript** — Pure JavaScript with JSDoc-style comments in docs
- **No ORM** — Raw SQL via `pg` driver
- **No frontend router** — Single-page Mini App with no URL routing
- **No CSS framework** — Inline styles + plain CSS files
- **No state management library** — Custom `useGameState` hook
- **No Redis / caching layer** — PostgreSQL is the sole data store
- **No message queue** — Battle distribution triggered by GitHub Actions cron
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## 1. Language & Module System
- **ES Modules everywhere**: all three packages set `"type": "module"` in `package.json`.
- **Node.js runtime**: backend requires `>=20`, bot requires `>=18`.
- **No transpilation**: backend and bot run native Node.js ESM; frontend is built with Vite.
## 2. File Naming
| Package | Pattern | Examples |
|---------|---------|----------|
| Backend | camelCase for utils/middleware/config; lowercase for routes | `errorHandler.js`, `dailyQuests.js`, `tap.js`, `state.js` |
| Frontend | PascalCase components; camelCase hooks/utils | `StatsBar.jsx`, `TapArea.jsx`, `useGameState.js`, `api.js` |
| Bot | camelCase | `createBot.js` |
- Route files export a default `Router` instance: `export default router;`
- Utility files export named functions: `export function calculateTapDelta(...) { ... }`
## 3. Code Style
### Quotes
### Semicolons
### Indentation
### Trailing commas
## 4. Naming Conventions
| Category | Convention | Example |
|----------|-----------|---------|
| Constants (game balance) | `UPPER_SNAKE_CASE` | `TAP_MECHANICS`, `STRESS_V2`, `CONTEXT_OFFER_RULES` |
| Exported functions | camelCase | `calculateTapDelta`, `recoverProgression` |
| Local variables | camelCase | `userId`, `progressRow`, `newEnergy` |
| React/Preact components | PascalCase | `StatsBar`, `TapArea` |
| Private helpers | camelCase (no `_` prefix) | `getRecoveryAnchor`, `toValidDate` |
| Database columns | snake_case | `commits_total`, `depression_level`, `last_active` |
| API response fields | camelCase preferred, snake_case legacy allowed | `commitsTotal` (new), `commits_total` (legacy compat) |
## 5. Import Order
## 6. Error Handling
### Backend
- **Route handlers** wrap DB work in `try / finally` with `client.release()`.
- **Transactions** use explicit `BEGIN / COMMIT / ROLLBACK`.
- **Global error handler** (`backend/src/middleware/errorHandler.js`) maps PostgreSQL error codes and JWT errors to HTTP status codes.
- Rollback failures are swallowed intentionally to preserve the original error:
### Frontend
- API errors are thrown as `ApiError` instances with `status` and `payload`.
- UI errors surface via a toast system in `useGameState.js`.
## 7. Logging & Analytics
- `console.error` for actual errors and unhandled rejections.
- `console.log` is used as a lightweight **event/analytics stream** with structured objects:
- Graceful shutdown hooks log `SIGTERM` / `SIGINT`.
- `unhandledRejection` and `uncaughtException` handlers exist in `backend/src/index.js` and `bot/index.js`.
## 8. Architectural Patterns
### Backend
- **Express router-per-feature**: each domain (`tap`, `state`, `quests`, `battle`, etc.) has its own file in `backend/src/routes/`.
- **Middleware stack**: `initDataMiddleware` (Telegram auth) → route handler → `errorHandler`.
- **PG pool**: single shared `Pool` exported from `backend/src/index.js`; routes import it directly.
- **Config-as-code**: game balance constants live in `backend/src/config/balance.js` with `console.assert` validations.
### Frontend
- **Preact** (React alternative) with `h()` hyperscript instead of JSX.
- **Context + Hooks** state management: `GameContext` in `frontend/src/hooks/useGameState.js`.
- **Phaser** game layer runs inside a Preact component (`PhaserGame.js`).
- **Inline styles**: no CSS-in-JS library; styles are plain objects passed to the `style` prop.
### Bot
- **Grammy** framework for Telegram Bot API.
- **Dual runtime**: Vercel serverless webhook (`bot/api/webhook.js`) for production; legacy polling entrypoint (`bot/index.js`) for local debugging guarded by `ENABLE_POLLING_BOT=true`.
## 9. Linting & Formatting
- **No ESLint, Prettier, or EditorConfig** is configured in any package.
- Style is maintained manually. When editing, match the dominant quoting and spacing style of the target file.
## 10. Environment Configuration
- `.env` files are loaded explicitly with `dotenv`:
- `bot/index.js` uses `import 'dotenv/config'` (auto-load from cwd).
- Frontend uses Vite env vars: `import.meta.env.VITE_API_BASE_URL`.
## 11. Comments
- Mixed Russian and English comments. Core logic comments are often in Russian; JSDoc-style headers are in English.
- Large feature blocks are delimited with ASCII line comments:
## 12. Database Conventions
- PostgreSQL with parameterized queries (`$1`, `$2`, …).
- `ON CONFLICT` used for upserts.
- JSONB columns store flexible state (`daily_quests_state`, `pass_state`, `career_story`).
- `FOR UPDATE` row locking inside transactions for mutable operations (claim, tap, etc.).
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## 1. High-Level Pattern
| Component | Technology | Responsibility |
|-----------|-----------|----------------|
| **Frontend** | Preact + Vite + Phaser 3 | Game UI, tap interactions, WebGL rendering, audio |
| **Backend** | Express + node-postgres | API, game logic, economy, persistence, observability |
| **Bot** | Grammy (Telegram Bot Framework) | Webhook handler, payment flow, Mini App entrypoint |
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
## 3. Data Flow
### 3.1 Typical Tap Flow
```
```
### 3.2 State Hydration Flow
```
```
### 3.3 Purchase Flow (Telegram Stars)
```
```
## 4. Key Abstractions
### 4.1 Telegram InitData Authentication
- Every protected route uses `initDataMiddleware` (`backend/src/middleware/initData.js`).
- Verifies HMAC-SHA256 signature against `BOT_TOKEN`.
- Parses `user`, `auth_date`, `start_param` into `req.telegramUser`.
- Dev fallback: if no `BOT_TOKEN` in non-production, parses initData without verification.
### 4.2 Game State Model
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
### 4.3 Level / Rank System (`backend/src/utils/vnext.js`)
- Separate from `progression.tier`: a parallel XP-based leveling system.
- Ranks: Junior → Middle → Senior → Lead → CTO.
- Each rank has multiple `levelInRank` steps.
- `commitsPerTap` and `maxEnergy` are derived from resolved rank meta.
### 4.4 Economy Balance
- `TAP_MECHANICS` — crit chances, depression gain, burnout multiplier, streak bonus.
- `STAGE2` — daily quest pools, pass season config, streak rewards, rewarded video.
- `STAGE3` — team hackathon, daily battles, referral milestones, share cards.
- `STAGE4` — rotating live events, career story beats, audio config.
### 4.5 Anti-Cheat & Rate Limiting
- **Rate limit:** Per-IP + per-user sliding window in PostgreSQL (`middleware/rateLimit.js`).
- **Anti-cheat:** In-memory tap-pattern analysis (`middleware/antiCheat.js`). Flags/bans suspicious rhythmic tapping. Metrics logged to `audit_logs`.
- **Referral antifraud:** IP limit (5/day hard reject), device-fingerprint multi-referrer check (`backend/src/routes/state.js`).
### 4.6 Context Offers
## 5. Component Interaction Map
```
```
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
## 7. Deployment Topology
- **Frontend:** Vercel (static + serverless functions for bot)
- **Backend:** Docker container on Yandex Cloud / VM behind nginx
- **Database:** Managed PostgreSQL (Yandex Cloud)
- **Bot webhook:** Vercel endpoint registered with BotFather
- **Domain:** TLS terminated at host-level nginx + certbot (`coder-survival-api.duckdns.org`)
## 8. Testing & Quality
| Test Type | Location | Runner |
|-----------|----------|--------|
| Backend unit/integration | `backend/tests/` | Jest (`npm test`) |
| Smoke tests | `backend/tests/smoke.*.test.js` | Jest |
| Oracle/contract tests | `backend/tests/stage*.oracles.test.js` | Jest |
- `testDb.js` — spins up test DB connection
- `testServer.js` — mounts Express app for HTTP-level tests
## 9. Notable Design Decisions
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
