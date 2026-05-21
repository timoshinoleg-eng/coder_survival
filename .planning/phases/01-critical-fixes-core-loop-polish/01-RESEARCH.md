# Phase 1: Critical Fixes & Core Loop Polish — Research

**Date:** 2026-05-20
**Scope:** TECH-01, TECH-02, TECH-03, TECH-04
**Method:** Static analysis of backend/frontend source + test infrastructure audit

---

## 1. Energy Recovery Fix (TECH-01)

### Current Behaviour

`recoverProgression()` in `backend/src/utils/progression.js:70–154` runs on every authenticated request that touches player state (`/api/state`, `/api/tap`). It computes idle energy from `energy_recovery_checkpoint_at` (or fallback `last_energy_activity_at` / `created_at`) with no minimum idle threshold. The checkpoint is always advanced by `actualRecovered * interval`, even if the player opened the app for 10 seconds. This creates the perception that the timer “resets” on every open.

Key lines:

```javascript
// backend/src/utils/progression.js:83
const secondsPassed = Math.max(0, Math.floor((now.getTime() - checkpoint.getTime()) / 1000));
const energyRecovered = Math.floor(secondsPassed / interval);   // ← no floor threshold
```

When `energyRecovered > 0`, the DB row is updated and `energy_recovery_checkpoint_at` is shifted forward (`line 124–135`). A subsequent call 30 seconds later will see `secondsPassed = 30` and recover nothing, but the *next* interval still starts from the new checkpoint, so the player “loses” the partial progress toward the next energy point.

### Root Cause

1. **No minimum idle gate.** Any `secondsPassed > 0` is accepted.
2. **Checkpoint advances even on zero recovery.** When `actualRecovered <= 0` the function returns early (`line 113–118`) *without* updating the checkpoint, which is actually fine, but the mental model is broken because the caller (`/api/state`) still re-queries and the client-side countdown restarts from `updated_at`.
3. **UX gap.** The frontend never tells the player that energy was recovered while away, so they assume it was lost.

### Implementation Approach

#### Backend — 5-minute threshold

Modify `recoverProgression()` in `backend/src/utils/progression.js`:

```javascript
const MIN_RECOVERY_THRESHOLD_SECONDS = 300; // 5 minutes

// After computing secondsPassed:
if (secondsPassed < MIN_RECOVERY_THRESHOLD_SECONDS) {
  // Still apply passive depression decay if enough time passed,
  // but do NOT advance energy checkpoint and do NOT recover energy.
  // Return current progression unchanged for energy.
  return { ...progression, is_burnout: depression >= TAP_MECHANICS.maxDepression };
}
```

> **Important:** Passive depression decay (`STRESS_V2.DEPRESSION_PASSIVE_DECAY_PER_HOUR`) should still apply if `secondsPassed >= 3600`, otherwise a player who opens the app every 4 minutes never gets depression relief. The current code already handles this in the `energyRecovered <= 0` branch (`lines 91–102`). We preserve that branch but gate the *energy* recovery block behind the 5-minute threshold.

Alternative: apply the threshold only to the **checkpoint advancement**, i.e.:

```javascript
if (secondsPassed < MIN_RECOVERY_THRESHOLD_SECONDS) {
  // Do not advance checkpoint; do not recover energy.
  // But still apply hourly passive depression decay.
}
```

This is the minimal, safest change. It keeps the existing `energy_recovery_checkpoint_at` untouched for short visits, so the timer does not reset.

#### Backend — return `energyRecovered` to frontend

`/api/state` (`backend/src/routes/state.js:376–477`) should include the amount of energy recovered during the idle period so the frontend can animate it.

`recoverProgression()` currently returns the updated row. We can extend its return value (or wrap it) to include:

```javascript
{ recoveredEnergy: 15, recoveredFrom: '2026-05-20T10:00:00Z', recoveredTo: '2026-05-20T10:15:00Z' }
```

Then add `idleRecovery` to the `/api/state` JSON response.

#### Frontend — entry animation

In `frontend/src/hooks/useGameState.js` (`applyServerState`, `lines 131–254`), detect `payload.idleRecovery?.energy > 0` and trigger a toast:

```javascript
showToast(`⚡ Восстановлено +${payload.idleRecovery.energy} энергии за время отсутствия`, 'success', 1500);
```

The toast system already exists (`showToast`). The animation should be non-blocking (<1.5 s) so the player can tap immediately.

