# Coder Survival — Codebase Concerns Audit

**Date:** 2026-05-20  
**Scope:** Full repo (`backend/`, `frontend/`, `bot/`, `payments/`, `scripts/`, `observation/`, root docs)  
**Method:** Static analysis + audit document cross-reference (`AUDIT_ECONOMY_2026-05-07.md`, `RELEASE_OPS_RISKS_AUDIT.md`, `SYNC_AUDIT.md`, `CONFLICT_MATRIX.md`, `CLEANUP_PLAN.md`)

---

## 1. Critical Security Issues 🔴

### 1.1 SQL Injection in Leaderboard (`backend/src/routes/leaderboard.js:29–30`)
```javascript
const maxClause = bounds.max !== null ? `AND pl.xp_total < ${bounds.max}` : '';
rankWhere = `pl.xp_total >= ${bounds.min} ${maxClause}`;
```
`bounds.min` / `bounds.max` are interpolated directly into SQL. `getRankXpBounds()` returns static thresholds today, but if the function is ever modified to accept user input or dynamic config, this becomes an exploitable injection vector. **Fix:** use parameterized queries even for `rankWhere` fragments.

### 1.2 Unrestricted CORS (`backend/src/index.js:71`)
```javascript
app.use(cors());
```
No `origin` whitelist. In production this allows any domain to call the API with credentials. Given that `initData` is passed in headers, this weakens same-origin protections.

### 1.3 SSL `rejectUnauthorized: false` in Production (`backend/src/index.js:56–58`)
```javascript
ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
```
Production disables TLS certificate validation for PostgreSQL. Vulnerable to MITM attacks on the DB connection (Yandex Cloud Managed PostgreSQL).

### 1.4 Internal Payments Protected Only by Shared Secret (`backend/src/routes/internalPayments.js:8`)
```javascript
const BOT_BACKEND_SECRET = process.env.BOT_BACKEND_SECRET;
```
No IP whitelist on `/api/internal/payments`. If `BOT_BACKEND_SECRET` leaks (e.g., via logs, env dump, or social engineering), any actor can confirm arbitrary payments. **Related:** `backend/src/routes/internalObservation.js:9` uses the same secret pattern.

### 1.5 `backend/.env` Present in Repo
The file exists and is blocked by the sensitive-file filter. It is **not** in `.gitignore` at the repo root (only `backend/.env` and `backend/.env.production` are excluded in `release-prod.ps1`). Risk of accidental commit of live credentials.

### 1.6 `initData` Max-Age Default = 24 Hours (`backend/src/middleware/initData.js:30`)
```javascript
const maxAgeSeconds = parseInt(process.env.INIT_DATA_MAX_AGE_SECONDS || '86400', 10);
```
`.env.example` sets `INIT_DATA_MAX_AGE_SECONDS=3600`, but the code falls back to `86400` (24h). If the env var is missing in production, stale/expired `initData` signatures are accepted for a full day.

### 1.7 `trust proxy` = 1 Without Restriction (`backend/src/index.js:69`)
```javascript
app.set("trust proxy", 1);
```
Rate-limiting and IP-based auditing rely on `req.ip`. If the VM is exposed directly to the internet (no reverse-proxy), this is fine. If a CDN or load balancer is added later, client IP spoofing becomes possible without explicit proxy whitelist configuration.

---

## 2. Bugs & Logic Defects 🐛

### 2.1 `featureFlags: {}` Hardcoded — Blocks A/B Mechanics (`backend/src/routes/tap.js:192`)
```javascript
featureFlags: {}
```
`stress_v2` flag is always `false`. Consequently:
- `high_stress` offer threshold stays at `55` instead of intended `20`.
- Passive depression decay (`DEPRESSION_PASSIVE_DECAY_PER_HOUR: 5`) never applies.
Documented as **P0** in `CONFLICT_MATRIX.md` (C-002, C-003) and `SYNC_AUDIT.md` (5.6.4).

### 2.2 `streak_protect` Purchasable but No-Op (`backend/src/routes/buy.js:153–155`)
```javascript
case 'streak_protect':
  // TODO: логика защиты стрика
  return { streakProtected: true };
```
User pays Stars but receives no actual effect. The purchase is recorded as `completed` in `internalPayments.js` after `applyItemEffect` runs.

