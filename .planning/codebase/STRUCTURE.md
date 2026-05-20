# Coder Survival — Repository Structure

> Date: 2026-05-20

---

## 1. Root Layout

```
coder_survival_repo_new/
├── .github/               # GitHub Actions workflows
├── .planning/             # Architecture and planning documents (this dir)
├── .zenflow/              # Task tracking metadata
├── .zenflow-attachments/  # Attachments for Zenflow tasks
├── ads/                   # Ad integration research docs
├── analytics/             # Amplitude event taxonomy, setup docs, SDK wrapper
├── backend/               # Express API + PostgreSQL
├── bot/                   # Telegram bot (Grammy) — webhook + polling
├── calculator/            # Revenue projection model
├── frontend/              # Preact + Phaser 3 Mini App
├── nginx/                 # Legacy nginx reference config
├── observation/           # SQL dashboards / operator queries
├── payments/              # Legacy directory (empty except README)
├── scripts/               # PowerShell deployment & smoke-test scripts
├── shared/                # Intentionally empty (no shared package yet)
├── support/               # FAQ and triage docs for support team
├── .env.example           # Root environment variable template
├── ANALYSIS.md            # Business analysis documents
├── AUDIO_INTEGRATION_PLAN.md
├── AUDIT_ECONOMY_2026-05-07.md
├── AUDIT_REQUIREMENTS.md
├── BACKEND_GAP_ENERGY_COUNTDOWN.md
├── BOT_RUNTIME_PLAN.md
├── CLEANUP_PLAN.md
├── COLLABORATION_PLAN.md
├── COMMIT_PLAN.md
├── CONFLICT_MATRIX.md
├── DEPLOY.md
├── DOCS_DRIFT_AUDIT.md
└── … (additional planning/markdown files)
```

---

## 2. Backend (`backend/`)

