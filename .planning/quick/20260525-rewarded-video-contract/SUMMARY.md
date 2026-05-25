---
status: complete
completed: 2026-05-25
---

# Rewarded Video Contract Summary

Completed:
- Added `/api/rewards/ad_complete` with prompt contract fields `event_id` and `ad_network`.
- Bound `event_id` to the existing server-created ad session nonce, preserving ownership, expiry, single-use idempotency, daily limit, cooldown, and reward application checks.
- Extended allowed providers with `adsgram` and `propeller`; provider enablement is controlled by env flags.
- Aligned rewarded video daily limit to 5 in `STAGE2.REWARDED_VIDEO` and frontend display.
- Kept legacy `/api/rewarded-video` route mounted to avoid breaking the existing UI while canonical `/api/rewards/*` remains available.
- Updated legacy rewarded-video ceiling test expectation from 3/day to 5/day.

Verification:
- `node --check src/routes/rewards.js` passed.
- `npm run build` in `frontend/` passed.
- Grep confirmed the old hardcoded rewarded video display `/3` is gone.
- `npm test -- --runTestsByPath tests/stage2.rewardedVideo.test.js --runInBand` skipped because `TEST_DATABASE_URL` is not configured; Jest then hit the existing open-handle hang and was terminated by tool timeout.
- Direct ESM import of `src/routes/rewards.js` is not usable as a lightweight check because the existing route imports `pool` from `src/index.js`, creating an index/router import cycle during standalone import.

Notes:
- Real AdsGram/Propeller cryptographic proof is not implemented because the plan does not specify their verification algorithm/secrets. The endpoint does not accept arbitrary event IDs; it requires a server-issued session nonce.