### 2.3 Rate-Limit Defaults Are Softer Than Documented (`backend/src/middleware/rateLimit.js:13–15`)
```javascript
const MAX_TAPS_PER_SECOND = parseInt(process.env.RATE_LIMIT_MAX_TAPS_PER_SECOND, 10) || 20;
const SOFT_BAN_THRESHOLD = parseInt(process.env.RATE_LIMIT_SOFT_BAN_THRESHOLD, 10) || 40;
```
`.env.example` intends `15` / `25`, but code defaults to `20` / `40`. If env vars are unset, protection is weaker than designed.

### 2.4 Referral Energy Race Condition (`backend/src/routes/referral.js:~338`)
Energy reward is computed in JS (`newEnergy = current + reward`) then written with `SET energy = $1`. Under concurrent tap + milestone claim, the lower value wins. Should use atomic `LEAST(maxEnergy, energy + $2)`.

### 2.5 `ensurePlayerLevel` Writes on Every Read (`backend/src/utils/vnext.js:73–79`)
```javascript
ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
```
Every `/api/state` and `/api/tap` call updates `player_levels`. Unnecessary write pressure; could be deferred to once-per-day or only when XP actually changes.

### 2.6 `updated_at` Missing on Some Progression Paths
`AUDIT_ECONOMY_2026-05-07.md` (2.11) flagged `energy_refill` update missing `updated_at`. Current `buy.js:114` includes `updated_at = NOW()`, so this may have been fixed. However, `coffee_break` path (`buy.js:121`) calls `applyReward` — verify that `applyReward` updates `updated_at` consistently.

### 2.7 Duplicate `getTierName` Functions (`backend/src/routes/state.js:227–236` and `backend/src/routes/leaderboard.js:160–169`)
Identical logic duplicated. If tier naming changes, both must be updated.

### 2.8 Smoke Tests Create Dirty State (`scripts/smoke-prod.ps1`)
Fixed `SmokeTelegramId = 900000001` accumulates production DB state (teams, offers, quests). No cleanup phase. Subsequent smoke runs may fail spuriously because energy is 0 or quests are already claimed.

---

## 3. Tech Debt & Fragile Areas 🏗️

### 3.1 Two Incompatible Pass Configs (`backend/src/config/balance.js`)
- `SPRINT_PASS_LEVELS` (865 XP total, 20 levels) — dead code.
- `STAGE2.PASS.LEVELS` (11 500 XP total, 20 levels) — active.
Math: 11 500 XP ≈ 49 days at casual pace, but season is 30 days. Documented as **P0** in `CONFLICT_MATRIX.md` (C-008) and `SYNC_AUDIT.md` (5.6.1).

### 3.2 Migration 004 Seeds Wrong Defaults
`backend/migrations/004_stage4_retention.sql` seeds:
- Weekly hackathon target = `500` (should be `650`).
- Sprint pass flat `30` XP per level (should be 20–80 curve).
`006_balance_tuning.sql` corrects this, but a fresh DB or restore without `006` runs with broken economy. `RELEASE_OPS_RISKS_AUDIT.md` (4.5) flags this.

### 3.3 `docker-compose.prod.yml` Contains Dead Services
`frontend` and `bot` services are defined but never used on the VM (they run on Vercel). Risk of accidental `docker-compose up` starting conflicting containers. `CLEANUP_PLAN.md` recommends archiving.

### 3.4 Legacy Polling Bot Entrypoint (`bot/index.js`)
Kept "only for local debugging". Production bot runs on Vercel webhook. VM cannot reach `api.telegram.org`. `package.json` `main` points to `index.js`; accidental execution on VM will fail silently or loop.

### 3.5 `console.log` / `console.warn` in Production Paths
Grepped ~40 instances across `backend/src/`. While useful for debugging, many run on hot paths (`tap.js`, `rateLimit.js`, `progression.js`). No structured logging (no Pino/Winston). Logs are not JSON-formatted, making aggregation difficult.

### 3.6 No CI Smoke on PR (`.github/workflows/`)
`backend-tests.yml` runs unit tests only. `smoke-prod.ps1` and `smoke-offers.ps1` are manual. A broken API contract can merge undetected.

### 3.7 Release Payload Includes Untracked Files (`scripts/release-prod.ps1`)
Builds payload from `git ls-files --others --exclude-standard`. No `backend/.gitignore` exists. Untracked `.sql` dumps, `.log`, or `.md` files in `backend/` can leak into the production VM. `RELEASE_OPS_RISKS_AUDIT.md` (Risk 1.1, 1.2) details this.

