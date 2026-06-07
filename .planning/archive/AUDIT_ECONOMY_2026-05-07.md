# Coder Survival — Economy & Drift Audit
**Дата:** 2026-05-07  
**Источники:** `HANDOFF.md`, `project-status.json`, текущее содержимое repo  
**Статус:** рутинный аудит, код не менялся

---

## 1. Economy Table (compact)

### 1.1 Context Offers
| Тип | Приоритет | Условие | Кулдаун | Продукт | Цена (⭐) | Действие |
|-----|-----------|---------|---------|---------|----------|----------|
| `low_energy` | 1 | Энергия ≤ 25% | 90 м | `energy_refill` | 10 | Зарядиться |
| `near_rank` | 2 | Прогресс уровня ≥ 72% | 2 ч | `tier_boost` | 75 | Дожать |
| `high_stress` | 3 | Депрессия ≥ 55 | 3 ч | `depression_cure` | 40 | Сбросить стресс |
| **global** | — | — | **90 с** | — | — | — |

*Источник:* `backend/src/config/balance.js` (строки 1–31)

### 1.2 Shop Catalog (backend source-of-truth)
| ID | Название | Цена (⭐) | Эффект (backend) | Категория |
|----|----------|----------|------------------|-----------|
| `energy_refill` | Энергетик | 10 | Восстановление энергии до maxEnergy | energy |
| `depression_cure` | Терапия | 40 | Снятие стресса −60 | stress |
| `tier_boost` | Буст коммитов | 75 | +40 XP, +50 commitsCurrent | boost |
| `premium_pass` | Premium Pass | 200 | Разблокировка premium-трека | pass |

*Источник:* `backend/src/utils/shopCatalog.js` + `backend/src/routes/buy.js` applyItemEffect

### 1.3 Weekly Hackathon
- **Target:** 650 commits
- **Reward:** +80 energy, +60 commitsCurrent, −15 stress

*Источник:* `backend/src/config/balance.js` строки 57–62

### 1.4 Sprint Pass — XP Curve & Rewards (20 уровней, итого 915 XP)
| Уровень | Требуется XP | Free награда | Premium награда |
|---------|-------------|--------------|-----------------|
| 1 | 20 | +10 эн | +20 эн |
| 2 | 20 | +15 прог | +30 прог |
| 3 | 25 | +10 эн | +20 эн |
| 4 | 25 | +15 прог | +30 прог, −10 стресс |
| 5 | 30 | +15 эн, +20 прог | +30 эн, +40 прог |
| 6 | 30 | +10 эн | +20 эн |
| 7 | 35 | +20 прог | +40 прог |
| 8 | 35 | +10 эн | +20 эн, −10 стресс |
| 9 | 40 | +20 прог | +30 эн |
| 10 | 45 | +20 эн, +30 прог | +40 эн, +50 прог |
| 11 | 45 | +10 эн | +20 эн |
| 12 | 50 | +20 прог | +45 прог |
| 13 | 50 | +15 эн | +25 эн, −10 стресс |
| 14 | 55 | +25 прог | +45 прог |
| 15 | 60 | +20 эн, +35 прог | +50 эн, +60 прог |
| 16 | 60 | +15 эн | +30 эн |
| 17 | 65 | +25 прог | +50 прог |
| 18 | 70 | +20 эн | +40 эн, −15 стресс |
| 19 | 75 | +30 прог | +60 прог |
| 20 | 80 | +30 эн, +50 прог | +80 эн, +100 прог, −25 стресс |

*Источник:* `backend/src/config/balance.js` SPRINT_PASS_LEVELS (строки 64–85)

### 1.5 Daily Quests
| Тип | Цель | Награда |
|-----|------|---------|
| tap_count | 40 тапов | +15 energy |
| commit_count | 80 коммитов | +10 energy, +30 commitsCurrent |
| login | 1 вход | +10 energy |
| **full clear bonus** | — | **+25 energy** |

*Источник:* `backend/src/config/balance.js` DAILY_QUEST_DEFS + DAILY_QUEST_ALL_CLAIMED_BONUS

### 1.6 Daily Battle Rewards
| Место | Награда |
|-------|---------|
| Топ-1 | +50 energy |
| Топ-2 | +30 energy |
| Топ-3 | +15 energy |

