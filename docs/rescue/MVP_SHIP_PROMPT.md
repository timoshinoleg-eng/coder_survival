# MVP Ship Prompt: Coder Survival — Final Bug Hunt & Polish

> **Mode:** SHIP CAPTAIN (no new features, only gap closure)
> **Goal:** Find and fix all remaining errors blocking MVP release
> **Base commit:** `f05d115 [MVP] apply performance quick wins`
> **Already fixed (DO NOT TOUCH):**
> - `/api/state` transaction removed, `/api/tap` N+1 eliminated, DB pool=50
> - `ensureDailyQuests` bulk insert, `updateTeamProgress` TTL-cache
> - `loadState()` in-flight guard, `scene.restart()` removed
> - Health-check `finally`, performance indexes (migration 043)
> - EventManager shutdown, reduced mobile particles

---

## Phase A — Frontend Critical (Do First)

### A1. Batch Taps — Eliminate Serial Queue
**File:** `frontend/src/hooks/useGameState.js`
**Current:** `flushTapQueue()` processes taps one-by-one in `while (pendingTapsRef.current > 0) { await apiRequest("/api/tap", ...) }`
**Problem:** Rapid tapping creates a serial backlog. 10 quick taps = 10 sequential network requests.
**Fix:** Replace with batch request. Send `{ tapCount: pending }` in one request. Backend `tap.js` already has infrastructure to accept a count and apply multiplier.
- If backend doesn't support `tapCount` > 1, add it minimally: multiply `commitsDelta` by count, increment `taps_count` by count, decrement `energy` by count.
- Keep `session_id` logic intact.
- Cap batch at 20 to prevent abuse.

### A2. Monolithic GameProvider — Split or Memoize
**File:** `frontend/src/hooks/useGameState.js`
**Current:** Single context with ~75 fields + ~30 callbacks. Every `setState` triggers re-render of all consumers.
**Fix (minimal viable):** Memoize the `value` object with `useMemo` and ensure all callbacks are wrapped in `useCallback` with stable dependency arrays.
```js
const value = useMemo(() => ({
  ...state,
  tap,
  applyEventDeltas,
  // ... all callbacks
}), [state, tap, applyEventDeltas, /* only truly changing deps */]);
```
- If `useMemo` is insufficient, split into:
  - `PlayerContext` — energy, commits, depression, rank
  - `QuestContext` — daily, weekly, pass
  - `UIContext` — toasts, modals, loading
- Verify with console logging: `StatsBar` should NOT re-render when `randomEventState` changes.

### A3. Phaser Memory Leaks
**File:** `frontend/src/game/scenes/GameScene.js`
**Current:** Emitters and graphics created in `create()` but `SHUTDOWN` listener doesn't destroy them.
**Fix:** In the existing `SHUTDOWN` listener (or create one), iterate and destroy:
```js
[this.steamParticles, this.commitParticles, ...].forEach(e => e?.destroy?.());
[this.depressionOverlay, this.glow].forEach(g => g?.destroy?.());
if (this.tremorShakeTimer) clearInterval(this.tremorShakeTimer);
```

### A4. EventManager Poll Guard
**File:** `frontend/src/game/EventManager.js`
**Current:** `_pollActiveEvent()` is async but has no in-flight guard. Slow network = stacked requests.
**Fix:** Add `this.isPolling` flag. Skip if already polling.

### A5. Timer Cleanup
**Files:** `frontend/src/App.jsx`, `frontend/src/components/StatsBar.jsx`
**Current:** Two overlapping 1-second `setInterval` timers.
**Fix:** Remove `StatsBar` interval. Make `StatsBar` consume `runtimeNow` from `App.jsx` context (or pass as prop). Ensure all `setInterval`/`setTimeout` in `App.jsx`, `TapArea.jsx`, `DailyQuests.jsx`, `RandomEventToast.jsx` are cleaned up on unmount.

### A6. Inline Object Memoization
**Files:** `frontend/src/components/TapArea.jsx`, `frontend/src/components/Confetti.jsx`, `frontend/src/App.jsx`
**Current:** Inline style objects and arrays recreated every render.
**Fix:** Move static style objects outside components. Use `useMemo` for dynamic ones (`activeRuntimeEvents`, `skinTints`, `Confetti.pieces`).

---

## Phase B — Backend Critical

