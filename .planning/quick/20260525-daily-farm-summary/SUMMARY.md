---
status: complete
completed: 2026-05-25
---

# Daily Farm Summary Exposure

Completed:
- Added `getDailyFarmSummary` helper on top of `daily_farm_log`.
- Exposed `dailyFarm` from `/api/state` with rolling average and last 7 days summary.
- Added `dailyFarm` to frontend game state.
- Surfaced average daily farm in the main HUD next to generator passive income.

Verification:
- `node --check src/utils/farmLog.js` and `src/routes/state.js` passed.
- `npm run build` in `frontend/` passed.
- Node helper check passed for rolling average and recent farm rows.

Notes:
- This keeps the first consumer simple: avg daily farm is visible in the HUD, while the detailed recent days list remains available in state for future panels/analytics UI.