### Files to Touch

| File | Lines | Change |
|------|-------|--------|
| `backend/src/utils/progression.js` | 70–154 | Add 5-min gate before energy recovery; preserve passive decay |
| `backend/src/routes/state.js` | 275–280, 376–477 | Pipe `idleRecovery` into response |
| `frontend/src/hooks/useGameState.js` | 131–254 | Toast on `idleRecovery` |

### Concrete Code Pattern

```javascript
// backend/src/utils/progression.js
const MIN_RECOVERY_THRESHOLD_SECONDS = 300;

export async function recoverProgression(client, progression, maxEnergy, featureFlags = {}, now = new Date()) {
  // ... existing anchor/checkpoint logic ...
  const secondsPassed = Math.max(0, Math.floor((now.getTime() - checkpoint.getTime()) / 1000));

  const passiveDepressionDecay = Math.floor((secondsPassed / 3600) * STRESS_V2.DEPRESSION_PASSIVE_DECAY_PER_HOUR);

  // Gate: energy recovery only if idle ≥ 5 minutes
  const shouldRecoverEnergy = secondsPassed >= MIN_RECOVERY_THRESHOLD_SECONDS;
  const energyRecovered = shouldRecoverEnergy ? Math.floor(secondsPassed / interval) : 0;

  if (energyRecovered <= 0) {
    // existing passive-decay branch (lines 91–108)
    // return unchanged energy but possibly reduced depression
  }

  // ... rest of existing energy-recovery logic ...
  return {
    ...result.rows[0],
    _idleRecovery: shouldRecoverEnergy ? { energy: actualRecovered, secondsIdle: secondsPassed } : null
  };
}
```

---

## 2. Depression Economy v2 Activation (TECH-02)

### Current State

The depression economy v2 is **gated by A/B feature flags** that are hardcoded to a 50/50 split:

1. `backend/src/routes/state.js:226`
   ```javascript
   feature_flags: JSON.stringify({ stress_v2: telegramUser.id % 100 < 50 })
   ```
2. `backend/src/routes/tap.js:215`
   ```javascript
   featureFlags: { stress_v2: userId % 100 < STRESS_V2.AB_TEST_PERCENTAGE }
   ```

Because of this, only ~50 % of players see the v2 behaviour. The `high_stress` context offer threshold is 55 % for control cohort and 20 % for test cohort (`backend/src/utils/offers.js:99–101`).

Passive decay is **already implemented** in `recoverProgression` (`progression.js:86–88`) and applies to all players:

```javascript
const passiveDepressionDecay = Math.floor((secondsPassed / 3600) * STRESS_V2.DEPRESSION_PASSIVE_DECAY_PER_HOUR);
```

It fires even when no energy is recovered (`lines 91–102`).

### Activation Plan (per D-03)

1. **Enable `stress_v2` universally.** Replace the A/B modulus logic with `stress_v2: true` in both `state.js` and `tap.js`.
2. **Lower `high_stress` threshold from 55 → 20 %** in `backend/src/config/balance.js` (`CONTEXT_OFFER_RULES.high_stress.depressionThreshold`).
3. **Keep `DEPRESSION_PASSIVE_DECAY_PER_HOUR: 5`** — already in `STRESS_V2` constant (`balance.js:117`).

### Balance Review (per D-04)

With passive decay of 5/hour and threshold at 20 %, a player who taps 100 times (depression +50) and then idles for 10 hours will drop from 50 → 0 depression. This is intentional — it makes the game more forgiving and reduces churn. However, we should monitor:

- `depressionGainPerTap` is `0.5` (`balance.js:81`). At 100 taps depression = +50. With 5/hour decay, a 1-hour play session followed by 10 hours sleep fully resets depression. This aligns with the “casual mobile” design goal.
- If playtesting shows it’s *too* easy, we can tune `DEPRESSION_PASSIVE_DECAY_PER_HOUR` down to `3` without code changes (env override if we add one, or direct constant edit).

### Files to Touch

| File | Lines | Change |
|------|-------|--------|
| `backend/src/config/balance.js` | 25 | `depressionThreshold: 20` (was 55) |
| `backend/src/routes/state.js` | 226, 234 | `stress_v2: true` |
| `backend/src/routes/tap.js` | 215 | `stress_v2: true` |

### Concrete Code Pattern

