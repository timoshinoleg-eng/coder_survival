---
status: complete
completed: 2026-05-25
---

# Generator Backend Flow Summary

Completed:
- Added passive generator LOC accrual helper in `backend/src/utils/generatorEconomy.js`.
- Added generator purchase helper using `commits_current` as the spendable LOC bucket.
- Added new authenticated route `backend/src/routes/generators.js` with:
  - `GET /api/generators`
  - `POST /api/generators/buy`
- Mounted generators route in `backend/src/index.js`.
- Wired passive generator recovery into `/api/state` and exposed `passiveLocRecovery`.

Verification:
- `node --check src/utils/generatorState.js`, `src/utils/generatorEconomy.js`, `src/routes/generators.js`, `src/routes/state.js`, and `src/index.js` passed.
- `npm test -- --runTestsByPath tests/stage2.oracles.test.js tests/phase10.unit.test.js --runInBand` passed: 21/21.
- Node helper check passed for generator passive LOC/sec, unlock state, and junior generator purchase cost.

Notes:
- This slice does not yet add frontend generator UI, but the backend state and purchase endpoints are now available.