*Источник:* `backend/src/routes/battle.js` строки 93–97

### 1.7 Referral Milestones
| Рефералов (active) | Награда |
|--------------------|---------|
| 1 | +30 energy |
| 3 | +60 energy |
| 5 | +100 energy |

*Источник:* `backend/src/routes/referral.js` строка 7

### 1.8 Rank Meta ( progression vNext )
| Ранг | Название | Commits/tap | Max Energy |
|------|----------|-------------|------------|
| 1 | Junior | 1 | 100 |
| 2 | Middle | 2 | 120 |
| 3 | Senior | 3 | 150 |
| 4 | Lead | 5 | 180 |
| 5 | CTO | 8 | 220 |

*Источник:* `backend/src/utils/vnext.js` RANK_META (строки 15–21)

### 1.9 Tap Formula
```
commitsDelta = round(
  commitsPerTap * (energy/100) * (1 - depression/100 * 0.5) * (1 + min(streak*0.05, 0.5))
)
min commitsDelta = 1
energyDelta = -1
depressionDelta = 0 (energy≥20), 1 (energy<20), 2 (energy<10)
```
*Источник:* `backend/src/routes/tap.js` calculateTapDelta (строки 203–254)

### 1.10 Energy Recovery
- +1 энергии каждые `ENERGY_RECOVERY_INTERVAL_SECONDS` (env, default 60 сек)
- −1 стресса на каждые 5 восстановленных единиц энергии
*Источник:* `backend/src/utils/progression.js` (строки 1–30)

### 1.11 XP per Tap
```
mult = 1 + 0.1 * (levelInRank - 1)
XP = round(1 * mult)
```
*Источник:* `backend/src/utils/vnext.js` computeTapXp (строки 94–97)

### 1.12 Rate Limits
| Параметр | .env.example | Код default |
|----------|--------------|-------------|
| Burst (taps/sec) | 15 | 20 |
| Soft ban | 25 | 40 |
| Daily IP cap | 10 000 | 10 000 |

*Источник:* `backend/.env.example` + `backend/src/middleware/rateLimit.js`

---

## 2. Drift / Inconsistencies (docs ↔ code ↔ DB)

### 🔴 Critical
| # | Проблема | Где | Детали |
|---|----------|-----|--------|
| 2.1 | **Два несовпадающих каталога товаров** | `backend/src/utils/shopCatalog.js` vs `payments/prices.json` | Backend API продаёт 4 товара (energy_refill, depression_cure, tier_boost, premium_pass). Bot webhook использует `prices.json` с ID coffee, energy_pack, antidepressant, premium_skin, starter_pack. Цены и эффекты разные. |
| 2.2 | **MOCK_MODE всегда true** | `payments/bot-webhook.js:17` | `const MOCK_MODE = process.env.MOCK_MODE === 'true' || true;` — конструкция `|| true` делает mock режим неотключаемым. Production платежи никогда не пройдут реально. |
| 2.3 | **grantItemToUser — заглушка** | `payments/bot-webhook.js:177-190` | Функция выдачи товара после оплаты не пишет в БД, только `console.log`. Пользователь платит, но предмет не получает. |
| 2.4 | **Миграция 004 seed ≠ balance.js** | `backend/migrations/004_stage4_retention.sql` | Seed вставляет event target=500, reward=+50 эн. `006_balance_tuning.sql` исправляет на 650 / +80эн,+60прог,−15стресс. Новая БД без 006 будет с неверной экономикой. |
| 2.5 | **Миграция 004 seed pass ≠ balance.js** | `backend/migrations/004_stage4_retention.sql` | Seed вставляет flat 30 XP на все 20 уровней и другие награды. `006_balance_tuning.sql` перезаписывает. Без 006 — неверная кривая. |

