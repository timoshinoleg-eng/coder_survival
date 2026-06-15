# Handoff: Coder Survival

## Workspace Truth
- Active repo: `C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_fresh`
- Verified git root: `C:/Users/Имярек/Downloads/Coder Survival/coder_survival_repo/coder_survival_fresh`
- Current branch: `cleanup/post-deploy-audit`
- Remote branch: `origin/cleanup/post-deploy-audit`
- Date of this handoff refresh: `2026-06-15`

Treat the top-level `C:\Users\Имярек\Downloads\Coder Survival` folder as a workspace container, not the git root.

## Current Main Track
`mini-games deploy readiness`

Goal:
- make the current 5 mini-games usable and coherent;
- fix backend reward, achievement, migration, and deploy-path blockers;
- leave the branch ready for PR/merge/deploy smoke after final push.

## Current Worktree Scope
The mini-game deploy-readiness batch is intentionally centered on mini-games plus supporting deploy/migration fixes:

```text
.github/workflows/deploy-backend.yml
.github/workflows/deploy-staging.yml
.github/workflows/manual-release.yml
backend/migrations/026_achievement_expansion.sql
backend/migrations/031_phase9_skins_and_achievements.sql
backend/migrations/033_phase10_final_social.sql
backend/migrations/057_onboarding_status.sql
backend/migrations/058_narrow_onboarding_status.sql
backend/src/config/balance.js
backend/src/routes/minigame.js
backend/src/utils/achievementsEngine.js
backend/tests/minigame.integration.test.js
backend/tests/phase10.unit.test.js
backend/tests/phase9.unit.test.js
frontend/src/components/ContextOfferBanner.jsx
frontend/src/components/MiniGameArchitecturalCommittee.jsx
frontend/src/components/MiniGameCodeReview.jsx
frontend/src/components/MiniGameDreamInterview.jsx
frontend/src/components/MiniGameHelloWorld.jsx
frontend/src/components/MiniGameIPO.jsx
frontend/src/components/MiniGameLauncher.jsx
frontend/src/components/ShopPanel.jsx
frontend/src/components/StatsBar.jsx
frontend/src/hooks/useGameState.js
frontend/src/hooks/useTelegram.js
frontend/scripts/frontend-smoke.mjs
frontend/src/utils/api.js
HANDOFF.md
```

## What Changed
- Mini-game launcher now uses Telegram `initData` from `useTelegram()` instead of relying on `useGameState()`.
- Mini-games are visible from `StatsBar` without the stale `featureFlags?.minigameEnabled === true` gate.
- Production Telegram auth no longer falls back to fake dev `initData` while the Telegram WebApp/initData is still loading.
- Successful shop and context-offer purchases refresh global state immediately; premium pass purchases also refresh pass state.
- Hello World, Code Review, Dream Interview, Architectural Committee, and IPO refresh global state after reward/failure completion.
- Hello World supports mobile click/touch input in addition to physical keyboard input.
- Hello World and Code Review guard against double `/complete` calls.
- Dream Interview timeout flow no longer freezes after the timer expires.
- Dream Interview result UI now trusts backend `payload.success`, so a Rubber Duck rescue cannot grant rewards while showing a failure result.
- Dream Interview now guards `finishGame` against duplicate completion requests.
- IPO now uses a randomized 3-question run, requires 3/3 for success, rejects score > 3, and grants `cto_cape` only on perfect success.
- Architectural Committee no longer promises an achievement in UI copy as a direct visible reward.
- Backend mini-game completion no longer calls legacy no-op `checkAchievement`; it uses `checkAchievementsForUser`.
- Mini-game achievements now work for:
  - `architect_winner`
  - `rubber_duck_unlock`
- Dream Interview `skinFragment` reward no longer crashes on SQL update.
- Mini-game failure counters no longer interpolate the validated `gameType` into SQL; the per-game failure key is parameterized.
- Weekly sprint `minigamesCompleted` only increments on successful mini-games.
- Fresh DB migrations were fixed for the modern achievements schema.
- Backend deploy workflow now runs migrations in the freshly built backend container before switching traffic.
- Backend deploy workflow no longer ignores backend test failures via `continue-on-error: true`.
- Staging deploy workflow now runs migrations before replacing the running staging container.
- Manual release workflow no longer references the non-existent `pwsh-lang/pwsh@v1` action.

## Verification Evidence
Full release checks run before the Kimi blocker follow-up:

```text
backend: npm test
result: 39 test suites passed, 382 tests passed

backend fresh migration smoke:
result: all 58 migrations applied successfully in an isolated temporary schema

frontend: npm run build
result: Vite production build passed

frontend: node scripts/frontend-smoke.mjs
result: frontend smoke checks passed

backend targeted: node --experimental-vm-modules ./node_modules/jest/bin/jest.js --runInBand --forceExit tests/minigame.integration.test.js
result: 1 test suite passed, 6 tests passed

repo: git diff --check
result: clean
```

Fresh checks run after the Kimi blocker follow-up:

```text
frontend: node scripts/frontend-smoke.mjs
result: frontend smoke checks passed

frontend: npm run build
result: Vite production build passed

backend targeted: node --experimental-vm-modules ./node_modules/jest/bin/jest.js --runInBand --forceExit tests/minigame.integration.test.js
result: 1 test suite passed, 6 tests passed
```

Targeted mini-game integration coverage now includes:
- IPO score 3 succeeds and grants `cto_cape`
- IPO score 2 fails and does not grant skin
- IPO score 4 is rejected
- Dream Interview success grants `fragment_dream_interview_rare` without SQL error
- Architectural Committee success earns `architect_winner`
- third mini-game failure earns `rubber_duck_unlock`

## Deploy Readiness
Code-level deploy readiness: yes, for the mini-game scope above.

Not yet done:
- no PR was opened from this machine because `gh` is not installed and no GitHub connector was available in this session;
- no merge to `main` has been performed from this session;
- no production deploy or production smoke was run.

Recommended release path:
1. Open PR from `cleanup/post-deploy-audit` to `main`, or merge through the normal protected path.
2. Confirm GitHub Actions on the PR/merge.
3. Deploy backend/frontend through the normal pipeline.
4. After deployment, run production smoke on a safe test user:
   - `/api/state`
   - `/api/minigame/start`
   - `/api/minigame/complete`
   - reward/skin/achievement verification in DB or API state

## Known Remaining Non-Blockers
- Legacy `backend/src/utils/achievements.js` remains a no-op wrapper, and some non-mini-game routes still import it. This batch fixes the mini-game achievement path only.
- Backend tests still print verbose auth/debug logs and use `--forceExit`; noisy, but not a mini-game deploy blocker.
- Deploy workflow has no automated rollback after a failed new-container health check; operational follow-up, not a mini-game code blocker.
- Production smoke is still required after deployment because local integration tests do not prove Telegram client behavior or production secrets.

## Useful Commands
```powershell
cd "C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_fresh"
git status --short --branch
git diff --stat
git diff --check

cd backend
npm test

cd ..\frontend
npm run build
node scripts/frontend-smoke.mjs
```
