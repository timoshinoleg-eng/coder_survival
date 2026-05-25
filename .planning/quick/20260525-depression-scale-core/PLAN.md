---
status: in_progress
created: 2026-05-25
---

# Depression Scale Core

Quick task approved by prompt v11.1 execution order, Task 2.2.

Scope:
- Implement only the explicit, non-TBD parts of the 0-200 depression scale.
- Add Affliction threshold 100 and Heart Attack threshold 200 constants.
- Preserve existing trigger increments because prompt marks event trigger values as `TBD_BALANCE`.
- Update UI normalization that assumed 0-100 where needed.

Out of scope:
- New depression growth trigger values for bug/deploy/code-review/low-energy events.
- New Affliction debuff behavior beyond exposing constants/state unless existing mechanics map safely.
- Heart Attack session LOC reset unless current code already has session LOC semantics to preserve lifetime LOC safely.
