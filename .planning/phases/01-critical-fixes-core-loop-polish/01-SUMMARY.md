# Phase 01 Summary: Critical Fixes & Core Loop Polish

**Executed:** 2026-05-20
**Tasks completed:** 14 / 14
**Commits made:** 15

---

## Wave 1: TDD Foundation + Energy Recovery Fix (TECH-01)

| Task | Commit | Status |
|------|--------|--------|
| P01-W1-T1 RED: energy threshold tests | `test(01): RED energy threshold tests — 5-min idle gate` | ✅ Done |
| P01-W1-T2 GREEN: 5-min gate in recoverProgression() | `feat(01): GREEN 5-min energy recovery gate in recoverProgression()` | ✅ Done |
| P01-W1-T3 REFACTOR: idleRecovery in /api/state + toast | `refactor(01): idleRecovery in /api/state response + frontend toast` | ✅ Done |

**Key changes:**
- Added `MIN_RECOVERY_THRESHOLD_SECONDS = 300` to `backend/src/utils/progression.js`
- Energy recovery only triggers when `secondsPassed >= 300`
- `_idleRecovery` object returned from `recoverProgression()` when recovery occurs
- `idleRecovery` piped through `/api/state` JSON response
- Frontend toast shows `⚡ Восстановлено +N энергии за время отсутствия` on idle recovery

---

## Wave 2: Stress V2 Activation (TECH-02)

| Task | Commit | Status |
|------|--------|--------|
| P01-W2-T1 RED: stress_v2 activation tests | `test(01): RED stress_v2 activation tests — universal flag + 20% threshold` | ✅ Done |
| P01-W2-T2 GREEN: activate stress_v2 universally | `feat(01): GREEN activate stress_v2 universally + lower threshold to 20%` | ✅ Done |
| P01-W2-T3 REFACTOR: remove dead A/B vars | `refactor(01): remove dead AB_TEST_PERCENTAGE variable` | ✅ Done |

**Key changes:**
- `stress_v2: true` universally in `backend/src/routes/state.js` and `backend/src/routes/tap.js`
- `CONTEXT_OFFER_RULES.high_stress.depressionThreshold` lowered from 55 → 20
- Removed unused `STRESS_V2.AB_TEST_PERCENTAGE` from `backend/src/config/balance.js`

---

## Wave 3: Quest & Pass Progress + Confetti (TECH-03)

| Task | Commit | Status |
|------|--------|--------|
| P01-W3-T1 RED: pass numeric XP test | `test(01): RED pass numeric XP test — nextLevelXp and remainingXp` | ✅ Done |
| P01-W3-T2 GREEN: normalizePassStatus XP fields | `feat(01): GREEN add nextLevelXp and remainingXp to normalizePassStatus` | ✅ Done |
| P01-W3-T3 Extract Confetti component | `feat(01): extract reusable Confetti component from LevelUpModal` | ✅ Done |
| P01-W3-T4 PassPanel numeric XP + confetti | `feat(01): PassPanel numeric XP label and level-up confetti` | ✅ Done |
| P01-W3-T5 DailyQuestsPanel confetti | `feat(01): DailyQuestsPanel confetti on quest completion` | ✅ Done |

**Key changes:**
- `calculatePassLevel` result now exposed through `normalizePassStatus` as `nextLevelXp` and `remainingXp`
- Reusable `frontend/src/components/Confetti.jsx` extracted from `LevelUpModal.jsx`
- `PassPanel.jsx` displays XP progress (`currentLevelXp / nextLevelXp XP`) and shows confetti on level-up
- `DailyQuestsPanel.jsx` shows confetti when a quest transitions to `completed === true`

---

## Wave 4: Tap Feedback (TECH-04)

| Task | Commit | Status |
|------|--------|--------|
| P01-W4-T1 Haptic fallback navigator.vibrate | `feat(01): navigator.vibrate fallback in haptic feedback` | ✅ Done |
| P01-W4-T2 Phaser floating code line | `feat(01): floating code-line text animation on tap in GameScene` | ✅ Done |
| P01-W4-T3 GREEN: regression smoke tests | `test(01): GREEN phase 1 regression smoke tests` | ✅ Done |

**Key changes:**
- `useTelegram.js` `haptic()` now falls back to `navigator.vibrate()` for non-Telegram browsers
- `GameScene.js` renders a random code snippet (`git commit -m "fix"`, `console.log("debug")`, etc.) on each tap with upward-fade tween
- `backend/tests/phase1.routesSmoke.test.js` guards against tap mechanics regressions

**Post-commit fixes:**
- Fixed case-sensitivity bug (`CODE_SNIPPETS` → `codeSnippets`) in `GameScene.js`
- Hardened smoke-test rate-limit case to avoid antiCheat interference (`fix(01): correct case-sensitive codeSnippets reference and harden smoke tests`)

---

## Verification

### Backend
- `node --check` passed on all modified `.js` files
- Pre-existing unit test failure in `stage2.oracles.test.js` (`pass boundary: 99/100 XP`) was present before Phase 1 and is unrelated to these changes
- DB-dependent tests could not run in this environment due to missing PostgreSQL instance

### Frontend
- `npm run build` passes cleanly with zero errors
- All modified components compile correctly

### Files Modified
- `backend/src/utils/progression.js`
- `backend/src/routes/state.js`
- `backend/src/routes/tap.js`
- `backend/src/config/balance.js`
- `backend/src/utils/pass.js`
- `frontend/src/hooks/useTelegram.js`
- `frontend/src/hooks/useGameState.js`
- `frontend/src/game/scenes/GameScene.js`
- `frontend/src/components/PassPanel.jsx`
- `frontend/src/components/DailyQuestsPanel.jsx`
- `frontend/src/components/LevelUpModal.jsx`
- `frontend/src/components/Confetti.jsx` (new)
- `backend/tests/phase1.energyThreshold.test.js` (new)
- `backend/tests/phase1.stressV2.test.js` (new)
- `backend/tests/phase1.passXp.test.js` (new)
- `backend/tests/phase1.routesSmoke.test.js` (new)

---

## Issues Encountered
1. **No local PostgreSQL available** — Docker Desktop is not running and `psql`/`pg_isready` are not installed. All DB-dependent integration tests fail with `AggregateError` from `pg-pool`. Unit/oracle tests (stage3, stage4) pass. The pre-existing `stage2.oracles.test.js` failure (`addPassXp` 99/100 boundary) is unrelated to Phase 1.
2. **Case-sensitivity bug in GameScene.js** — The committed `onTap()` code referenced `CODE_SNIPPETS` (uppercase) while the module-level constant was declared as `codeSnippets` (lowercase). This was caught during review and fixed in a follow-up commit.
3. **Smoke test antiCheat interference** — The initial smoke test for rate limits sent 30 sequential taps, which triggered the in-memory antiCheat pattern detector. Fixed by lowering the `RATE_LIMIT_MAX_TAPS_PER_SECOND` env var to 2 and using only 5 parallel requests, staying safely below the `MIN_TAPS_FOR_ANALYSIS = 10` threshold.

---

*Phase 01 execution complete. All tasks implemented and committed atomically.*