### B1. Fire-and-Forget Audit Log Leak
**File:** `backend/src/routes/tap.js:99–103`
**Current:**
```js
client.query(`INSERT INTO audit_logs ...`).catch(() => {});
```
This runs inside a transaction but is not awaited. If transaction commits/releases while query is in flight, it may hold a connection or throw in background.
**Fix:** Move audit log insert AFTER `COMMIT` or explicitly await it before `COMMIT`.

### B2. Anti-Cheat Memory Leak
**File:** `backend/src/middleware/antiCheat.js:12`
**Current:** `const tapHistory = new Map();` grows forever. No eviction.
**Fix:** After analyzing a user's taps, delete their entry from the Map. Or keep only last 100 user entries with LRU logic.

### B3. `getDailyQuestSummary` Redundancy
**File:** `backend/src/routes/tap.js:266`
**Current:** `getDailyQuestSummary()` calls `ensureDailyQuests()` again even though quests were just ensured and updated above.
**Fix:** Remove `getDailyQuestSummary` call from tap.js. Or make it reuse the already-fetched `daily_quests_state` from the progression row that was `FOR UPDATE`'d at the start of the transaction.

### B4. `applyHeartAttackReset` Extra SELECT
**File:** `backend/src/routes/tap.js:252–255` + `backend/src/utils/heartAttack.js`
**Current:** After heart attack update, tap.js does an extra `SELECT * FROM progression` to re-read.
**Fix:** Make `applyHeartAttackReset` return the updated row via `RETURNING *`, eliminating the extra SELECT.

### B5. `getContextOffer` Inside Tap Transaction
**File:** `backend/src/routes/tap.js:320–330`
**Current:** `getContextOffer` + `recordOfferImpression` run inside the tap transaction.
**Fix:** Move them outside the transaction. Offers don't need to be atomically consistent with the tap.

### B6. State Route Read-Only Optimization
**File:** `backend/src/routes/state.js`
**Current:** Still does `INSERT users`, `UPDATE last_active`, `INSERT progression`, `UPDATE feature_flags` — these are writes.
**Fix:** The previous commit removed BEGIN/COMMIT, which is good. But verify that `state.js` no longer holds a connection open for 45+ queries. If it does, split into:
1. `ensureUser` (UPSERT user, ensure progression) — one quick write
2. `SELECT *` heavy read without transaction

### B7. Missing Error Handler on Async Fire-and-Forget
**File:** `backend/src/routes/tap.js:99–103` (and similar patterns)
**Current:** `.catch(() => {})` swallows errors silently.
**Fix:** At minimum log to `console.error` so failures are visible in observability.

---

## Phase C — Integration & Race Conditions

### C1. Random Event Tap Parallelism
**File:** `frontend/src/App.jsx:92–113`
**Current:** Legacy-code tap handler fires `POST /api/events/random/tap` outside the main tap queue.
**Fix:** Move legacy-code tap decrement into the batch tap request, or serialize it behind the same queue.

### C2. Battle Polling Duplication
**File:** `frontend/src/hooks/useGameState.js:530–565` and `:577–583`
**Current:** Recursive `setTimeout` + `setInterval` both refresh battles.
**Fix:** Remove `setInterval` (lines 577–583). Rely solely on recursive `setTimeout` with in-flight guard.

### C3. Generator Polling Stacking
**File:** `frontend/src/hooks/useGameState.js:585–591`
**Current:** `setInterval` every 60s for generators, no in-flight guard.
**Fix:** Add `isFetchingGenerators` boolean. Skip tick if previous request pending.

### C4. Post-Tap Refresh Debounce
**File:** `frontend/src/hooks/useGameState.js:366–373`
**Current:** `schedulePostTapRefresh()` guards against re-arming but doesn't reset the 2.5s window on new taps.
**Fix:** On each tap, `clearTimeout` existing timer and set new one. This ensures refresh fires only after the tap burst ends.

### C5. Quest Claim Redundancy
**File:** `frontend/src/components/DailyQuests.jsx:49–58`
**Current:** `handleClaim` calls `claimQuests()` (which internally calls `loadState()`) AND then `refreshQuests()`.
**Fix:** Remove the redundant `await refreshQuests()` after `claimQuests()`.

---

## Phase D — iOS WebView Hardening

### D1. Particle Count Device Detection
**File:** `frontend/src/game/scenes/GameScene.js`
**Current:** Particles may still be heavy on iOS.
**Fix:** Add device-tier detection:
```js
const isLowPower = /iPhone|iPad/.test(navigator.userAgent) || navigator.hardwareConcurrency < 4;
const particleMultiplier = isLowPower ? 0.3 : 1;
// Apply to all emit counts
```

