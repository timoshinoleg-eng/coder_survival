---
status: in_progress
created: 2026-05-25
---

# Balance v2 Defaults

Task from producer: apply BALANCE v2.0 (HOOK-OPTIMIZED) as defaults.

Scope:
- Add all supplied values as `DEFAULTS` in `backend/src/config/balance.js`.
- Implement required `FTUE_ACCELERATION` defaults/helpers.
- Implement required `FTUE_EVENT_SUPPRESSION` in random event selection.
- Align existing pass/ads/depression defaults where code already has matching safe integration points.

Out of scope:
- Large DB-backed feature implementations for squads, anticheat sanctions, callbacks, and full generator ownership unless supported by existing schema in this slice.