### 3.8 Release Uses Only `latest` Docker Tag (`scripts/release-prod.ps1` / `backend/package.json`)
No git-SHA tag. Previous image is untagged and may be garbage-collected. Rollback is manual.

### 3.9 `TIER_THRESHOLDS` Dead Env Var (`backend/.env.example:28`)
```
TIER_THRESHOLDS=100,500,2000,10000
```
Never read in code. Real thresholds are hardcoded in `vnext.js`.

### 3.10 `ENERGY_RECOVERY_INTERVAL_SECONDS` Missing from `.env.example`
Read by `backend/src/utils/progression.js` but not documented in `.env.example`. Operators may be unaware of the tunable.

---

## 4. Missing Features (Documented as Requirements) 📋

From `CONFLICT_MATRIX.md` and `SYNC_AUDIT.md`:

| Feature | Status | Severity |
|---------|--------|----------|
| `POST /api/shop/buy` + Telegram Stars fulfillment | Not implemented (`shop.js` is 11 lines, read-only) | P0 |
| Anti-cheat Layer 2 (entropy / CV / pattern analysis) | Not implemented | P0 |
| Anti-cheat Layer 3 (balance reconciliation cron) | Partial (`jobs/balanceAudit.js` exists but not verified as matching Doc spec) | P0/P1 |
| HMAC-SHA256 tap request signing | Not implemented | P0 |
| Geo-pricing Tier-1/2/3 | Not implemented | P1 |
| 5 session RNG events (30–90 sec) | Replaced by 4 weekly LiveOps events | P2 |
| Push notifications (Hook Model 9/13/15/18/20:00) | Only hackathon hours `[9,15,21]` exist | P1 |
| Telegram Stories sharing generator | Config exists, no renderer / API integration | P2 |
| Daily Battle formula `Rdaily` | Config only, no weighted scoring | P1 |
| 8 monetizable shop boosters | 4 of 8 implemented | P1 |
| Bundle «Coffee Break» 25⭐ | Missing | P0 |
| `high_stress` offer threshold 20 | Blocked by dead feature flag | P0 |
| `low_energy` offer threshold 15% | Still 25% in `balance.js` | P0 |
| Referral Stars rewards (50/200/500⭐) | Code has 10/25⭐ (5–20× lower) | P1 |
| Premium Pass level-gate (level 9) | Sold from rank 1 | P2 |

---

## 5. Hardcoded Values & Infrastructure Coupling 🔗

| Value | Locations | Impact |
|-------|-----------|--------|
| VM IP `111.88.247.195` | `.github/workflows/manual-release.yml`, `DEPLOY.md`, `README.md`, `HANDOFF.md`, `project-status.json`, `DUCKDNS_API_PLAN.md`, `idea.md`, `DOMAIN_HARDENING_PLAN.md` | IP migration requires grep-replace across 8+ files |
| Registry `cr.yandex/crpduv7gci2puq300f38` | `backend/package.json`, `backend/deploy.sh`, `docker-compose.backend.yml`, `docker-compose.prod.yml`, `DEPLOY.md`, `RELEASE_OPS_RISKS_AUDIT.md` | Registry rotation breaks build & deploy |
| Frontend URL `frontend-ashy-alpha-77.vercel.app` | `bot/src/createBot.js`, `DEPLOY.md`, `README.md`, `HANDOFF.md`, `project-status.json`, `DOMAIN_HARDENING_PLAN.md`, `DUCKDNS_API_PLAN.md`, `LAUNCH_NEXT_STEPS.md`, `smoke-prod.ps1` | Domain cutover is high-touch |
| Bot URL `coder-survival-bot.vercel.app` | `frontend/src/utils/purchases.js`, `DEPLOY.md`, `README.md`, `HANDOFF.md`, `project-status.json`, `BOT_RUNTIME_PLAN.md` | Same as above |
| `STAGE2_PASS_SEASON_START_DATE` | `backend/src/routes/pass.js:15`, `backend/src/utils/pass.js:95,139` | Hardcoded fallback `'2026-05-01'` |

---

## 6. Missing Tests 🧪