```
backend/
├── migrations/                    # Sequential SQL migrations
│   ├── 001_init.sql
│   ├── 002_vnext_core.sql
│   ├── 003_referral_milestones.sql
│   ├── …
│   └── 022_stage4_emotional_depth.sql
├── src/
│   ├── index.js                   # Express app, route mounting, pool export
│   ├── migrate.js                 # File-based migration runner
│   ├── config/
│   │   └── balance.js             # All game-economy constants
│   ├── jobs/
│   │   └── balanceAudit.js        # Scheduled integrity checks
│   ├── middleware/
│   │   ├── antiCheat.js           # Tap-pattern fraud detection
│   │   ├── errorHandler.js        # Global Express error handler
│   │   ├── initData.js            # Telegram WebApp initData verification
│   │   └── rateLimit.js           # Per-user/per-IP rate limiting
│   ├── routes/
│   │   ├── battle.js              # PvP battle system
│   │   ├── buy.js                 # Purchase intent + item effect application
│   │   ├── coffee.js              # Coffee-break item usage
│   │   ├── event.js               # Live event contributions
│   │   ├── events.js              # Career-story / live-event queries
│   │   ├── internalObservation.js # Operator dashboard API (/api/internal/observation)
│   │   ├── internalPayments.js    # Telegram payment confirmation (/api/internal/payments)
│   │   ├── leaderboard.js         # Global ranking (public + authenticated)
│   │   ├── offers.js              # Context offer dismissal / interaction
│   │   ├── onboarding.js          # Tutorial completion tracking
│   │   ├── pass.js                # Sprint pass status & claims
│   │   ├── playerLevel.js         # Rank/level queries
│   │   ├── quests.js              # Daily quests & full-clear claims
│   │   ├── referral.js            # Referral status & milestones
│   │   ├── rewardedVideo.js       # Ad-reward cooldown & completion
│   │   ├── rewards.js             # Reward application helpers
│   │   ├── shop.js                # Product catalog endpoint
│   │   ├── skins.js               # Skin unlock & equip
│   │   ├── state.js               # Full state hydration (GET /api/state)
│   │   ├── streak.js              # Login streak status & claim
│   │   ├── tap.js                 # Core tap action (POST /api/tap)
│   │   ├── team.js                # Team creation / join / info
│   │   ├── teamBattle.js          # Team-wide battle events
│   │   └── teamHackathon.js       # Weekly team hackathon
│   └── utils/
│       ├── achievements.js        # Achievement check logic
│       ├── adProof.js             # Ad validation stubs
│       ├── battle.js              # Battle resolution math
│       ├── battleDistribution.js  # Battle reward distribution
│       ├── dailyQuests.js         # Quest progress math
│       ├── events.js              # Event lifecycle queries
│       ├── loginReward.js         # Login streak reward calculation
│       ├── offers.js              # Context-offer eligibility engine
│       ├── pass.js                # Pass XP & reward logic
│       ├── phase2State.js         # Phase-2 feature state aggregators
│       ├── progression.js         # Energy recovery, depression decay
│       ├── referral.js            # Referral milestone math
│       ├── rewards.js             # Generic reward applicator
│       ├── shopCatalog.js         # PRODUCT_CATALOG definition
│       ├── streak.js              # Streak calculation
│       ├── teamHackathon.js       # Hackathon target math
│       ├── teams.js               # Team DB helpers
│       └── vnext.js               # Level/rank system & daily-quest orchestration
├── tests/
│   ├── helpers/
│   │   ├── testDb.js              # Test database bootstrap
│   │   └── testServer.js          # Express test server factory
│   ├── phase2.integration.test.js
│   ├── phase2.unit.test.js
│   ├── smoke.idleEnergyRegen.test.js
│   ├── stage2.oracles.test.js
│   ├── stage2.rewardedVideo.test.js
│   ├── stage2.routes.test.js
│   ├── stage3.oracles.test.js
│   └── stage4.oracles.test.js
├── .env
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

**Key naming conventions:**
- Routes: `kebab-case.js` matching the API path segment (`teamHackathon.js` for `/api/team/hackathon`).
- Utils: camelCase noun describing the domain (`shopCatalog.js`, `progression.js`).
- SQL migrations: `NNN_descriptive_snake_case.sql`, zero-padded, applied in lexical order.

---

## 3. Frontend (`frontend/`)

```
frontend/
├── public/                        # Static assets (audio, images)
├── src/
│   ├── App.jsx                    # Root component: layout + modal composition
│   ├── main.jsx                   # Preact render entrypoint
│   ├── assets/
│   │   └── animations.css         # Shared CSS animations
│   ├── components/
│   │   ├── AudioSettings.jsx / .css
│   │   ├── AudioToggle.jsx
│   │   ├── BattleCard.jsx
│   │   ├── CareerModal.jsx
│   │   ├── ContextOfferBanner.jsx
│   │   ├── CrunchTimeBanner.jsx
│   │   ├── DailyBattlePanel.jsx
│   │   ├── DailyQuests.jsx
│   │   ├── DailyQuestsPanel.jsx
│   │   ├── EventBanner.jsx
│   │   ├── EventPanel.jsx
│   │   ├── LeaderboardPanel.jsx
│   │   ├── LevelUpModal.jsx
│   │   ├── MemeGenerator.jsx
│   │   ├── MiniGameDebug.jsx
│   │   ├── OnboardingModal.jsx
│   │   ├── OnboardingOverlay.jsx
│   │   ├── PassPanel.jsx
│   │   ├── ReferralChainPanel.jsx
│   │   ├── ReferralPanel.jsx
│   │   ├── RewardedVideo.jsx
│   │   ├── ShareButton.jsx
│   │   ├── ShopPanel.jsx
│   │   ├── SkinPanel.jsx
│   │   ├── SprintPassPanel.jsx
│   │   ├── StatsBar.jsx
│   │   ├── StreakCalendar.jsx
│   │   ├── TapArea.jsx
│   │   ├── TeamBattle.jsx
│   │   └── TeamPanel.jsx
│   ├── game/
│   │   ├── PhaserGame.js          # Phaser bootstrap + resize handling
│   │   └── scenes/
│   │       ├── BootScene.js       # Procedural texture generation
│   │       └── GameScene.js       # Main gameplay scene (desk, avatar, particles)
│   ├── hooks/
│   │   ├── useGameState.js        # Central game context + API orchestration
│   │   └── useTelegram.js         # Telegram WebApp bridge context
│   └── utils/
│       ├── AdsManager.js          # Ad placement wrapper (AdsGram)
│       ├── api.js                 # HTTP client + dev initData helper
│       ├── AudioManager.js        # Web Audio API + BGM controller
│       ├── canvasTemplates.js     # Meme/share card canvas generators
│       ├── purchases.js           # Frontend purchase flow helpers
│       ├── rewardFormatting.js    # Human-readable reward strings
│       ├── shareMeme.js           # Telegram share via canvas image
│       ├── SFX_REGISTRY.js        # Procedural sound-effect definitions
│       └── sfx/
│           ├── actions.js
│           ├── core.js
│           ├── progression.js
│           └── states.js
├── .gitignore
├── Dockerfile
├── index.html
├── package.json
├── package-lock.json
├── README.md
└── vite.config.js
```

**Key naming conventions:**
- Components: PascalCase `.jsx` files (`ShopPanel.jsx`).
- Hooks: camelCase prefixed with `use` (`useGameState.js`).
- Utils: camelCase nouns (`AudioManager.js`, `api.js`).
- Game scenes: PascalCase scene name (`BootScene.js`, `GameScene.js`).

---

## 4. Bot (`bot/`)

```
bot/
├── api/
│   ├── invoice-link.js            # Vercel serverless: Telegram invoice link creation
│   └── webhook.js                 # Vercel serverless: Grammy webhook callback
├── src/
│   └── createBot.js               # Bot factory: commands, payment handlers, error catch
├── .vercel/                       # Vercel deployment metadata
├── .env.example
├── .gitignore
├── bot-local.err.log
├── bot-local.log
├── Dockerfile
├── index.js                       # Legacy polling entrypoint (debug only)
├── package.json
└── README.md
```

**Key naming conventions:**
- Vercel serverless handlers: kebab-case (`invoice-link.js`, `webhook.js`).
- Core logic: camelCase (`createBot.js`).

---

## 5. Supporting Directories

### 5.1 Analytics (`analytics/`)

| File | Purpose |
|------|---------|
| `CANONICAL_EVENT_TAXONOMY.md` | Amplitude event naming reference |
| `WEEKLY_BALANCE_REVIEW_TEMPLATE.md` | Operator review checklist |
| `amplitude-setup.md` | SDK integration instructions |
| `events.js` | Amplitude wrapper library (importable by frontend) |

### 5.2 Observation (`observation/`)

| File | Purpose |
|------|---------|
| `01_dau_retention.sql` | DAU, D1 retention, sticky factor |
| `02_daily_quests.sql` | Quest completion & bottleneck analysis |
| `03_context_offers.sql` | Offer impressions, dismiss rates, conversions |
| `04_weekly_hackathon.sql` | Hackathon participation & distribution |
| `05_sprint_pass.sql` | Pass level distribution & premium timing |
| `06_shop_purchases.sql` | Purchase funnel & revenue |
| `07_economy_health.sql` | Economy balance indicators |
| `08_stress_cohort_ab.sql` | A/B test cohort comparison |
| `09_phase2_metrics.sql` | Phase-2 feature adoption metrics |
| `OPERATOR_CHEATSHEET.md` | Quick reference for on-call operators |
| `README.md` | How to run observation queries |

### 5.3 Scripts (`scripts/`)

| File | Purpose |
|------|---------|
| `deploy.sh` | Docker build & push script |
| `domain-cutover-check.ps1` | DNS cutover validation |
| `duckdns-update.ps1` | Dynamic DNS updater |
| `observe-economy.ps1` | Run observation SQL against prod |
| `release-manual-checklist.md` | Human-readable release steps |
| `release-preflight.ps1` | Pre-deploy smoke checks |
| `release-prod.ps1` | Production release orchestration |
| `set-api-origin.ps1` | Configure frontend API base URL |
| `setup-api-host-on-vm.ps1` | VM provisioning helpers |
| `smoke-offers.ps1` | Offer system smoke test |
| `smoke-prod.ps1` | End-to-end production smoke test |
| `verify_phase1_release.sh` | Phase-1 release verification |

### 5.4 Ads (`ads/`)

| File | Purpose |
|------|---------|
| `ads-research.md` | Ad network comparison research |
| `rewarded-video.md` | Rewarded video integration spec |

### 5.5 Support (`support/`)

| File | Purpose |
|------|---------|
| `ENERGY_COUNTDOWN_FAQ.md` | Energy recovery FAQ for players |
| `GAMEPLAY_FAQ.md` | General gameplay questions |
| `SUPPORT_TRIAGE_CHECKLIST.md` | Support agent decision tree |

### 5.6 Calculator (`calculator/`)

| File | Purpose |
|------|---------|
| `revenue-model.js` | DAU→revenue projection class with tiered eCPM logic |

### 5.7 Nginx (`nginx/`)

| File | Purpose |
|------|---------|
| `codersurvival.conf` | Legacy reference: reverse-proxy rules for frontend + API |
| `Dockerfile` | Container build for legacy nginx (not used in prod) |

---

## 6. Environment & Configuration Files

| File | Scope | Variables |
|------|-------|-----------|
| `.env.example` (root) | All services | Shared template |
| `backend/.env` | Backend | `DATABASE_URL`, `BOT_TOKEN`, `PORT`, `BOT_BACKEND_SECRET`, `OBSERVATION_SECRET` |
| `backend/.env.example` | Backend | Same keys, placeholder values |
| `bot/.env.example` | Bot | `BOT_TOKEN`, `WEBAPP_URL`, `API_URL`, `BOT_BACKEND_SECRET`, `TELEGRAM_WEBHOOK_SECRET` |

Frontend env is compiled at build time via Vite:
- `VITE_API_BASE_URL` → `frontend/src/utils/api.js`

---

## 7. Database Schema Overview (via Migrations)

Core tables (evolved across 22 migrations):

| Table | Role |
|-------|------|
| `users` | Player identity, Telegram profile, feature_flags, last_active |
| `progression` | Core game state: energy, depression, commits, tier, inventory, quest/hackathon/career JSONB blobs |
| `sessions` | Per-session audit: taps_count, commits_earned, IP, timestamps |
| `daily_quests` | One row per user per quest per day |
| `sprint_passes` / `pass_rewards` / `player_passes` / `pass_claims` | Season pass system |
| `events` / `event_contributions` | Community events (hackathons, coffee week) |
| `teams` / `team_members` | Social teams |
| `battles` / `battle_participants` | PvP battle system |
| `purchases` / `star_payments` | Monetization: pending purchases + confirmed payments |
| `referrals` | Referral graph with antifraud fields (bind_ip, device_hash) |
| `offer_impressions` | Context offer analytics |
| `audit_logs` | General audit trail (actions as JSONB) |
| `schema_migrations` | Migration tracking (applied by `migrate.js`) |

---

## 8. Build & Deploy Artifacts

| Artifact | Location | Notes |
|----------|----------|-------|
| Frontend dist | `frontend/dist/` | Vite build output (SPA) |
| Backend Docker image | `cr.yandex/crpduv7gci2puq300f38/coder-survival-backend:latest` | Built via `backend/deploy.sh` |
| Bot runtime | Vercel functions | `bot/api/*.js` deployed as serverless |
| `.vercel` dirs | `frontend/.vercel/`, `bot/.vercel/` | Vercel project metadata |

---

## 9. Documentation Conventions

- `README.md` in each major directory explains local setup.
- `AGENTS.md` exists at root but is empty; the project relies on inline code comments and planning markdowns at root level.
- Planning documents use `SCREAMING_SNAKE_CASE.md` naming (`AUDIT_REQUIREMENTS.md`, `DEPLOY.md`, etc.).
- SQL observation files use `NN_topic_snake_case.sql` numbering.
- Backend tests use `stageN.descriptor.test.js` naming.