### 🟡 Medium
| # | Проблема | Где | Детали |
|---|----------|-----|--------|
| 2.6 | **Реферальный порог: тапы ≠ коммиты** | `frontend/src/components/ReferralPanel.jsx:341` | UI говорит "20 тапов", но backend (`referral.js:51`) считает `commits_total >= 20`. Расхождение текста с логикой. |
| 2.7 | **Rate limit defaults > intended** | `backend/src/middleware/rateLimit.js:13-15` | Если env vars не заданы, код использует 20/40 вместо задуманных 15/25 (из .env.example). Слабее защита. |
| 2.8 | **HANDOFF.md — устаревший cooldown** | `HANDOFF.md:177` | Утверждает "dismissed offers stay hidden for 4h (per type) / 2m (global)". Реальность: global 90s, per-type 90m/2h/3h. |
| 2.9 | **`TIER_THRESHOLDS` — мёртвый env** | `backend/.env.example:28` | `TIER_THRESHOLDS=100,500,2000,10000` ни разу не читается в коде. Реальные пороги захардкожены в `vnext.js`. |
| 2.10 | **`streak_protect` — no-op** | `backend/src/routes/buy.js:139-141` | Допустимый `item_type`, но эффект пустой. Пользователь может купить пустышку. |
| 2.11 | **energy_refill без `updated_at`** | `backend/src/routes/buy.js:107-110` | `UPDATE progression SET energy = $2` без `updated_at = NOW()`. Остальные прогрессион-апдейты ставят updated_at. Может сломать расчёт recovery. |
| 2.12 | **Реферальная награда — race condition** | `backend/src/routes/referral.js:338-348` | Считает newEnergy в JS, потом делает `SET energy = $1`. При конкурентном тапе — потеря энергии. Должно быть `LEAST(maxEnergy, energy + reward)`. |
| 2.13 | **Два `getTierName`** | `backend/src/routes/state.js:227-236` и `backend/src/routes/leaderboard.js:160-169` | Идентичные функции, дублирование. |

---

## 3. UI Hardcoded Numbers (отдельно от backend)

| # | Файл | Строки | Что захардкожено | Backend source |
|---|------|--------|------------------|----------------|
| 3.1 | `frontend/src/components/ShopPanel.jsx` | 84–86 | `energyPercent <= 25`, `>= 0.72`, `depression >= 55` | `balance.js` CONTEXT_OFFER_RULES |
| 3.2 | `frontend/src/components/ShopPanel.jsx` | 156 | Premium Pass "⭐ 200" | `shopCatalog.js` premium_pass.stars=200 |
| 3.3 | `frontend/src/components/DailyQuestsPanel.jsx` | 112 | "+25 эн" (all-claimed bonus) | `balance.js` DAILY_QUEST_ALL_CLAIMED_BONUS=25 |
| 3.4 | `frontend/src/components/ReferralPanel.jsx` | 6 | `MILESTONE_REWARD_LABELS = {1: '+30 энергии', 3: '+60 энергии', 5: '+100 энергии'}` | `referral.js` MILESTONE_REWARDS |
| 3.5 | `frontend/src/components/ReferralPanel.jsx` | 341 | "20 тапов" | `referral.js` commits_total >= 20 |
| 3.6 | `frontend/src/components/SprintPassPanel.jsx` | 156 | Premium Track "⭐ 200" | `shopCatalog.js` premium_pass.stars=200 |
| 3.7 | `frontend/src/components/StatsBar.jsx` | 21 | `TIER_THRESHOLDS = [100, 500, 2000, 10000]` | Мёртвый fallback, не синхронизирован с vnext.js |
| 3.8 | `frontend/src/components/StatsBar.jsx` | 40–43 | Energy color thresholds: 50%, 20%; Stress: 30, 70 | Нет backend source, чисто UI |
| 3.9 | `frontend/src/components/TapArea.jsx` | 61–75 | Текстовые пороги фидбека: ≥5 commits, >1 commit | Нет backend source |
| 3.10 | `frontend/src/utils/mockApi.js` | 42–45 | Shop items с ценами 50/100/200/500 | Полностью устаревший мок |

---

## 4. Release / Ops Risks