### Backend
- **8 test files** for **~50 source files** = ~16% file coverage.
- Tested: `phase2.integration`, `phase2.unit`, `smoke.idleEnergyRegen`, `stage2.oracles`, `stage2.rewardedVideo`, `stage2.routes`, `stage3.oracles`, `stage4.oracles`.
- **Untested routes:** `buy.js`, `leaderboard.js`, `referral.js`, `battle.js`, `teamBattle.js`, `coffee.js`, `onboarding.js`, `skins.js`, `events.js`, `event.js`, `offers.js`, `rewards.js`, `state.js`, `internalPayments.js`, `internalObservation.js`, `teamHackathon.js`, `playerLevel.js`, `streak.js`, `pass.js`, `quests.js`.
- **Untested utils:** `shopCatalog.js`, `battleDistribution.js`, `adProof.js`, `canvasTemplates.js` (frontend), `progression.js` (partially covered by smoke only).

### Frontend
- **Zero test files.** 51 source files in `frontend/src/`. No unit, integration, or e2e tests.

### Bot
- **Zero test files.** No unit tests for `createBot.js`, webhook handlers, or invoice logic.

---

## 7. Outdated Dependencies 📦

| Package | Current | Latest (approx) | Risk |
|---------|---------|-----------------|------|
| `express` | `^4.18.2` | 4.21+ | Security patches missing |
| `helmet` | `^7.2.0` | 8.2+ | Major version behind |
| `pg` | `^8.11.3` | 8.14+ | Bug fixes missing |
| `vite` | `^5.0.10` | 6.x | Major version behind |
| `phaser` | `^3.60.0` | 3.88+ | Many patches behind |
| `preact` | `^10.19.3` | 10.26+ | Patches behind |
| `nodemon` | `^3.0.2` | 3.1+ | Low risk |
| `jest` | `^29.7.0` | 29.7 (current) | OK |
| `grammy` | `^1.38.4` | 1.35+ (actually OK) | Low risk |

> Note: No `npm audit` output available in this environment. Recommend running `npm audit` in each workspace.

---

## 8. TODO / FIXME / HACK Comments in Source

| File | Line | Comment |
|------|------|---------|
| `backend/src/routes/buy.js` | 154 | `// TODO: логика защиты стрика` |
| `frontend/src/utils/AdsManager.js` | 42 | `// TODO: initialize real ad SDK here` |
| `frontend/src/utils/AdsManager.js` | 69 | `// TODO: production flow` |
| `ads/rewarded-video.md` | 227 | `// TODO: Call backend to grant reward` |
| `.github/workflows/manual-release.yml` | 44 | `# TODO: switch to self-hosted runner in the operator LAN for SSH reliability` |

Additional **documented TODOs** (no inline comment):
- `CONFLICT_MATRIX.md:67` — "TODO: implement feature flag assignment" (A/B testing infra).

---

## 9. Performance & Scaling Concerns ⚡

1. **DB Rate-Limit Table Hot Path:** Every tap performs `INSERT ... ON CONFLICT UPDATE` on `rate_limit_user` and `rate_limit_ip`. At high concurrency this table becomes a contention point. No Redis/memcached caching layer.
2. **`ensurePlayerLevel` Write Amplification:** As noted in 2.5, every authenticated request updates `player_levels.updated_at`.
3. **`balanceAudit.js` Full Table Scan Potential:** If the audit query lacks proper indexes or runs too frequently, it may scan large tables (`progression`, `sessions`).
4. **No Connection Pool Tuning:** `backend/src/index.js:53` creates a `Pool` with default `max` (10). No explicit pool sizing for production load.
5. **Frontend Bundle:** `vite build` produces a single bundle with Phaser (~3 MB). No code-splitting observed for game scenes.

---

## 10. Quick-Win Recommendations

1. **Security:** Parameterize `leaderboard.js` rank filter; add CORS whitelist; enable `rejectUnauthorized` for DB SSL.
2. **Reliability:** Remove `|| true` equivalents in env parsing (`rateLimit.js`); fix `featureFlags` transport in `tap.js`; implement `streak_protect` effect or remove from catalog.
3. **Ops:** Add `git status --porcelain` guard to `release-prod.ps1`; tag Docker images with git SHA; create `backend/.gitignore`.
4. **Tests:** Add at least route-level integration tests for `/api/buy`, `/api/leaderboard`, `/api/referral`, and `/api/battle`.
5. **Cleanup:** Delete `SPRINT_PASS_LEVELS` dead config; remove `TIER_THRESHOLDS` from `.env.example`; archive `bot/index.js` or change `package.json` main.
6. **Dependencies:** Run `npm audit fix` in `backend/`, `frontend/`, and `bot/`.

---

*Generated by static analysis. Review against runtime telemetry before prioritization.*
