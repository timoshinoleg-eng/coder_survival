---
status: complete
completed: 2026-05-25
---

# Daily Quests Alignment Summary

Completed:
- Aligned daily quest generator to BALANCE v2-supported triggers and fallback farm values.
- Added fallback avgDailyFarm helper for D1-D3: 5000 / 12000 / 25000.
- Applied front-loading x2.5 to main quest `commitsCurrent` rewards for account days 1-3.
- Aligned main quest structure to supported runtime events: login, tap_count 300, commit_total 10000.
- Aligned full-clear bonus to 100 Stars base reward.

Verification:
- `node --check src/utils/dailyQuests.js`, `src/routes/quests.js`, and `src/config/balance.js` passed.
- `npm test -- --runTestsByPath tests/stage2.oracles.test.js --runInBand` passed: 13/13.
- Node helper check passed for front-loading and fallback avgDailyFarm.

Notes:
- This slice avoids inventing a new `daily_farm_log` persistence layer; it uses the specified fallback values until a rolling table is added.
- Bonus quest remains backed by the existing supported bonus pool, but reward sizing now follows the BALANCE v2 bonus reward intent.
