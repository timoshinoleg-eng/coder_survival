# Handoff: Coder Survival

## Workspace
- Active repo: `C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_fresh`
- Current branch: `main`
- Latest commit made in this session: `a4f86e6 Fix daily login quest sync and level modal dismissal`
- Important sibling repo used only as source/reference: `C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_repo_new`

## What Was Completed
- Ported Opus `q_login` SSOT fix from `coder_survival_repo_new` into `coder_survival_fresh`.
- Committed `a4f86e6`, touching only:
  - `backend/src/utils/dailyQuests.js`
  - `backend/src/routes/quests.js`
  - `backend/src/routes/state.js`
  - `backend/tests/loginQuestSync.test.js`
  - `frontend/src/components/LevelUpModal.jsx`
- Daily quest status now uses JSONB `progression.daily_quests_state` as the player-facing source of truth.
- `/api/state` now also marks the JSONB login quest complete using `markLoginQuestCompleteInState()`.
- `/api/quests` delegates generation to shared `ensureDailyQuestState()`.
- Added `loginQuestSync.test.js` for idempotency, claim preservation, malformed state tolerance, and DB integration cases that skip without `TEST_DATABASE_URL`.
- Kimi's LevelUp modal fix was included in the same commit:
  - overlay/card/button use `onPointerDown`
  - modal overlay is `position: fixed`
  - z-index raised to `200`
  - propagation is stopped so TapArea/Phaser do not swallow dismissal.

## Verification Already Run
- Backend focused tests:
  - `npm --prefix backend test -- --runInBand --forceExit backend/tests/loginQuestSync.test.js backend/tests/mvp.dailyQuests.test.js`
  - Result: PASS, `13 passed`, `3 skipped`.
- Frontend build:
  - `npm --prefix frontend run build`
  - Result: PASS.
- Note: without `--forceExit`, Jest reports open handles after PASS. This was seen before and should be investigated separately with `--detectOpenHandles` if it becomes blocking.

## Current Dirty Worktree
- `HANDOFF.md` is intentionally updated for the next session.
- `scripts/smoke-prod.ps1` has existing uncommitted smoke expectation changes, not committed yet:
  - daily quests expectation changed from `tap_count=40`, `commit_count=80`, bonus energy check to current `tap_count=300`, `commit_total=10000`, `login=1`.
  - pass status expectation changed to linear pass curve: `firstRequiredXp=100`, total computed as `21000` for 20 levels.
  - quest claim reward expectation changed to `reward.applied` + `reward.updates`.
  - event claim expects `rewardApplied.applied`.
  - referral milestone reward energy changed from `30` to `25`.
- `YANDEX_CLOUD_MIGRATION_PLAN.md` is new and uncommitted.
- `reports/` is untracked diagnostic output and patch material from this session.

## Yandex Cloud Plan Status
- Opus created `YANDEX_CLOUD_MIGRATION_PLAN.md`.
- It was reviewed and is a usable baseline, but should be corrected before commit/execution:
  - remove broad `editor` role from the service account and use least-privilege roles;
  - remove `BOT_TOKEN` from YC Lockbox unless backend truly needs it; bot token should stay with Vercel bot;
  - use `Invoke-WebRequest -OutFile` for binary PNG/GIF smoke checks instead of `Invoke-RestMethod`;
  - normalize odd UTF-8/terminal symbols if Windows shell displays mojibake.
- Bot should stay on Vercel or another non-RF runtime unless Telegram Bot API egress from YC is explicitly verified.
- Backend/media can move to Yandex Cloud; fastest path is one YC VM + Docker + Postgres on VM + Object Storage for media, then production path can add ALB/Instance Group/Managed PostgreSQL/CDN/Lockbox/Logging.

## Frontend Hot-Path Notes From Opus
- Must-fix live bugs already believed to be present in `c628253`:
  - `frontend/src/App.jsx`: possible `runtimeEventState <-> randomEventState` sync loop unless normalize/equality guards exist.
  - `frontend/src/App.jsx`: `applyRandomEventChoice` must be imported if used.
- Do not disable the 1-second `runtimeNow` timer: `StatsBar` uses it for energy countdown.
- Do not regress tap batching in `frontend/src/hooks/useGameState.js`.
- Do not reintroduce `scene.restart()` or particle/resize leaks in `frontend/src/game/scenes/GameScene.js`.

## Recommended Next Steps
1. Inspect `git status --short` first.
2. Decide what to do with dirty `scripts/smoke-prod.ps1`: verify with prod/staging smoke before committing, or revert only with explicit user approval.
3. Apply the small follow-up edits to `YANDEX_CLOUD_MIGRATION_PLAN.md`, then commit it separately.
4. Verify the `App.jsx` P0 hot-path fixes are present in `fresh`; if not, implement and test them.
5. Run broader verification before any deploy:
   - `npm --prefix frontend run build`
   - `npm --prefix backend test -- tests/mvp.performanceStatic.test.js --runInBand --forceExit`
   - `node --check backend/src/routes/state.js`
   - `node --check backend/src/utils/dailyQuests.js`
   - `pwsh -File scripts/smoke-prod.ps1` when environment/secrets are available.

## Commands / Facts
- Recent commits:
  - `a4f86e6 Fix daily login quest sync and level modal dismissal`
  - `c628253 Merge branch 'main' ...`
  - `eb3ea2c WIP: frontend freeze fix, pass race fix, smoke/docs sync before context reset`
- The old `c628253` merge tree matched `18e08e9`; `eb3ea2c` was joined into history but did not overwrite final tree content.
- `backend/node_modules` was checked earlier via reports; use `git ls-files backend/node_modules` if this needs re-validation.