```javascript
// backend/src/routes/state.js:226
JSON.stringify({ stress_v2: true })   // was: telegramUser.id % 100 < 50

// backend/src/routes/tap.js:215
featureFlags: { stress_v2: true }      // was: userId % 100 < STRESS_V2.AB_TEST_PERCENTAGE

// backend/src/config/balance.js:25
depressionThreshold: 20               // was 55
```

---

## 3. Tap Feedback (TECH-04)

### Haptic Feedback

Current implementation (`frontend/src/hooks/useTelegram.js:9–19`):

```javascript
const haptic = useCallback((type = 'light') => {
  if (tg?.HapticFeedback) {
    try {
      if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
      else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
      else tg.HapticFeedback.impactOccurred(type);
    } catch (e) { /* ignore */ }
  }
}, [tg]);
```

**Gap:** No fallback for non-Telegram environments (desktop browser, PWA outside WebView).

**Fix:** Add `navigator.vibrate(10)` fallback after the Telegram block:

```javascript
const haptic = useCallback((type = 'light') => {
  if (tg?.HapticFeedback) {
    try {
      if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
      else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
      else tg.HapticFeedback.impactOccurred(type);
    } catch (e) { /* ignore */ }
  } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
    // Fallback for non-Telegram browsers
    navigator.vibrate(type === 'light' ? 10 : type === 'medium' ? 15 : 20);
  }
}, [tg]);
```

> Use `light` impact (10 ms) as per D-06. Do not use `heavy` — frequent taps would annoy.

### Visual “Code Line Print”

Current tap visual feedback:
- `TapArea.jsx` DOM float texts (`+N коммита`, `+XP`).
- `GameScene.js` Phaser particles (`commitParticles`, `sparkleParticles`) on `window.__PHASER_GAME__.events.emit('tap')`.

**Gap:** No floating code-line text inside Phaser. The decision (D-07) explicitly asks for Phaser Text/Particle over DOM overlay for consistency.

**Implementation:**

In `frontend/src/game/scenes/GameScene.js`, inside `onTap(data)` (`line 112`), add a short-lived Phaser Text object:

```javascript
const codeSnippets = [
  'git commit -m "fix"',
  'console.log("debug")',
  'npm install hope',
  '/* TODO: sleep */',
  'await coffee()',
  'rm -rf node_modules',
  'git push --force',
  '// it works on my machine'
];

onTap(data) {
  // ... existing particle / flash / shake logic ...

  // Floating code line
  const snippet = codeSnippets[Phaser.Math.Between(0, codeSnippets.length - 1)];
  const text = this.add.text(
    cx + Phaser.Math.Between(-60, 60),
    cy - 20 + Phaser.Math.Between(-20, 20),
    snippet,
    {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#4ade80',
      alpha: 0.9
    }
  ).setOrigin(0.5);

  this.tweens.add({
    targets: text,
    y: text.y - 50,
    alpha: 0,
    duration: 900,
    ease: 'Power1',
    onComplete: () => text.destroy()
  });
}
```

Performance budget: one tween + one text per tap. On a 60 fps device this is negligible (<0.1 ms).

### Files to Touch

| File | Lines | Change |
|------|-------|--------|
| `frontend/src/hooks/useTelegram.js` | 9–19 | Add `navigator.vibrate` fallback |
| `frontend/src/game/scenes/GameScene.js` | 112–157 | Add floating code-line text |

---

## 4. Quest / Battle Pass Progress Display (TECH-03)

### Numeric Progress — Current State

- **Daily Quests:** `DailyQuestsPanel.jsx:264` already shows `${quest.progressValue}/${quest.targetValue}`.
- **Battle Pass:** `PassPanel.jsx:50` shows `Sprint Pass · ${currentLevel}/20` and a bar with `%`. It does **not** show XP numerics (e.g., `450 / 500 XP`).

### Required Additions

1. **Battle Pass numeric XP:** The `pass` object in frontend (`useGameState.js:213`) comes from `/api/pass` which calls `getPassStatus()` (`backend/src/utils/pass.js:192–218`). `normalizePassStatus` does not include `remainingXp` / `nextLevelXp` from `calculatePassLevel`. We need to expose them.

   In `backend/src/utils/pass.js:305–327` (`normalizePassStatus`), add:
   ```javascript
   const levelMeta = calculatePassLevel(status.playerPass ? { currentXp: status.playerPass.current_xp } : {});
   ```
   Then include `nextLevelXp: levelMeta.nextLevelXp, remainingXp: levelMeta.remainingXp` in the normalized response.

   In `PassPanel.jsx`, display:
   ```javascript
   const nextReq = pass?.nextLevelXp || 0;
   const remaining = pass?.remainingXp || 0;
   // render: `${nextReq - remaining}/${nextReq} XP`
   ```

