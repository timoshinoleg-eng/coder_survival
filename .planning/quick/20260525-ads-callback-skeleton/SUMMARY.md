---
status: complete
completed: 2026-05-25
---

# Ads Callback Skeleton Summary

Completed:
- Added callback signature/hash helpers for AdsGram and Propeller in `adProof.js`.
- Added public callback endpoints:
  - `POST /api/rewards/adsgram_callback`
  - `POST /api/rewards/propeller_callback`
- Marked `ad_reward_sessions.status = 'verified'` on valid callbacks.
- Updated `/api/rewards/ad_complete` flow to require `verified` session status for AdsGram/Propeller instead of trusting the raw client event.
- Excluded callback endpoints from initData middleware in `index.js`.

Verification:
- `node --check src/utils/adProof.js`, `src/routes/rewards.js`, and `src/index.js` passed.
- `npm test -- --runTestsByPath tests/phase10.unit.test.js --runInBand` passed: 12/12.
- Node helper check passed for AdsGram HMAC and Propeller MD5 callback validation.

Notes:
- Replay protection is currently achieved by one-time nonce status transitions (`pending -> verified -> used`) on the existing `ad_reward_sessions` store.
