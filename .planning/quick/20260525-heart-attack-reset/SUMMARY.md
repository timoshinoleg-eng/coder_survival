---
status: complete
completed: 2026-05-25
---

# Heart Attack Reset Summary

Completed:
- Added `backend/src/utils/heartAttack.js`.
- Wired one-time Heart Attack reset into `tap.js` on first transition to `depression >= 200`.
- Reset behavior now clears `active_effects`, resets `session_started_at`, and zeroes `sessions.commits_earned` for the active session.
- Exposed `heartAttackReset` in tap response.

Verification:
- `node --check src/utils/heartAttack.js` and `node --check src/routes/tap.js` passed.
- `npm test -- --runTestsByPath tests/phase10.unit.test.js --runInBand` passed: 10/10.
- Node helper check passed for reset call shape and preserve-fields contract.

Notes:
- This slice preserves lifetime `commits_total`, inventory, skins, generator ownership, pass XP, and streaks as requested.
