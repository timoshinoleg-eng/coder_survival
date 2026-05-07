# Repo Hygiene & Safe Commit Plan

> Generated: 2026-05-07  
> Branch: main (aligned with origin/main)  
> Constraint: no destructive git ops, no push, no secrets committed.

---

## 1. Situation Summary

- Working tree is dirty with **days of prod-validated changes** not yet committed.
- `backend/node_modules` was accidentally tracked in the past; it is now deleted locally.
- Secret files (`backend/.env`, `backend/.env.production`) were tracked in the past; they are now deleted locally.
- Root `.gitignore` was **untracked** — this is why `node_modules` leaked into the repo originally.
- Two new hygiene docs were prepared during this sweep: `SMOKE_COVERAGE.md` and `DOCS_DRIFT_AUDIT.md`.
- Minor docs polish applied to `README.md` and `GAME_RULES.md`.
- No active P1 bugs; prod is live and verified per `HANDOFF.md` + `project-status.json`.

---

## 2. Categories

### 2.1 NEVER COMMIT (exclude / ignore)

| Pattern / File | Why | Action |
|----------------|-----|--------|
| `backend/node_modules/**` | Tracked dependency tree | Already deleted locally; commit the deletions |
| `bot/node_modules/`, `frontend/node_modules/` | Dependencies | Untracked; keep ignored |
| `frontend/dist/` | Build artifacts | Untracked; keep ignored. Audio source lives in `frontend/public/audio/` |
| `bot/bot-local.log`, `bot/bot-local.err.log` | Local runtime log | Untracked; never add |
| `backend/.env` | Secrets | Deleted locally; commit deletion to untrack |
| `backend/.env.production` | Secrets | Deleted locally; commit deletion to untrack |
| Any `.env` except `.env.example` | Secrets | Keep in `.gitignore` |
| `.vercel/`, `coverage/`, `.DS_Store`, `*.local` | Temp / local | Keep in `.gitignore` |

### 2.2 MUST COMMIT (include)

See exact per-commit file lists in **Section 3** below.

High-level buckets:
- **Runtime:** backend migrations 002–007, new routes/utils/config, frontend components/utils/audio assets, bot runtime.
- **Infra:** Dockerfiles, compose files, nginx config, package files.
- **Docs:** All root `.md` and `.json` source-of-truth files, `observation/`, `support/`, `payments/README.md`.
- **Ops:** PowerShell release/smoke/operator scripts, `.github/workflows/`.
- **Hygiene:** Root `.gitignore`, deletion of secrets/node_modules.

### 2.3 SPORNO / Manual Check Required

| File / Area | Question | Recommendation |
|-------------|----------|----------------|
| `backend/migrations/001_init.sql` | Modified after prod already on 007 | Review diff before commit. Trust code first, but ensure change is additive/commentary, not destructive. |
| `backend/package-lock.json` | Large change (+4477 lines) | Expected if dependencies were updated. Verify no malicious URLs. |
| `frontend/src/utils/sfx/` | Audio code modules | These are JS wrappers, not binary assets. Safe to commit. |
| `frontend/public/audio/*.ogg` | Binary audio assets | These are source assets referenced by the app. Safe to commit; they are not build artifacts. |
| `frontend/dist/audio/*.ogg` | Build copies of the above | Do **not** commit `dist/`. Source is in `public/`. |
| `bot/package-lock.json` | New lockfile | Standard to commit. |

---

## 3. Exact Staging Buckets (3 commits)

### Commit 1 — `chore: repo hygiene and remove tracked secrets/node_modules`

**Scope:** `.gitignore`, deletions only.

**Exact files:**
```text
.gitignore
backend/.env
backend/.env.production
backend/node_modules/**  (~6600 files — see git status for full list)
```

**Staging command:**
```bash
git add .gitignore
git add backend/.env backend/.env.production
git add backend/node_modules
```

---

### Commit 2 — `feat: sync production runtime (backend, frontend, bot)`

