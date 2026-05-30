---
status: complete
completed: 2026-05-25
---

# Random Events Engine Summary

Completed:
- Added `backend/src/config/events.js` with random event frequency 60-120s and explicit prompt event definitions.
- Added pure utility functions for random event definitions, weight summaries, balance-gap reporting, and weighted selection.
- Kept balance-blocked events out of default picker until their `TBD_BALANCE` effects are resolved.
- Added focused unit/oracle coverage for explicit weights, balance gaps, and deterministic selection.

Verification:
- `node --check src/config/events.js` and `node --check src/utils/events.js` passed.
- `npm test -- --runTestsByPath tests/stage4.oracles.test.js --runInBand` passed: 10/10.
- Node pure-function check passed for weight summary, balance gaps, and deterministic first event.

Notes:
- Positive target is 15 but explicit prompt event weights only define `golden_commit` at 10. This is reported as a balance gap instead of inventing a 5-weight event.
- `code_review_reject.effect.depression` and `production_alert.effect.energyDrain` remain unresolved `TBD_BALANCE`.
