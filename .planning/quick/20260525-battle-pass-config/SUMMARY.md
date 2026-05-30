---
status: complete
completed: 2026-05-25
---

# Battle Pass Config Summary

Completed:
- Aligned in-memory Sprint Pass levels to linear `level * 100` XP for 20 levels over a 30-day season.
- Added pure helpers: `getPassRequiredXp`, `calculateCatchUpXp`, and `getWeekendXpMultiplier`.
- Added runtime helpers `calculateCappedCatchUpXp` and `applyPassXpSourceMultiplier`.
- Wired catch-up evaluation into `/api/pass` using rolling 7-day personal pass XP from `pass_xp_log`.
- Wired weekend x2 to allowed sources only: `tap_xp`, `quest_xp`, `event_xp`.
- Added config metadata for 70% premium track refund currencies without implementing payout logic.
- Added migration `036_sprint_pass_linear_xp.sql` to align existing `pass_rewards.required_xp` rows.
- Updated focused pass tests and test fixtures.

Verification:
- `node --check src/utils/pass.js` passed.
- `npm test -- --runTestsByPath tests/stage2.oracles.test.js tests/phase4.unit.test.js --runInBand` passed: 21 passed, 2 DB-gated skipped.
- Grep confirmed the old `200 + (level - 1) * 15` pass curve is gone.
- Node helper check passed for XP curve, catch-up formula, weekend multiplier, and level bounds.
- Follow-up runtime helper check passed for catch-up cap and source-scoped weekend multipliers.

Notes:
- Existing pass rewards were preserved because prompt only specifies XP curve and refund ratio, not replacement reward payloads.
