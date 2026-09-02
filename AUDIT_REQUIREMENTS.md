# AUDIT_REQUIREMENTS.md

# Требования из Документа 4: «Продуктовый аудит Coder Survival: Due Diligence Report v2»

> Исходный аудит: 2026-05-08. Актуальная сверка реализации: 2026-09-02. 14 рекомендаций: 8 P0 + 6 P1.

## Статус

| ID | Приоритет | Требование | Текущий статус | Реализация / проверка |
|---|---|---|---|---|
| D4-001 | P0 | Не использовать `updated_at` как idle-anchor энергии | **DONE** | Энергия восстанавливается от `last_energy_activity_at` / `energy_recovery_checkpoint_at`; tap обновляет оба energy-anchor. |
| D4-002 | P0 | Порог high-stress = 20 | **DONE** | `CONTEXT_OFFER_RULES.stress_warning.depressionThreshold = 20`; tap передаёт активный `stress_v2` signal. |
| D4-003 | P0 | Порог low-energy offer = 15% | **DONE** | `CONTEXT_OFFER_RULES.low_energy.energyPercentThreshold = 15`. |
| D4-004 | P0 | First-purchase bonus | **DONE** | `coffee_break` opt-in `first_purchase_bonus`; server-side x2 fulfillment под PostgreSQL advisory lock; sequential и concurrent replay одного Telegram charge идемпотентны и не кредитуют повторно. |
| D4-005 | P0 | Rewarded video: +50% max energy | **DONE / EXISTING** | Rewarded-video backend уже выдаёт 50% max energy; сохранён как проверенная существующая реализация. |
| D4-006 | P0 | Промежуточная цена 20–25⭐ | **DONE** | `coffee_break` = 25⭐; также существует one-time `starter_pack` = 25⭐. |
| D4-007 | P0 | Цветовые зоны энергии + объяснение stress timing | **DONE** | UI: `<10%` red/critical, `10–30%` yellow/warning, `>30%` green/healthy; предупреждение объясняет дополнительный stress ниже игровых порогов. Boundary tests: 9/10/30/31%. |
| D4-008 | P0 | Passive depression recovery = 5/час | **DONE** | Единственный balance constant = 5/час; recovery независим от energy refill/feature flag. Regression: 20 → 15 за один idle-час при полной энергии. |
| D4-009 | P1 | Верифицировать 30-дневную проходимость Sprint Pass | **DONE** | Production/compat curve синхронизирована с DB: 20 уровней, 915 XP суммарно в `pass_rewards`; `player_passes` стартует с level 1, поэтому фактический unlock level 20 = 835 XP. Даже консервативный baseline 120 tap XP/day = 3600 XP/30d без quest/weekend bonuses. Tap, quest и streak XP теперь пишутся в одну DB-модель `player_passes`. |
| D4-010 | P1 | Near-rank escalation 85% → better offer, 95% → last chance; cooldown 6h | **DONE** | `near_rank.progressThreshold = 0.85`, cooldown 6h; payload variants `better_offer` / `last_chance` с 95% escalation. |
| D4-011 | P1 | Escalating daily-login bonus с пиком на 7-й день | **DONE** | Server-side `LOGIN_STREAK_BONUS`: day 1–7, peak day 7 = +30 energy / -10 stress; successful daily claim идемпотентен, audit log сохраняет bonus day/reward. |
| D4-012 | P1 | Audio lifecycle для TMA (`visibilitychange` + `pagehide`) | **DONE** | `AudioManager` suspend/pause на hidden/pagehide и resume на visible/pageshow; listeners снимаются в `dispose()`. |
| D4-013 | P1 | Ogg Vorbis, audio bundle ≤2 MB | **DONE** | CI regression перечисляет audio assets, запрещает не-OGG audio и проверяет суммарный размер ≤2 MiB. |
| D4-014 | P1 | Streak Saver 1⭐ перед обрывом streak | **DONE (paid variant)** | `streak_saver` = 1⭐; offer появляется в двухчасовом окне до **локальной** полуночи игрока, учитывает min interval; Telegram Stars fulfillment server-side arm-ит saver на локальную дату. Referral/social mechanics остаются отдельным механизмом. |

## Проверочная матрица

- `backend/tests/p0p1AuditRequirements.test.js` — контрактные P0/P1 thresholds, pass pacing и единый DB pass path.
- `backend/tests/progression.passiveDecay.test.js` — D4-008: ровно 5 stress/hour.
- `backend/tests/stage2.oracles.test.js` — 20-level Sprint Pass compatibility curve и XP boundaries.
- `backend/tests/payments.firstPurchaseBonus.test.js` — D4-004: first x2, sequential replay, second purchase x1 и concurrent same-charge replay.
- `frontend/tests/energyUi.test.mjs` — D4-007 boundary states.
- `frontend/tests/audio-assets.test.mjs` — D4-013 OGG-only / ≤2 MiB.

Одноразовая проверка унификации на ветке `fix/p0-p1-audit-requirements` прошла с PostgreSQL-backed backend regressions, frontend tests и production build. Временные write-workflows после проверки удалены из итогового diff.

## Вне scope Документа 4

P0 по историческим `.env` уже удалён из публичных branches/tags отдельным history rewrite и полным secret scan. GitHub-managed read-only refs `refs/pull/7/head`, `refs/pull/8/head`, `refs/pull/9/head` требуют server-side purge/GC через GitHub Support; это отдельный repository-security action и не относится к 14 продуктовым требованиям выше.
