---
status: in_progress
created: 2026-05-25
---

# Random Events Engine

Quick task approved by prompt v11.1 execution order, Task 2.3.

Scope:
- Add config for random events with explicit prompt values: frequency 60-120s, EV mix 40/45/15, Golden Commit, Legacy Code, Deploy Friday, neutral events.
- Add pure utility functions for weighted selection and validation.
- Mark `code_review_reject` and `production_alert` as balance-blocked because their effects are `TBD_BALANCE`.

Out of scope:
- Applying random event effects to player state in production routes.
- Inventing missing depression or energy-drain values.
