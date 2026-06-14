# Handoff: Coder Survival

## Workspace Truth
- Active repo: `C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_fresh`
- Verified git root: `C:/Users/Имярек/Downloads/Coder Survival/coder_survival_repo/coder_survival_fresh`
- Current branch: `cleanup/post-deploy-audit`
- Date of this handoff refresh: `2026-06-14`

This file replaces a stale handoff snapshot that still described `main` plus an already-finished backend deploy path. The live checkout is now a dirty local onboarding/frontend cleanup branch and should be treated as such.

## Current Main Track
`onboarding / product UX`

Reason:
- the current dirty tree is dominated by onboarding, overlay, tap-area, and related frontend/backend contract changes;
- there are new onboarding migrations and route tests;
- this is the most coherent single track in the current worktree.

Do not assume mini-games or deploy work is in progress in this checkout unless re-verified.

## Current Worktree
`git status --short --branch` at refresh time:

```text
## cleanup/post-deploy-audit...origin/cleanup/post-deploy-audit
 M .gitignore
 M API_CONTRACTS.md
 M backend/README.md
 M backend/src/config/balance.js
 M backend/src/routes/onboarding.js
 M backend/src/routes/state.js
 M docs/openapi.yml
 M frontend/index.html
 M frontend/scripts/frontend-smoke.mjs
 M frontend/src/App.jsx
 M frontend/src/components/AudioToggle.jsx
 M frontend/src/components/BattleCard.jsx
 M frontend/src/components/BurnoutMeter.jsx
 M frontend/src/components/CareerModal.jsx
 M frontend/src/components/ContextOfferBanner.jsx
 M frontend/src/components/CrunchTimeBanner.jsx
 M frontend/src/components/DailyQuests.jsx
 M frontend/src/components/EventBanner.jsx
 M frontend/src/components/FlashSaleBanner.jsx
 D frontend/src/components/OnboardingModal.jsx
 D frontend/src/components/OnboardingOverlay.jsx
 M frontend/src/components/PrestigeModal.jsx
 M frontend/src/components/RandomEventToast.jsx
 M frontend/src/components/RewardedVideo.jsx
 M frontend/src/components/ShareButton.jsx
 M frontend/src/components/StatsBar.jsx
 M frontend/src/components/TapArea.jsx
 M frontend/src/components/TeamPanel.jsx
 M frontend/src/game/PhaserGame.js
 M frontend/src/game/scenes/GameScene.js
 M frontend/src/hooks/useGameState.js
?? backend/migrations/057_onboarding_status.sql
?? backend/migrations/058_narrow_onboarding_status.sql
?? backend/tests/onboarding.routes.test.js
?? docs/onboarding-qa-checklist.md
?? frontend/.vercelignore
?? frontend/src/components/OnboardingCoach.jsx
?? frontend/src/hooks/useOverlayManager.js
```

`git diff --stat` headline:
- `31 files changed, 917 insertions(+), 653 deletions(-)`

## What This Dirty Batch Appears To Do
- Replaces the old onboarding modal/overlay with `frontend/src/components/OnboardingCoach.jsx`.
- Moves onboarding truth from fragile localStorage flags to backend-backed status:
  - new `onboarding_status`
  - `onboarding_completed_at`
  - `onboarding_skipped_at`
- Adds backend onboarding routes for:
  - idempotent `POST /api/onboarding/complete`
  - idempotent `POST /api/onboarding/skip`
- Adds onboarding reward config in `backend/src/config/balance.js`.
- Updates `/api/state` response to expose onboarding status and timestamps.
- Adds frontend guardrails around overlay collisions, tap-area layout, and career beat suppression.
- Deletes legacy onboarding components:
  - `frontend/src/components/OnboardingModal.jsx`
  - `frontend/src/components/OnboardingOverlay.jsx`

## Verification Already Run In This Session
- Frontend static smoke:
  - command: `node scripts/frontend-smoke.mjs`
  - cwd: `frontend/`
  - result: `frontend smoke checks passed`
- Backend onboarding route tests:
  - command: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js --runInBand --forceExit tests/onboarding.routes.test.js`
  - cwd: `backend/`
  - result: `PASS tests/onboarding.routes.test.js`
  - suites: `1/1`
  - tests: `20/20`

These checks say the current onboarding batch is internally coherent. They do not prove the real Telegram Mini App UX is correct on-device.

## Important Drift / Caveats
- The previous `HANDOFF.md` content was stale and should not be used as the source of truth for branch, push status, or deploy readiness.
- This branch is not a clean release branch. It is a local cleanup/audit branch with many uncommitted changes.
- The current onboarding migration path uses new migrations `057` and `058`. That is acceptable only because they are higher than the existing migration range in this checkout; do not rewrite older migrations instead.
- `frontend/scripts/frontend-smoke.mjs` now encodes several UX guardrails. If future edits touch overlay/tap behavior, rerun it before claiming a fix.
- Backend tests emit a lot of auth debug logs and still require `--forceExit`; that is noisy but not currently a blocker for this track.

## Recommended Next Steps
1. Keep this checkout on the single `onboarding / product UX` track until it is either committed cleanly or explicitly abandoned.
2. Run a real Telegram Mini App smoke using `docs/onboarding-qa-checklist.md`.
3. If the phone smoke passes, split the dirty tree into atomic local commits roughly in this order:
   - backend migrations + onboarding routes + onboarding tests
   - frontend onboarding coach + state integration
   - frontend overlay/tap-area UX hardening
   - docs/contracts/smoke script updates
4. Do not push, deploy, or run production migrations from this branch without fresh explicit approval.

## Useful Commands
```powershell
cd "C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_fresh"
git status --short --branch
git diff --stat
git log --oneline -5

cd backend
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --runInBand --forceExit tests/onboarding.routes.test.js

cd ..\frontend
node scripts/frontend-smoke.mjs
```
