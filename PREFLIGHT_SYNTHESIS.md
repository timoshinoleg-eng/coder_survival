# PREFLIGHT_SYNTHESIS.md
> Фаза 5. Дата: 2026-05-13. Предпусковой отчёт синхронизации Coder Survival.

---

## ТАБЛИЦА ПРОВЕРОК

| # | Проверка | Метод верификации | Результат | Доказательство (файл:строка) |
|---|----------|------------------|-----------|------------------------------|
| 1 | Все P0 из SYNTHESIZED_BATTLE_PLAN закрыты | Сверка 7 P0-задач по коду | **PASS (7 из 7)** | TASK-001–007 ✅; TASK-007: `middleware/antiCheat.js:1-96`, интеграция `tap.js:76-96` |
| 2 | Математика пасса позволяет пройти за 30 дней | Расчёт: `totalXP / dailyXP ≤ 30` | **PASS** | `balance.js:177` → `200+(i-1)*15`; итог 6 850 XP; 6850/235=**29.1 дня** ≤ 30. Подтверждено: `balance.js:229` `assert(totalStage2PassXp === 6850)` |
| 3 | Магазин содержит ≥ 8 бустеров | Сверка `shopCatalog.js` с Документом 2 | **FAIL (5 из 8)** | `shopCatalog.js:1-41` — 5 SKU: `energy_refill`(10⭐), `coffee_break`(25⭐), `depression_cure`(40⭐), `tier_boost`(75⭐), `premium_pass`(200⭐). Недостающие 3 SKU из Документа 2: «Резиновая уточка», «Пижама сеньора», «Двойной эспрессо» |
| 4 | Античит имеет 3 слоя | Проверка `rateLimit.js`, `antiCheat.js`, `balanceAudit.js` | **PASS** | Слой 1: `middleware/rateLimit.js:1-87` ✅; Слой 2: `middleware/antiCheat.js:1-96` (Shannon entropy + CV) ✅; Слой 3: `jobs/balanceAudit.js:1-91` ✅ |
| 5 | Реферальный deep-link работает технически | Проверка `routes/referral.js:118` | **PASS (с оговоркой)** | `routes/referral.js:118` — `?startapp=ref_{id}` технически корректен для TMA. Формат не совпадает с Документом 1 (`start=REF{hash}`, base62), но функционально работает. TASK-009 не закрыт |
| 6 | `high_stress` оффер срабатывает при пороге ≥ 20 | Проверка `tap.js:192` + `offers.js` + `balance.js:22-30` | **PASS (50% аудитории)** | `tap.js:192` → `featureFlags: { stress_v2: userId % 100 < STRESS_V2.AB_TEST_PERCENTAGE }` (`AB_TEST_PERCENTAGE: 50`). Для 50% игроков оффер при депрессии ≥ 20 активен. 50% по-прежнему видят порог 55 — это намеренный A/B |
| 7 | Пассивное восстановление депрессии работает | Проверка `progression.js:86-102` | **PASS** | `progression.js:86-88` → `passiveDepressionDecay = floor((secondsPassed/3600) × 5)`. Применяется и при нулевом, и при положительном энергетическом восстановлении |
| 8 | `low_energy` оффер при 15% энергии | Проверка `balance.js:7` | **PASS** | `balance.js:7` → `energyPercentThreshold: 15` ✅ |
| 9 | Stars fulfillment pipeline не сломан | Проверка `buy.js` + `internalPayments.js` | **PASS** | `buy.js:120-126` — `case 'coffee_break'` добавлен. `internalPayments.js:87-213` — полный pipeline с идемпотентностью по `telegram_payment_charge_id` ✅ |
| 10 | MVP Guard: `/start` → тап → энергия → leaderboard | Статический анализ изменённых файлов | **PASS** | Ни одно из изменений не затрагивает: обработчик `/start` (bot), core tap-цикл (tap.js основной путь), leaderboard (routes/leaderboard.js). `progression.js` — только additive изменения (passive decay поверх существующей логики) |

---

## ДЕТАЛЬНЫЙ MVP GUARD CHECKLIST

| Пункт | Статус | Доказательство |
|-------|--------|----------------|
| `/start` отвечает | ✅ PASS | Не затронуто: bot-директория не изменялась |
| Тап регистрируется, коммиты сохраняются | ✅ PASS | `tap.js` — изменена только строка 192 (`featureFlags`), core-путь не тронут |
| Энергия восстанавливается корректно | ✅ PASS | `progression.js` — additive изменения. `getRecoveryAnchor`, `getRecoveryCheckpoint`, checkpoint-логика не изменены |
| Депрессия обновляется по новой формуле | ✅ PASS | Пассивный decay добавлен как независимый путь поверх energy-based recovery (`progression.js:86-102`) |
| Leaderboard отдаёт актуальные данные | ✅ PASS | `routes/leaderboard.js` не изменялся |
| Нет 500-х ошибок | ✅ PASS | Все новые `case` в `buy.js` покрыты обработкой. `balanceAudit.js` — ошибки поглощаются try/catch, не аффектят основной сервер |
| `high_stress` оффер показывается при достижении порога | ✅ PASS (50% A/B) | `tap.js:192` — флаг `stress_v2` передаётся в `getContextOffer`. При `featureFlags.stress_v2 = true` → порог 20 (`offers.js`) |

---

## ОТКРЫТЫЕ РИСКИ НА МОМЕНТ PREFLIGHT

| Риск | Уровень | Задача | Комментарий |
|------|---------|--------|-------------|
| Магазин содержит 5 из 8 SKU | MED | TASK-010 (P1) | Монетизационная глубина ниже продуктового плана. 3 SKU с конверсией 6-8% отсутствуют |
| Реферальные Stars-награды занижены в 5-20× | MED | TASK-008 (P1) | `stars:10`/`stars:25` vs документальные `200⭐`/`500⭐`. Реферальная виральность ограничена |
| Daily Battle без формулы Rdaily | LOW | TASK-012 (P1) | Структура конфига есть. Победитель определяется без взвешенной формулы |
| Hook Model push-уведомления 5 слотов | LOW | TASK-013 (P1) | Только `NOTIFICATION_HOURS: [9, 15, 21]` для хакатона. Retention-триггеры не работают |
