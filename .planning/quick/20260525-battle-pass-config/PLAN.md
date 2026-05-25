---
status: in_progress
created: 2026-05-25
---

# Battle Pass Config

Quick task approved by prompt v11.1 execution order, Task 4.2.

Scope:
- Align explicit Sprint Pass config values: 30 days, 20 levels, linear XP `level * 100`.
- Add pure helpers for catch-up XP and weekend XP multiplier.
- Preserve current pass reward catalog unless prompt gives replacement reward values.

Out of scope:
- Choosing `avgDailyXP` source for production catch-up calculation; that remains a producer/research input.
- Premium refund implementation details beyond config metadata.
