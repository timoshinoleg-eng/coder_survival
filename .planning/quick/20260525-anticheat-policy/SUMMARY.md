---
status: in_progress
completed: 2026-05-25
---

# Anticheat Policy Summary

Completed:
- Added `backend/src/utils/anticheat.js` with pure helpers for BALANCE v2 anticheat policy.
- Added ban-score increment mapping, CPS detection, missing-fatigue detection, graduated sanction tiers, and honest-play score decay.
- Updated existing `middleware/antiCheat.js` to use BALANCE v2 L1/L2 thresholds and ban-score increments without changing the tap route contract.
- Added focused unit coverage in `backend/tests/phase6.unit.test.js`.

Verification:
- `node --check src/utils/anticheat.js` and `node --check src/middleware/antiCheat.js` passed.
- `npm test -- --runTestsByPath tests/phase6.unit.test.js --runInBand` passed: 22/22.
- Node pure-helper check passed for CPS, fatigue, tiering, and decay.

Notes:
- This slice adds the policy layer and better thresholds, but not a full persisted `ban_score` data model or L3 hourly balance-recon enforcement yet.
