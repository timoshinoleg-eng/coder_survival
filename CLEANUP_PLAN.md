# Coder Survival — Cleanup Plan

> **Scope:** analysis & planning only. No prod deploy. No payment-flow changes.  
> **Date:** 2026-05-07  
> **Source of truth:** repo code at this commit, `HANDOFF.md`, `project-status.json`

---

## 1. Frontend Hardcoded Economy Values Replacement Map

### Problem
Several frontend components still duplicate economy constants that already live in `backend/src/config/balance.js` or `backend/src/utils/vnext.js`. If balance tuning happens again, the frontend may drift out of sync.

### Files & fixes

| File | Hardcoded value | Backend source | Recommended fix |
|------|-----------------|----------------|-----------------|
| `frontend/src/components/StatsBar.jsx` | `TIER_NAMES` map + `TIER_THRESHOLDS = [100,500,2000,10000]` | `vnext.js` `RANK_META` + `XP_THRESHOLDS` | Remove old-tier fallback. `levelProgress` should **only** use vNext fields (`xpProgress / xpRequiredForNext`). vNext level is guaranteed because `ensurePlayerLevel` runs on every `/api/state` call. |
| `frontend/src/components/StatsBar.jsx` | `rankBadgeGradient` map | `vnext.js` `RANK_META.name` | Keep — this is pure UI styling, not economy-critical. |
| `frontend/src/components/LevelUpModal.jsx` | `RANK_REWARDS` (`commitsPerTap`, `maxEnergy`) | `vnext.js` `RANK_META` (already returned inside `level.resolved`) | Read `commitsPerTap` and `maxEnergy` from `useGameState()` (`level` or `rank` fields) instead of local `RANK_REWARDS`. The API already sends them: `payload.level.commitsPerTap` / `maxEnergy`. |
| `frontend/src/components/ReferralPanel.jsx` | `20` fallback for `activeThresholdCommits` | `config/balance.js` `REFERRAL_ACTIVE_THRESHOLD_COMMITS` | Remove the `\|\| 20` fallback. Backend `/api/referral/stats` already returns `activeThresholdCommits` on every call. A missing value should surface as a bug rather than silently masking it. |
| `frontend/src/components/DailyQuestsPanel.jsx` | Static quest title strings in `formatQuestTitle` | `config/balance.js` `DAILY_QUEST_DEFS` | Acceptable — these are human-readable labels, not balance numbers. Already dynamic via `targetValue` from API. |
| `frontend/src/components/DailyQuestsPanel.jsx` | Static bonus banner text | `config/balance.js` `DAILY_QUEST_ALL_CLAIMED_BONUS` | Already uses `formatRewardPayload(daily?.allCompletedBonusReward)` from API. No change needed. |

### API additions required
None — the backend already emits everything needed (`level.resolved` carries `commitsPerTap` and `maxEnergy`).

### Testing after fix
1. Create a fresh smoke user, verify level progress bar renders correctly.
2. Drive user to rank-up boundary, verify `LevelUpModal` shows correct `commitsPerTap` and `maxEnergy`.
3. Check referral panel on a user with 0 active refs — threshold text should show `20` from backend, not fallback.

---

## 2. Legacy / Stale File Deletion & Documentation Plan

### Candidates for removal

| File / Directory | Why it is stale | Risk | Action |
|------------------|-----------------|------|--------|
| `payments/bot-webhook.js` | Dead Express router; `MOCK_MODE = ... \|\| true` forces always-mock; `grantItemToUser` is empty stub. Never imported in production. | Low — not referenced by any active code path. | **Delete** after confirming zero imports. |
| `payments/prices.json` | Legacy catalog used only by the dead `payments/bot-webhook.js`. Bot invoice-link now fetches live catalog from `/api/shop/products`. | Low — no active consumer. | **Delete** together with `payments/bot-webhook.js`. |
| `frontend/src/utils/mockApi.js` | Pre-backend mock layer. No imports found in current frontend source. | Low — confirmed unused by grep. | **Delete** after one more import check. |
| `bot/index.js` | Polling entry point. Production bot runs as Vercel webhook (`bot/api/webhook.js`). VM cannot reach `api.telegram.org`, so this must never run on the VM. | Medium — `package.json` `main` points here; someone might accidentally `node bot/index.js`. | **Move** to `bot/legacy/index.polling.js` (or delete if team agrees). Update `bot/package.json` `main` to point to a stub that logs "Use Vercel webhook runtime" and exits 1. |
| `docker-compose.prod.yml` | Still defines `frontend` and `bot` services with YCR images. These run on Vercel, not the VM. Only `backend` service is used in production. | Medium — risk of accidental `docker-compose up` starting stale frontend/bot containers. | **Refactor**: rename current file to `docker-compose.backend.yml` containing **only** the `backend` service + shared network. Remove `frontend` and `bot` blocks. Keep old file as `docker-compose.prod.yml.legacy` for 1 release cycle, then delete. Update `scripts/release-prod.ps1` to reference the new compose file. |
| `nginx/codersurvival.conf` | `listen 80` only; 443 block is commented out. Host-level nginx handles TLS termination on the VM. | Low — kept as architecture reference. | **Leave as-is**; add a comment at top stating "Reference only — production TLS terminated by host nginx + certbot". |

### Doc updates after deletion
- `HANDOFF.md` — remove references to deleted files; update "Runtime reality" to mention `bot/index.js` is archived.
- `project-status.json` — bump `last_updated`; add note about legacy cleanup.
- `DEPLOY.md` (if exists) — update compose file names.

---

## 3. Smoke Test Expansion Spec

### Current coverage
`smoke-prod.ps1` asserts: health, state, tap, quests (count/claimable), battle (count/rank), event (type/target=650), pass (level/xp), referral (code/count), shop (prices 10/40/75/200), team CRUD, bot webhook (401/405).

