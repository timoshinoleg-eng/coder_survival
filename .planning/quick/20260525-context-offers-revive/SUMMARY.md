---
status: complete
completed: 2026-05-25
---

# Context Offers Revive Summary

Completed:
- Renamed contextual stress offer from `high_stress` to `stress_warning` in runtime config and matching logic.
- Aligned Task 3.1 thresholds/cooldowns: low energy 15% with 1h cooldown, stress warning 20 with 3h cooldown, near rank 0.85 with 6h cooldown.
- Updated focused stress offer tests to expect `stress_warning`.
- Updated internal observation offer maps to use `stress_warning`.
- Added migration `035_rename_high_stress_offer.sql` to migrate persisted `offer_cooldowns`, `offer_impressions`, and `audit_logs.context.offerType` values safely, including cooldown row merge before rename.

Verification:
- Node constant check passed for thresholds, cooldowns, valid offer types, and priority list.
- Grep confirmed no `high_stress` remains in `backend/src` or `backend/tests`.
- `npm test -- --runTestsByPath tests/phase1.stressV2.test.js --runInBand` skipped because `TEST_DATABASE_URL` is not configured; Jest then hit the existing open-handle hang and was terminated by tool timeout.

Notes:
- Existing unrelated working tree changes were left untouched.
- Migration numbering follows existing `034_fractional_depression.sql`, which was already present as an untracked file before this task.
