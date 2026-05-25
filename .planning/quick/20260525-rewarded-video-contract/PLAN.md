---
status: in_progress
created: 2026-05-25
---

# Rewarded Video Contract

Quick task approved by prompt v11.1 execution order, Task 3.3.

Scope:
- Use `backend/src/routes/rewards.js` as canonical rewarded-ad route because it already has server-side session/proof validation and idempotency via nonce.
- Add prompt contract endpoint `/api/rewards/ad_complete` with `event_id` and `ad_network`.
- Align daily limit to 5 and reward to `maxEnergy * 0.5`.
- Align frontend remaining display with 5/day where the current rewarded video component uses legacy status data.

Out of scope:
- Real AdsGram/Propeller provider integration secrets beyond contract mapping.
- Removing legacy `/api/rewarded-video` route unless safe after inspection.