### Gaps to close

#### A. Daily Quests — concrete targets & all-clear bonus
- Assert `quests.daily.quests` has exactly 3 items.
- Assert each quest matches balance config:
  - `tap_count` target `40`
  - `commit_count` target `80`
  - `login` target `1`
- Assert `daily.allCompletedBonusReward` equals `{ energy: 25 }`.

#### B. Sprint Pass — structure & curve
- Assert `pass.status.rewards` length equals `20`.
- Assert `premiumPassProduct.stars` equals `200`.
- (Optional) Compute total required XP from `rewards[].requiredXp` and assert sum equals `915`.

#### C. Daily Battle — reward preview
- Assert `battle.rewardPreview` exists with keys `top1`, `top2`, `top3`.
- Assert values match `config/balance.js`:
  - `top1.energy === 50`
  - `top2.energy === 30`
  - `top3.energy === 15`

#### D. Referral Milestones — payload shape
- Assert `referralStats.stats.milestones` length equals `3`.
- Assert targets are `[1, 3, 5]`.
- Assert rewards match:
  - `1 → { energy: 30 }`
  - `3 → { energy: 60 }`
  - `5 → { energy: 100 }`
- Assert `activeThresholdCommits === 20`.

#### E. Event — reward payload shape
- Assert `event.event.targetCommits === 650`.
- Assert `event.event.rewardPayload` matches:
  - `energy: 80`
  - `commitsCurrent: 60`
  - `depressionRelief: 15`

#### F. Tap response — event contribution wiring
- On a fresh user with an active event, assert `tap.event.contribution` increments after taps that earn commits.

### Implementation notes
- Add a reusable `Assert-Equal` helper in `smoke-prod.ps1` to keep assertions readable.
- Keep the smoke script idempotent — it already creates a random smoke user each run, so quest targets and pass levels are deterministic for a fresh user.

---

## 4. Release Payload Inventory Proposal

### Current state
`scripts/release-prod.ps1` builds the VM backend payload by:
1. `git ls-files` (+ optional untracked)
2. Filter: `^backend/` OR `docker-compose.prod.yml`
3. `Compress-Archive` → SCP → extract → build → deploy

### Problems
1. `docker-compose.prod.yml` contains `frontend` + `bot` services that are dead weight on the VM.
2. No explicit whitelist/blacklist — any tracked file under `backend/` ships, including docs, examples, or accidental `.env` files.
3. Untracked inclusion (`-IncludeUntracked`) is opt-in but not guarded against secrets.

### Proposed hardening

#### A. Split compose files
- Create `docker-compose.backend.yml` — **only** `backend` service + shared network/volume definitions.
- Rename current `docker-compose.prod.yml` → `docker-compose.full-stack.yml` (or archive as `.legacy`).
- Update `release-prod.ps1` to reference `docker-compose.backend.yml`.

#### B. Explicit file inventory (whitelist)
Instead of a regex filter, maintain an inline whitelist in `release-prod.ps1`:

```powershell
$backendWhitelist = @(
  'backend/src/',
  'backend/Dockerfile',
  'backend/package.json',
  'backend/package-lock.json',
  'backend/migrations/',
  'docker-compose.backend.yml'
)
```

Copy logic:
- For each whitelisted prefix, include all tracked files underneath it.
- Reject any file matching `backend/.env*`, `backend/*.md`, `backend/src/**/*.test.js`.

#### C. Pre-flight secret guard
Before compressing:
```powershell
$envFiles = $files | Where-Object { $_ -match '\.env' }
if ($envFiles.Count -gt 0) {
  throw "Refusing to release: .env files detected in payload: $($envFiles -join ', ')"
}
```

#### D. Payload manifest
After staging, print a sorted manifest of files being shipped:
```powershell
Write-Host "Release payload manifest:"
$filtered | ForEach-Object { Write-Host "  $_" }
```
This makes it easy to audit what went to the VM.

### Rollout order
1. Create `docker-compose.backend.yml` (backend-only).
2. Update `release-prod.ps1` to use new compose + whitelist + secret guard.
3. Run a dry-run release locally (`-SkipVercel -SkipSmoke`) and inspect manifest.
4. Merge. Next production release will use the hardened payload.

---

## Appendix: Cross-reference to backend source of truth

| Concept | Backend file | Key export |
|---------|--------------|------------|
| Rank meta (commitsPerTap, maxEnergy) | `backend/src/utils/vnext.js` | `RANK_META` |
| XP thresholds | `backend/src/utils/vnext.js` | `XP_THRESHOLDS` |
| Daily quest defs | `backend/src/config/balance.js` | `DAILY_QUEST_DEFS` |
| Daily all-clear bonus | `backend/src/config/balance.js` | `DAILY_QUEST_ALL_CLAIMED_BONUS` |
| Referral threshold | `backend/src/config/balance.js` | `REFERRAL_ACTIVE_THRESHOLD_COMMITS` |
| Referral milestone rewards | `backend/src/config/balance.js` | `REFERRAL_MILESTONE_REWARDS` |
| Battle reward preview | `backend/src/config/balance.js` | `BATTLE_REWARD_PREVIEW` |
| Weekly hackathon target | `backend/src/config/balance.js` | `WEEKLY_HACKATHON_TARGET` |
| Weekly hackathon reward | `backend/src/config/balance.js` | `WEEKLY_HACKATHON_REWARD` |
| Sprint pass levels | `backend/src/config/balance.js` | `SPRINT_PASS_LEVELS` |
| Shop product catalog | `backend/src/utils/shopCatalog.js` | `PRODUCT_CATALOG` |
| Shop item effects | `backend/src/config/balance.js` | `SHOP_ITEM_EFFECTS` |

