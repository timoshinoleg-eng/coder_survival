---
status: complete
completed: 2026-05-25
---

# Squad Social Multiplier Summary

Completed:
- Added squad passive LOC multiplier helpers in `backend/src/utils/teams.js`.
- Implemented UTC-based `hasMissedYesterday` detection.
- Implemented BALANCE v2 formula:
  - base `1.0 + (active_members / total_members) * 0.5`
  - `-20%` social obligation reduction when any member missed yesterday
  - `x1.5` first-squad-week onboarding bonus
- Exposed `passiveLocMultiplier`, `socialObligationActive`, `activeMembers`, and `timezone` from team status.
- Exposed passive squad multiplier and social obligation state from `teamHackathon` status.

Verification:
- `node --check src/utils/teams.js`, `src/routes/teamHackathon.js`, and `src/routes/team.js` passed.
- `npm test -- --runTestsByPath tests/stage3.oracles.test.js --runInBand` passed: 8/8.
- Grep confirmed multiplier fields are wired in backend src.

Notes:
- This slice adds status/runtime helper exposure only. It does not yet apply the passive multiplier to a real passive income pipeline because that pipeline is not currently implemented as a dedicated generator economy in production code.
