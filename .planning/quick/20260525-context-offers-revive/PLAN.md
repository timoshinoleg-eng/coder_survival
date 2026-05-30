---
status: in_progress
created: 2026-05-25
---

# Context Offers Revive

Quick task approved by prompt v11.1 execution order, Task 3.1.

Scope:
- Rename the stress offer from `high_stress` to `stress_warning` per prompt.
- Align thresholds and cooldowns: low energy 15% / 1h, stress 20 / 3h, near rank 0.85 / 6h.
- Preserve persisted data safely with a migration for existing `offer_cooldowns`, `offer_impressions`, and observation rows if present.
- Update focused tests.

Out of scope:
- Rewarded ads consolidation.
- Shop bundle effect alignment.
- Any new offer mechanics not defined in the prompt.
