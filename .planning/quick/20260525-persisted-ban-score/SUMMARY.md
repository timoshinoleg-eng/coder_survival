---
status: complete
completed: 2026-05-25
---

# Persisted Ban Score Summary

Completed:
- Added persisted `progression.anti_cheat_state` via migration `038_anticheat_state.sql`.
- Added helpers in `anticheat.js` for normalized state, ban-score increment, reward penalty multiplier, and LOC penalty.
- Updated middleware to expose `incrementReason`.
- Persisted ban-score increments in `tap.js` and applied graduated LOC penalty to tap rewards.
- Applied the same LOC penalty to passive generator output in `generatorEconomy.js`.
- Applied graduated reward penalty to `ad_rewards` and Stage 2 quest/full-clear rewards.
- Hid punished users from leaderboard queries when `banScore >= 50`.

Verification:
- `node --check` passed for modified anticheat/tap/leaderboard/generator economy modules.
- `npm test -- --runTestsByPath tests/phase6.unit.test.js --runInBand` passed: 24/24.
- Node helper check passed for ban-score increment, leaderboard hide threshold, and LOC penalties.
- Follow-up sanction scope checks passed for `ad_rewards` and `quest_rewards` payload scaling.

Notes:
- This slice wires sanctions to `tap_loc`, `generator_output`, and `leaderboard_ban`. It does not yet apply penalties to all quest/ad reward categories.