2. **Confetti on quest completion.** The `DailyQuestsPanel.jsx` currently has no celebration when a quest becomes `completed`. We can reuse the `Confetti` component pattern from `LevelUpModal.jsx:7–36`.

   Add a local state `justCompletedQuestId` in `DailyQuestsPanel`. When `daily.quests` changes and a quest transitions to `completed === true`, set the state and render `<Confetti />` for 1.2 s.

3. **Confetti on Pass level-up.** `useGameState.js` already tracks `levelUp` for rank/level. For pass level-up, the `pass` object has no analogous hook. We can add a `useEffect` in `PassPanel` that watches `pass.currentLevel` and triggers confetti when it increases.

### Files to Touch

| File | Lines | Change |
|------|-------|--------|
| `backend/src/utils/pass.js` | 305–327 | Include `nextLevelXp`, `remainingXp` in normalized status |
| `frontend/src/components/PassPanel.jsx` | 13–104 | Add numeric XP label; add confetti on level change |
| `frontend/src/components/DailyQuestsPanel.jsx` | 1–269 | Add confetti component + trigger on quest completion |
| `frontend/src/components/LevelUpModal.jsx` | 7–36 | Extract `Confetti` to shared component (optional but recommended) |

### Shared Confetti Component (Recommended)

Extract from `LevelUpModal.jsx` into `frontend/src/components/Confetti.jsx` so both `LevelUpModal`, `DailyQuestsPanel`, and `PassPanel` can import it.

