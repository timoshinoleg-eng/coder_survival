# Phase 5: Discussion Log

**Date:** 2026-05-21
**Method:** Adaptive questioning (3 key gray areas)
**Decisions captured in:** [05-CONTEXT.md](./05-CONTEXT.md)

---

## Area 1: Streak Milestones

**Question:** Streak milestones: в REQUIREMENTS.md указано 7/14/30 дней. В коде сейчас milestones: 3, 7, 14, 21, 30. Какие оставляем?

**User choice:** Только 7 / 14 / 30 (Recommended)

**Rationale:** Строго по REQUIREMENTS.md. 7 = +10% коммитов, 14 = зона «Офис после полуночи», 30 = скин «Ретро-магнитофон».

**Decision:** Убрать 3 и 21 из `STAGE2.STREAK.MILESTONES`. Оставить 7, 14, 30 с соответствующими наградами.

---

## Area 2: Achievement List

**Question:** Ачивки: сейчас 4 штуки (tap_master, commit_king, legacy_zone, night_shift). Нужно ≥10. Использовать готовый список или обсудим?

**User choice:** Готовый список из 10 (Recommended)

**Rationale:** Быстрее, сохраняет единый стиль юмора.

**Decision:** Сгенерирован список 10 ачивок (см. 05-CONTEXT.md). 4 существующие + 6 новых:
- `burnout_first` — 100% depression
- `coffee_addict` — 50 coffees
- `meme_lord` — 10 meme shares
- `bug_hunter` — 100 crit taps
- `referral_god` — 5 friends invited
- `prod_survivor` — 10 "prod down" events

Bonus (Phase 6+): `full_clear_week`, `streak_saver`.

---

## Area 3: Referral Anti-Farm

**Question:** Реферальная антиферма: сейчас проверяется только 20 коммитов. REQUIREMENTS.md требует ещё и 2 дня в игре. Добавляем?

**User choice:** Да, 2 дня + 20 коммитов (Recommended)

**Rationale:** Полная антиферма по REQUIREMENTS.md.

**Decision:** Добавить `first_active_at` в `progression` (migration 027). Проверять `days_since(first_active_at) >= 2` вместе с `commits_total >= 20`.

---

## Implicit Decisions (Pragmatic Lock-ins)

- **Streak recovery:** repeatable, цена растёт: 5 → 10 → 15 Stars (арифметическая прогрессия).
- **Achievement share:** reuse existing `/api/meme` renderer с achievement overlay template.
- **Referral invited reward:** +100 commits + 1 espresso, auto-granted при достижении anti-farm порога.
- **Referral milestone rewards:** 1 friend → +50 commits + energy; 3 friends → +200 commits + energy + stars; 5 friends → skin "Team Lead".

---

## Deferred Ideas

- Achievement leaderboards (Phase 8+)
- Streak insurance subscription (weekly Stars pass) — monetization v2
- Referral pyramid / multi-level — out of scope, consciously rejected

---

*Next step: `/gsd:plan-phase 5`*