### D2. AudioContext iOS Priming
**File:** `frontend/src/utils/AudioManager.js`
**Current:** No iOS autoplay priming.
**Fix:** On first user interaction (tap), call `audioManager.ctx.resume()` explicitly. Pre-create muted `<audio>` element after `Telegram.WebApp.ready()`.

### D3. Resize Debounce
**File:** `frontend/src/game/scenes/GameScene.js`
**Current:** Even without `scene.restart()`, resize may still trigger heavy repositioning.
**Fix:** Debounce resize handler with 200ms. Only act if dimensions changed by >5%.

---

## Phase E — Data Consistency & Edge Cases

### E1. Migration Idempotency
**File:** `backend/migrations/043_performance_indexes.sql`
**Current:** Verify it uses `IF NOT EXISTS`.
**Fix:** If not, add it. Migrations must be safe to re-run.

### E2. `daily_quests_state` JSONB Schema Drift
**File:** `backend/src/utils/dailyQuests.js`, `backend/src/routes/quests.js`
**Current:** Daily quests stored in both `progression.daily_quests_state` (JSONB) and legacy `daily_quests` table.
**Fix:** Ensure `quests.js` routes ONLY read from `progression.daily_quests_state`. If legacy table is still used anywhere, add a fallback read then migrate.

### E3. `event_state` vs `active_random_events` Consistency
**File:** `backend/src/utils/randomEventEngine.js`
**Current:** Events live in both `active_random_events` table and `progression.event_state`.
**Fix:** Verify that `resolveRandomEvent` updates BOTH sources atomically. If `active_random_events` row is resolved but `event_state` is stale, frontend may show inconsistent state on next `loadState()`.

### E4. Rewarded Video Idempotency
**File:** `backend/src/routes/rewards.js`
**Current:** Verify callback endpoints (`/adsgram_callback`, `/propeller_callback`) check for duplicate `event_id` before granting rewards.
**Fix:** If missing, add KV/table check for `event_id` uniqueness with 24h TTL.

### E5. Generator Economy Sanity Check
**File:** `backend/src/utils/generatorEconomy.js`
**Current:** Passive LOC recovery may drift if server restarts.
**Fix:** Verify `recoverPassiveLoc` uses `last_energy_activity_at` (or similar anchor) and not just `NOW()`. Ensure no negative values can be produced.

---

## Phase F — Testing & Verification

### F1. Backend Tests
Run and ensure PASS:
```bash
cd backend
npm test -- mvp.performanceStatic mvp.dailyQuests mvp.randomEvents mvp.tapAnticheat
```
If `mvp.randomEvents` requires DB, set `TEST_DATABASE_URL` or skip gracefully.

### F2. Frontend Build
```bash
cd frontend
npm run build
# Must complete without errors
```

### F3. Smoke Test Script
```bash
cd frontend
npm run smoke
# Must PASS
```

### F4. Live Smoke Checklist
- [ ] Open app, verify state loads < 2s
- [ ] Tap 20 times rapidly — no UI freeze, energy decrements smoothly
- [ ] Claim daily quest — no double API calls in Network tab
- [ ] Trigger random event — choice resolves correctly, no console errors
- [ ] Resize browser window — Phaser scene adapts without crash
- [ ] Leave tab for 2 min, return — state recovers correctly (offline logic)
- [ ] iOS Safari (or devtools mobile emulation) — no particle-related frame drops

### F5. Database Migration Check
```bash
cd backend
npm run migrate
# Must apply cleanly, no errors
```

---

## Commits

Each phase = one atomic commit with prefix `[MVP]`:
```
[MVP] phase A: frontend critical fixes
[MVP] phase B: backend critical fixes
[MVP] phase C: integration race conditions
[MVP] phase D: iOS hardening
[MVP] phase E: data consistency edge cases
```

---

## STOP Conditions (Do NOT Fix)

- **Do NOT** add new features (new skins, new minigames, new event types)
- **Do NOT** redesign the economy model
- **Do NOT** rewrite the anti-cheat from scratch (L2/L3 deferred)
- **Do NOT** change Phaser to another engine
- **Do NOT** refactor for "code beauty" — only fix errors and freezes
- **Balance.js is read-only** — use overrides, not edits