```javascript
// frontend/src/components/Confetti.jsx
import { h } from 'preact';

export default function Confetti({ pieceCount = 18, duration = 1.2 }) {
  const pieces = Array.from({ length: pieceCount }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 0.4}s`,
    color: ['#facc15', '#4ade80', '#60a5fa', '#c084fc', '#f87171'][Math.floor(Math.random() * 5)]
  }));

  return h('div', {
    style: { position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 50 }
  }, pieces.map(p => h('div', {
    key: p.id,
    style: {
      position: 'absolute', top: '-10px', left: p.left,
      width: '6px', height: '6px', borderRadius: '50%', background: p.color,
      animation: `confetti-fall ${duration}s ease-out ${p.delay} forwards`
    }
  })));
}
```

The `@keyframes confetti-fall` already exists in `frontend/src/assets/animations.css:50–53`.

---

## 5. Testing Strategy (TDD)

### Config

`.planning/config.json` has `workflow.tdd_mode: true`. All backend changes MUST be preceded by failing tests.

### Existing Test Infrastructure

- **Runner:** Jest with `node --experimental-vm-modules`.
- **DB:** PostgreSQL test container (CI) or local Postgres. `TEST_DATABASE_URL` gates test execution (`describeIfDb`).
- **Helpers:**
  - `backend/tests/helpers/testDb.js` — `testPool`, `ensureTestSchema()`, `resetTestDatabase()`, `createInitData()`.
  - `backend/tests/helpers/testServer.js` — `startTestServer()` spins up the Express app on a random port; returns `{ request, close }`.
- **Patterns:**
  - `beforeAll` → `ensureTestSchema()` + `startTestServer()`.
  - `beforeEach` → `resetTestDatabase()`.
  - `afterAll` → `server.close()` + `testPool.end()`.

### New Test Files to Create

#### `backend/tests/phase1.energyThreshold.test.js`

```javascript
import { createInitData, ensureTestSchema, resetTestDatabase, testPool, TEST_DATABASE_URL } from './helpers/testDb.js';
import { startTestServer } from './helpers/testServer.js';

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb('energy recovery 5-min threshold', () => {
  let server;
  beforeAll(async () => { process.env.NODE_ENV = 'test'; await ensureTestSchema(); server = await startTestServer(); });
  beforeEach(async () => await resetTestDatabase());
  afterAll(async () => { if (server) await server.close(); if (testPool) await testPool.end(); });

  test('idle < 5 minutes does not recover energy', async () => {
    // Seed user with energy=50, checkpoint 3 minutes ago
    // GET /api/state → energy should still be 50
    // checkpoint_at should remain unchanged
  });

  test('idle >= 5 minutes recovers energy and advances checkpoint', async () => {
    // Seed user with energy=50, checkpoint 6 minutes ago
    // GET /api/state → energy > 50
    // checkpoint_at should advance
  });

  test('idle >= 5 minutes returns idleRecovery in response', async () => {
    // Verify /api/state payload contains idleRecovery.energy > 0
  });

  test('multiple rapid visits do not double-recover', async () => {
    // Visit at T+6min → recover +N
    // Visit at T+6min+30s → energy unchanged, checkpoint unchanged
  });
});
```

#### `backend/tests/phase1.stressV2.test.js`

```javascript
describeIfDb('stress_v2 activation', () => {
  test('GET /api/state sets featureFlags.stress_v2 = true', async () => {
    // Any user → response.featureFlags.stress_v2 === true
  });

  test('high_stress offer triggers at depression 20%', async () => {
    // Seed user with depression = 20, no cooldowns
    // GET /api/state → contextOffer.type === 'high_stress'
  });

  test('high_stress offer does NOT trigger at depression 19%', async () => {
    // Seed user with depression = 19
    // GET /api/state → contextOffer === null (or other type)
  });

  test('passive depression decay applies after 1 hour idle', async () => {
    // Seed depression = 10, checkpoint 2 hours ago
    // GET /api/state → depression < 10
  });
});
```

#### `backend/tests/phase1.routesSmoke.test.js`

```javascript
describeIfDb('phase 1 regression smoke', () => {
  test('POST /api/tap still commits and decrements energy', async () => {
    // Ensure tap mechanics are untouched
  });

  test('POST /api/tap respects rate limits', async () => {
    // Existing behaviour preserved
  });
});
```

### Frontend Tests

Currently **zero** frontend tests exist. For Phase 1, we will keep frontend testing manual (smoke via browser) because:
1. No test runner is configured for Preact/Phaser (`vite` is build-only).
2. Setting up Vitest + Preact Testing Library is out of scope for a “critical fixes” week.

If time permits, add a minimal `frontend/src/components/__tests__/Confetti.test.jsx` using `vitest` + `@preact/test-utils` as a proof-of-concept for Phase 2.

### Test Execution

```bash
cd backend
npm test -- --testPathPattern="phase1"
```

In CI (`.github/workflows/backend-tests.yml`), the new tests will run automatically because the workflow executes `npm test` without path filters.

---

## 6. Implementation Order (Recommended)

1. **Write failing tests** (`phase1.energyThreshold.test.js`, `phase1.stressV2.test.js`).
2. **Fix energy threshold** (`progression.js` + `state.js` response). Run tests → green.
3. **Activate stress_v2** (`balance.js`, `state.js`, `tap.js`). Run tests → green.
4. **Add haptic fallback** (`useTelegram.js`) — no backend test needed; manual QA on device.
5. **Add Phaser code-line text** (`GameScene.js`) — manual QA.
6. **Extract Confetti + add to Quest/Pass panels** — manual QA.
7. **Run full backend smoke** (`npm test`) to confirm zero regression.

---

## 7. Traceability Matrix

| Requirement | File(s) | Key Function / Component | Test File |
|-------------|---------|--------------------------|-----------|
| TECH-01 5-min threshold | `backend/src/utils/progression.js` | `recoverProgression()` | `phase1.energyThreshold.test.js` |
| TECH-01 idle recovery UX | `frontend/src/hooks/useGameState.js` | `applyServerState()` toast | Manual QA |
| TECH-02 stress_v2 flag | `backend/src/routes/state.js`, `tap.js` | `feature_flags` JSON | `phase1.stressV2.test.js` |
| TECH-02 20% threshold | `backend/src/config/balance.js` | `CONTEXT_OFFER_RULES.high_stress` | `phase1.stressV2.test.js` |
| TECH-04 haptic fallback | `frontend/src/hooks/useTelegram.js` | `haptic()` | Manual QA |
| TECH-04 code line print | `frontend/src/game/scenes/GameScene.js` | `onTap()` | Manual QA |
| TECH-03 BP numeric XP | `backend/src/utils/pass.js` | `normalizePassStatus()` | `phase1.stressV2.test.js` (extend) |
| TECH-03 confetti | `frontend/src/components/Confetti.jsx` | `Confetti` component | Manual QA |

---

*Research complete. Ready for PLAN.md drafting.*
