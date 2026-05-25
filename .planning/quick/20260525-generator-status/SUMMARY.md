---
status: complete
completed: 2026-05-25
---

# Generator Status Summary

Completed:
- Added persistent `generator_state` and `session_started_at` columns via migration `037_generator_state_and_session_anchor.sql`.
- Added `backend/src/utils/generatorState.js` to normalize generator ownership and build passive LOC status from BALANCE v2 defaults.
- Exposed `generatorState` from `/api/state` with FTUE acceleration window, per-tier costs/output, unlock state, and total passive LOC/sec.

Verification:
- `node --check src/utils/generatorState.js` and `node --check src/routes/state.js` passed.
- `npm test -- --runTestsByPath tests/stage2.oracles.test.js --runInBand` passed: 12/12.
- Node helper check passed for generator passive LOC/sec and unlock state.

Notes:
- This slice exposes generator status and math only. It does not yet add generator purchase/minting routes or passive LOC accrual writes.
