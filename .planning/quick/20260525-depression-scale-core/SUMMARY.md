---
status: complete
completed: 2026-05-25
---

# Depression Scale Core Summary

Completed:
- Added `DEPRESSION_SCALE` constants: 0-200 range, Affliction at 100, Heart Attack at 200.
- Moved `TAP_MECHANICS.maxDepression` to Heart Attack threshold and exposed `afflictionDepression`.
- Updated backend burnout checks and depression range audit to use the 200 max where safe.
- Added `isAfflicted`/`is_afflicted` to `/api/state` payload without inventing Affliction debuff formulas.
- Updated daily summary depression scoring to normalize against 200.
- Updated frontend tap bar, Phaser depression visuals, and share-card/meme normalization to 200.
- Kept existing depression trigger increments unchanged because Task 2.2 marks new trigger values as `TBD_BALANCE`.

Verification:
- `node --check` passed for modified backend modules.
- `npm test -- --runTestsByPath tests/phase7.unit.test.js tests/phase2.unit.test.js --runInBand` passed for `phase7.unit`; `phase2.unit` skipped because it is DB-gated in this environment.
- `npm run build` in `frontend/` passed.
- Grep confirmed old production `depression / 100`, `maxDepression: 100`, and `depression_level > 100` patterns are gone.

Notes:
- Heart Attack session LOC reset is not implemented in this slice because current data model does not clearly separate session LOC from lifetime LOC in a way that can be changed safely without a dedicated task.
- New trigger increments for bug/deploy/code-review/low-energy remain producer-owned `TBD_BALANCE`.
