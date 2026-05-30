# Backend Gap: Honest Energy Regen Countdown

> **STATUS: RESOLVED on 2026-05-07.**  
> Backend now exposes `progressionUpdatedAt` and `serverNow` in state/tap payloads. Frontend HUD renders a truthful idle countdown.  
> This document is kept for historical context and as a reference for edge-case handling.

## Original Request
UI countdown «+1 energy in MM:SS» (or Russian equivalent) in the HUD when `energy < maxEnergy`.

## Why it was blocked (historical)
The frontend previously could not compute a truthful countdown without a new backend field.

### Missing fields in state/tap payload
- `progression.updated_at` (or `energyLastRecoveredAt` / `lastProgressionUpdateAt`) — authoritative timestamp used by `recoverProgression` as the idle baseline.
- Optional: `serverNow` — exact server time at response generation, to guard against client clock skew.

### Why client-only timer is dishonest
- `recoveryIntervalSeconds` (default 60) only defines the interval length, not when the next tick occurs.
- The idle timer resets on **every** server-side write to `progression` (tap, reward claim, recovery apply) via the DB trigger `trg_progression_updated`. The frontend does not receive this event.
- Starting a local countdown from `Date.now()` at the moment of response assumes the idle window began exactly then, which is false. The actual `updated_at` could be seconds or minutes in the past.
- After a tap, the server resets `updated_at`, but the tap response does not include the new timestamp. Any running client timer would immediately become a lie.

## What was implemented to close the gap
- `GET /api/state` and `POST /api/tap` now return `progressionUpdatedAt` (ISO 8601) and `serverNow`.
- `frontend/src/hooks/useGameState.js` stores both fields and computes `serverClockOffsetMs`.
- `frontend/src/components/StatsBar.jsx` renders the countdown using:
  ```
  nextRecoveryMs = max(0,
    (progressionUpdatedAt + recoveryIntervalSeconds * 1000) - (Date.now() + serverClockOffsetMs)
  )
  ```
- The label explicitly says `+1 энергия через MM:SS, если не тапать` to frame it as idle-only.

## Edge cases to handle when the field is added
1. **Clock skew:** compare client `Date.now()` against server-provided `serverNow` if available; otherwise accept minor skew.
2. **Max energy:** hide countdown when `energy >= maxEnergy`.
3. **Background tab:** on `visibilitychange`, recalculate from the latest known `progressionUpdatedAt` rather than relying on a background `setInterval`.
4. **Rapid tapping:** on every tap response, replace the countdown baseline with the new `progressionUpdatedAt` immediately.
5. **Recovery of multiple points:** if idle time > 1 interval, the server may recover >1 energy at once. The countdown should re-base from the new `progressionUpdatedAt` after that recovery is applied.

## Backend Infra Note (not a support blocker)

Recovery logic in `backend/src/utils/progression.js` relies on the PostgreSQL trigger `trg_progression_updated` (created in `001_init.sql`) to update `progression.updated_at` on **every** UPDATE to the `progression` table.

Some code paths — such as `referral.js` milestone claim and `buy.js` `energy_refill` — do not explicitly set `updated_at = NOW()` in their UPDATE queries, trusting the trigger to do it. If the trigger is ever dropped, disabled, or bypassed (e.g., by bulk SQL), the `updated_at` baseline will stop moving and energy recovery calculations will drift.

**Mitigation:**  
- Never drop `trg_progression_updated` without replacing its behavior.  
- Any new progression UPDATE added in future migrations should either include `updated_at = NOW()` explicitly or rely on the trigger.

## Files changed when the gap was closed
- `frontend/src/components/StatsBar.jsx` — displays the countdown next to the energy bar.
- `frontend/src/hooks/useGameState.js` — stores `progressionUpdatedAt` and `serverClockOffsetMs` in state.
- `backend/src/routes/state.js` — added `progressionUpdatedAt` and `serverNow` to the response payload.
- `backend/src/routes/tap.js` — added `progressionUpdatedAt` to the response payload.