| # | Риск | Файл | Детали |
|---|------|------|--------|
| 4.1 | **Платежи в mock-режиме навсегда** | `payments/bot-webhook.js:17` | `|| true` блокирует реальные Telegram Stars. Нужен патч. |
| 4.2 | **Выдача товара не реализована** | `payments/bot-webhook.js:177-190` | После оплаты товар не пишется в БД. Разрыв между payment и fulfillment. |
| 4.3 | **Два прайс-каталога = расхождение цен** | `shopCatalog.js` + `prices.json` | Пользователь может увидеть одну цену в UI, а bot валидирует другую. |
| 4.4 | **Hardcoded VM IP / registry / URLs** | `scripts/*.ps1`, `nginx/`, `payments/bot-webhook.js`, `frontend/src/utils/purchases.js` | 111.88.247.195, cr.yandex/crpduv7gci2puq300f38, coder-survival-bot.vercel.app — всё захардкожено. |
| 4.5 | **Migration 006 обязательна, но не защищена** | `backend/migrations/` | Новая БД или restore без 006 даст неверную экономику (event 500, flat XP 30). |
| 4.6 | **`ENERGY_RECOVERY_INTERVAL_SECONDS` не в .env.example** | `backend/src/utils/progression.js` | Переменная читается из env, но отсутствует в `.env.example`. Оператор может не знать о ней. |
| 4.7 | **VM outbound блокирован** | `project-status.json` | VM не достигает api.telegram.org. Вся bot-логика завязана на Vercel webhook. Если Vercel упадёт — бот молчит. |
| 4.8 | **No CI smoke on PR** | `scripts/smoke-*.ps1` | Smoke тесты ручные. Релиз может пройти с broken API. |
| 4.9 | **Release payload включает весь repo** | `scripts/release-prod.ps1` | Архивирует всё кроме node_modules/dist/.git. Может утекнуть что-то чувствительное. |
| 4.10 | **BOT_BACKEND_SECRET — единственная защита internal payments** | `backend/src/routes/internalPayments.js:7` | Нет IP whitelist, только shared secret. Если secret утекает — любой может подтвердить платёж. |
| 4.11 | **Mock API — dead code с ложными данными** | `frontend/src/utils/mockApi.js` | Не импортируется нигде (grep показал только self-reference), но содержит совершенно другие цены и логику. Риск случайного использования в dev. |
| 4.12 | **ensurePlayerLevel пишет на чтение** | `backend/src/utils/vnext.js:73-79` | `ON CONFLICT DO UPDATE SET updated_at = NOW()` — каждый вызов state/tap обновляет player_levels. Избыточная write-нагрузка. |
| 4.13 | **Shop API без авторизации** | `backend/src/index.js:83` | `app.use('/api/shop', shopRouter);` — нет initDataMiddleware. Каталог публичен (некритично, но не консистентно). |

---

## 5. Recommended Routine Follow-ups for Codex

**Критичные (до следующего релиза):**
1. **Исправить `MOCK_MODE`** в `payments/bot-webhook.js` — убрать `|| true`.
2. **Реализовать `grantItemToUser`** — подключить к `applyItemEffect` из `buy.js` или к `applyReward`.
3. **Синхронизировать прайс-каталоги** — либо удалить `payments/prices.json` и заставить bot читать backend API, либо синхронизировать ID/цены.
4. **Исправить race condition** в `referral.js` claim-milestone — использовать атомарный `UPDATE ... SET energy = LEAST(maxEnergy, energy + $2)`.
5. **Добавить `updated_at`** в `buy.js` energy_refill update.

**Рутинные (следующий спринт):**
6. Вынести UI thresholds (ShopPanel recommended, StatsBar colors) в shared config или читать с backend.
7. Убрать hardcoded "⭐ 200" и "+25 эн" из UI — брать с API или shared constants.
8. Обновить `ReferralPanel.jsx`: "20 тапов" → "20 коммитов" (или поменять backend на тапы).
9. Добавить `ENERGY_RECOVERY_INTERVAL_SECONDS` в `.env.example`.
10. Удалить мёртвый `TIER_THRESHOLDS` из `.env.example`.
11. Удалить/архивировать `frontend/src/utils/mockApi.js`.
12. Обновить `HANDOFF.md` cooldown-описание: 4h → 90m/2h/3h.
13. Проверить, что `006_balance_tuning.sql` включён в `migrate.js` или release script.

**Наблюдение (метрики):**
14. Следить за completion rate weekly hackathon при target=650.
15. Следить за sprint pass completion pacing против 915 XP total.
16. Следить за daily quest full-clear rate после tuning (40/80/login).
17. Следить за context offer CTR / dismiss rate.

---
*Конец аудита. Код не изменялся. Файл создан отдельно от production docs.*
