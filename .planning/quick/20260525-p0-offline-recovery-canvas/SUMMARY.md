---
status: complete
completed: 2026-05-25
---

# P0 Offline Recovery And Canvas Summary

Completed:
- Added explicit recovery constants for the approved P0 contract: 300s idle threshold, 5 depression/hour, 90s newbie interval, 120s veteran interval.
- Updated progression recovery to use those constants and avoid touching `updated_at` during recovery-only writes.
- Enforced `Phaser.CANVAS` in the production Phaser bootstrap.
- Updated the idle regen smoke expectation from the previous 40s newbie interval to the approved 90s interval.

Verification:
- `npm test -- --runTestsByPath tests/phase1.energyThreshold.test.js tests/phase1.stressV2.test.js tests/smoke.idleEnergyRegen.test.js --runInBand` skipped because `TEST_DATABASE_URL` is not configured in this environment.
- `npm test -- --runTestsByPath tests/phase10.unit.test.js --runInBand` passed.
- `npm run build` in `frontend/` passed.
- Grep confirmed production code uses `Phaser.CANVAS` and has no `Phaser.AUTO`/`Phaser.WEBGL` matches.

Notes:
- Existing unrelated working tree changes were left untouched.
- Offer rename, rewarded ads consolidation, generator matrix, and anticheat expansion remain out of this quick task scope.