**Scope:** All runtime code, migrations, configs, assets, and infra changes.

**Exact modified tracked files:**
```text
ANALYSIS.md
backend/.env.example
backend/docker-compose.yml
backend/Dockerfile
backend/migrations/001_init.sql
backend/package.json
backend/package-lock.json
backend/README.md
backend/src/index.js
backend/src/middleware/initData.js
backend/src/middleware/rateLimit.js
backend/src/migrate.js
backend/src/routes/buy.js
backend/src/routes/leaderboard.js
backend/src/routes/referral.js
backend/src/routes/state.js
backend/src/routes/tap.js
bot/.env.example
bot/index.js
bot/package.json
DEPLOY.md
docker-compose.prod.yml
frontend/README.md
frontend/src/assets/animations.css
frontend/src/components/StatsBar.jsx
frontend/src/components/TapArea.jsx
frontend/src/game/scenes/GameScene.js
frontend/src/hooks/useGameState.js
frontend/src/hooks/useTelegram.js
frontend/src/main.jsx
frontend/vite.config.js
nginx/codersurvival.conf
project-status.json
README.md
scripts/deploy.sh
scripts/smoke-offers.ps1
```

**Exact added tracked files:**
```text
backend/migrations/006_balance_tuning.sql
frontend/src/utils/rewardFormatting.js
```

**Exact untracked runtime files to add:**
```text
backend/migrations/002_vnext_core.sql
backend/migrations/003_referral_milestones.sql
backend/migrations/004_stage4_retention.sql
backend/migrations/005_offer_cooldowns.sql
backend/migrations/007_minimum_economy_instrumentation.sql
backend/src/config/balance.js
backend/src/routes/battle.js
backend/src/routes/event.js
backend/src/routes/internalObservation.js
backend/src/routes/internalPayments.js
backend/src/routes/offers.js
backend/src/routes/pass.js
backend/src/routes/playerLevel.js
backend/src/routes/quests.js
backend/src/routes/shop.js
backend/src/routes/team.js
backend/src/utils/
bot/api/
bot/src/
bot/Dockerfile
bot/.gitignore
bot/package-lock.json
bot/vercel.json
docker-compose.backend.yml
frontend/.gitignore
frontend/Dockerfile
frontend/public/
frontend/src/components/AudioSettings.css
frontend/src/components/AudioSettings.jsx
frontend/src/components/ContextOfferBanner.jsx
frontend/src/components/DailyBattlePanel.jsx
frontend/src/components/DailyQuestsPanel.jsx
frontend/src/components/EventBanner.jsx
frontend/src/components/EventPanel.jsx
frontend/src/components/LeaderboardPanel.jsx
frontend/src/components/LevelUpModal.jsx
frontend/src/components/OnboardingOverlay.jsx
frontend/src/components/ReferralPanel.jsx
frontend/src/components/ShopPanel.jsx
frontend/src/components/SprintPassPanel.jsx
frontend/src/components/TeamPanel.jsx
frontend/src/utils/api.js
frontend/src/utils/AudioManager.js
frontend/src/utils/purchases.js
frontend/src/utils/sfx/
frontend/src/utils/SFX_REGISTRY.js
frontend/vercel.json
```

**Staging command:**
```bash
git add backend/src/ backend/migrations/ backend/*.json backend/*.js backend/Dockerfile backend/docker-compose.yml backend/.env.example backend/README.md
git add frontend/src/ frontend/public/ frontend/*.json frontend/*.js frontend/*.css frontend/Dockerfile frontend/.gitignore frontend/vercel.json frontend/README.md frontend/vite.config.js
git add bot/src/ bot/api/ bot/index.js bot/package.json bot/package-lock.json bot/Dockerfile bot/.gitignore bot/vercel.json bot/.env.example
git add docker-compose.backend.yml docker-compose.prod.yml nginx/codersurvival.conf scripts/deploy.sh scripts/smoke-offers.ps1
git add ANALYSIS.md DEPLOY.md project-status.json README.md
```

