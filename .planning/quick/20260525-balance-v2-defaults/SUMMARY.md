---
status: complete
completed: 2026-05-25
---

# Balance v2 Defaults Summary

Completed:
- Added producer-supplied BALANCE v2.0 values as `DEFAULTS` in `backend/src/config/balance.js`.
- Added generator defaults and FTUE acceleration helpers in `backend/src/config/generators.js`.
- Implemented `FTUE_EVENT_SUPPRESSION` in random event selection.
- Resolved random event positive gap with `hot_streak` and filled code-review/production-alert effects.
- Aligned pass refund metadata and rewarded-ad default cooldown/limits to `DEFAULTS`.
- Updated AdsGram/Propeller provider readiness to use `ADSGRAM_SECRET` and `PROPELLER_SECRET`.

Verification:
- `node --check` passed for `balance.js`, `generators.js`, `events.js`, `utils/events.js`, and `routes/rewards.js`.
- `npm test -- --runTestsByPath tests/stage2.oracles.test.js tests/stage4.oracles.test.js --runInBand` passed: 22/22.
- Node defaults check passed for BALANCE version, FTUE generator cost/output, event weights, FTUE event suppression, and ad cooldown.

Notes:
- Large behavior systems from DEFAULTS (full squads, anticheat sanctions, ad callbacks, daily farm log) are now represented in DEFAULTS but not fully wired in this slice.