---

### Commit 3 — `docs: source-of-truth, operators, support, and hygiene docs`

**Scope:** All docs, status files, scripts, CI, support, observation, and newly prepared hygiene docs.

**Exact untracked docs / ops / support files:**
```text
.env.example
.github/workflows/manual-release.yml
AUDIO_INTEGRATION_PLAN.md
AUDIT_ECONOMY_2026-05-07.md
BACKEND_GAP_ENERGY_COUNTDOWN.md
BOT_RUNTIME_PLAN.md
CLEANUP_PLAN.md
COMMIT_PLAN.md
DOMAIN_HARDENING_PLAN.md
DRIFT_HANDOFF_STATUS_vs_CODE.md
DUCKDNS_API_PLAN.md
ECONOMY_CONSTANTS_TABLE.md
GAME_RULES.md
HANDOFF.md
KIMI_TASKS_VNEXT.md
LAUNCH_NEXT_STEPS.md
MISSING_METRICS_FOR_BALANCE_PASS.md
RELEASE_OPS_RISKS_AUDIT.md
SUPPORT_KNOWN_ISSUES.md
VNEXT_SPEC.md
observation/
payments/README.md
scripts/domain-cutover-check.ps1
scripts/duckdns-update.ps1
scripts/observe-economy.ps1
scripts/release-manual-checklist.md
scripts/release-preflight.ps1
scripts/release-prod.ps1
scripts/set-api-origin.ps1
scripts/setup-api-host-on-vm.ps1
scripts/smoke-prod.ps1
support/
SMOKE_COVERAGE.md
DOCS_DRIFT_AUDIT.md
```

**Staging command:**
```bash
git add *.md *.json
git add observation/ support/ payments/README.md scripts/*.ps1 scripts/*.md .github/workflows/
```

---

## 4. Risk Notes

1. **Secrets in Git History**  
   `backend/.env` and `backend/.env.production` were previously tracked. Committing their deletion removes them from `HEAD`, but **they remain in git history**. Recommendation: rotate any credentials that were present, and consider `git-filter-repo` or BFG in a dedicated history-rewrite session if compliance requires it. **Do not rewrite history in this routine sync.**

2. **`backend/migrations/001_init.sql` Modified**  
   Prod already has migrations 001–007 applied. Changing `001_init.sql` does not affect prod, but may affect fresh clones. Review the diff to confirm it is safe before staging.

3. **`frontend/dist/` is untracked and large**  
   It contains build artifacts + copied audio. Root `.gitignore` now excludes `dist/`. Do not accidentally stage it.

4. **Push Not Performed**  
   This plan prepares the index only. Actual commit and push must be done manually after review.

---

## 5. Checklist Before Committing

- [ ] Review `git diff --cached` for each commit bucket.
- [ ] Confirm no `.env` files (except `.env.example`) are staged.
- [ ] Confirm `frontend/dist/` and any `node_modules/` are not staged.
- [ ] Confirm `bot/bot-local.log` and `bot/bot-local.err.log` are not staged.
- [ ] Confirm `backend/migrations/001_init.sql` diff is safe.
- [ ] Run a quick local smoke if possible (`npm install` in backend, check `node src/index.js` dry-run).
- [ ] Commit using the 3 buckets above.
- [ ] Do **not** push until a second human review or CI check passes.

---

## 6. Files Prepared During This Sweep (Not Yet Committed)

| File | Purpose |
|------|---------|
| `.gitignore` | Prevent future leakage of secrets, node_modules, dist, logs |
| `COMMIT_PLAN.md` | This document — exact staging plan |
| `SMOKE_COVERAGE.md` | Inventory of what smoke tests cover + identified gaps |
| `DOCS_DRIFT_AUDIT.md` | Cross-check of docs vs code consistency |

These four files are themselves staged in **Commit 3**.
