# SYNTHESIZED_BATTLE_PLAN.md — Синтезированный план доработок Coder Survival
> Фаза 3. Дата: 2026-05-13. RICE-скоринг. Evidence-based.  
> RICE = (Reach × Impact × Confidence) / Effort  
> Reach: 1–10 (охват аудитории). Impact: 1–10 (бизнес-эффект). Confidence: 0.5–1.0. Effort: person-days.

---

## СВОДНАЯ ТАБЛИЦА RICE

| ID | Название | Конфликт | Pillar | Priority | RICE | Регрессия |
|----|---------|----------|--------|----------|------|-----------|
| TASK-001 | Реализовать Stars fulfillment (`/buy` + webhook) | C-001 | MON | P0 | **30** | HIGH |
| TASK-002 | Активировать `featureFlags.stress_v2` (→ оффер 20 + passive decay) | C-002, C-003 | PROD | P0 | **180** | MED |
| TASK-003 | Снизить порог `low_energy` оффера 25% → 15% | C-004 | MON | P0 | **600** | LOW |
| TASK-004 | Пересчитать математику пасса (11 500 → ≤7 000 XP) + удалить dead code | C-008, C-016 | PROD | P0 | **58** | MED |
| TASK-005 | Добавить bundle «Coffee Break» 25⭐ в магазин | C-005 | MON | P0 | **39** | LOW |
| TASK-006 | Античит Слой 3: cron-сверка балансов каждые 5 мин | C-007 | SEC | P0 | **9** | MED |
| TASK-007 | Античит Слой 2: паттерн-анализ (энтропия Шеннона, CV, координаты) | C-006 | SEC | P0 | **6** | MED |
| TASK-008 | Stars-награды рефералов: 50⭐/200⭐/500⭐ + полный скин «Тимлид» | C-010, C-014 | SOC | P1 | **101** | LOW |
| TASK-009 | Deep-link рефералы: кнопка «Пригласить» + предзаполненное сообщение | C-018 | SOC | P1 | **67** | LOW |
| TASK-010 | Добавить 4 недостающих SKU в магазин | C-009 | MON | P1 | **44** | LOW |
| TASK-011 | First Purchase Bonus: первый `energy_refill` за 5⭐ вместо 10⭐ | D4-004 | MON | P1 | **40** | LOW |
| TASK-012 | Формула Daily Battle `Rdaily` (веса 40/30/20/10%) | C-011 | SOC | P1 | **12** | MED |
| TASK-013 | Hook Model: push-уведомления 09:00/13:00/15:00/18:00/20:00 | C-012 | PROD | P1 | **10** | LOW |
| TASK-014 | Near-rank оффер: эскалация 72% → 85% → 95% «последний шанс» | D4-010 | MON | P1 | **9** | LOW |
| TASK-015 | UGC-мемогенератор: 5 шаблонов с персонализацией | C-017/Doc1 | SOC | P2 | **8** | LOW |
| TASK-016 | Telegram Stories: шеринг Daily Battle 9:16 + опрос-стикер | C-019 | SOC | P2 | **6** | LOW |
| TASK-017 | Сессионные RNG-события раз в 30-90 сек (5 событий из Документа 2) | C-017 | PROD | P2 | **5** | MED |
| TASK-018 | Аудио: `visibilitychange` handler + Ogg Vorbis верификация | D4-012/D4-013 | PERF | P2 | **4** | LOW |
| TASK-019 | Гильдии с territorial control (ELO matchmaking) | C-/Doc4 S5 | SOC | P3 | **3** | HIGH |
| TASK-020 | Tier-1 локализация (EN/HI) | Doc3/Рынок | PERF | P3 | **2** | LOW |
| TASK-021 | Season Pass level-gate (разблокировать на уровне 9) | C-020 | PROD | P3 | **1** | MED |

---

## P0-BLOCKERS — ЗАКРЫТЬ ПЕРВЫМИ (максимум 5 параллельно)

---

### TASK-001: Реализовать Stars fulfillment (`/buy` + Telegram payment webhook)

- **Конфликт-ID:** C-001
- **Pillar:** MON
- **Priority:** P0
- **RICE Score:** (10 × 10 × 0.9) / 3 = **30**
- **Blast Radius:**
  - `backend/src/routes/shop.js` (основное изменение)
  - `backend/src/utils/shopCatalog.js` (читает эффекты)
  - `backend/src/config/balance.js` → `SHOP_ITEM_EFFECTS`
  - `backend/src/utils/rewards.js` (вызов `applyReward`)
  - `backend/src/index.js` (регистрация webhook роута)
- **Regression Risk:** HIGH — любая ошибка в payment flow = потеря Stars пользователя без зачисления товара
- **Rollback:** `git revert HEAD` → `git push` → перезапуск сервера (2 мин)

**DoD:**
1. [ ] `POST /api/shop/buy` принимает `{ productId, telegramInitData }`, проверяет Telegram initData подпись
2. [ ] Telegram `pre_checkout_query` обрабатывается через `answerPreCheckoutQuery(ok: true)` в bot-webhook
3. [ ] `successful_payment` event вызывает `applyReward(userId, productId)` и записывает транзакцию в `purchase_log`
4. [ ] Идемпотентность: повторный `successful_payment` с тем же `telegram_payment_charge_id` игнорируется
5. [ ] Тест sandbox: `energy_refill` покупается и зачисляется корректно
6. [ ] Нет 500-х ошибок при некорректном `productId`

**MVP Guard Check:** После коммита: `/start` → магазин открывается → `GET /api/shop/products` возвращает 4 товара → тест-покупка в sandbox засчитывается → энергия пополняется.

**Devil's Advocate:**
- *10× нагрузка:* Telegram отправляет `successful_payment` дважды при сетевой ошибке → без идемпотентности дублируется зачисление энергии. **Решение:** уникальный индекс на `telegram_payment_charge_id` в `purchase_log`.
- *Откат за 2 мин:* `git revert HEAD && git push && pm2 restart all` — `/buy` исчезает, пользователи не могут покупать, но уже купленное остаётся зачисленным.

---

### TASK-002: Активировать `featureFlags.stress_v2` (→ оффер high_stress 20 + passive decay)

- **Конфликт-ID:** C-002, C-003
- **Pillar:** PROD
- **Priority:** P0
- **RICE Score:** (10 × 9 × 1.0) / 0.5 = **180**
- **Blast Radius:**
  - `backend/src/routes/tap.js:192` (основное изменение — 1 строка)
  - `backend/src/utils/offers.js:94` (читает флаг — без изменений, уже корректно)
  - `backend/src/utils/progression.js` (проверить: читает ли `DEPRESSION_PASSIVE_DECAY_PER_HOUR`)
  - `backend/src/config/balance.js:136-143` (`STRESS_V2.AB_TEST_PERCENTAGE: 50`)
- **Regression Risk:** MED — изменение порога `high_stress` с 55 на 20 (для 50% users) увеличит частоту показа оффера. Риск: оффер-спам при депрессии 20-54. Митигация: `cooldownMs: 3h` уже настроен в `balance.js:24`.
- **Rollback:** Изменить 1 строку `tap.js:192` обратно: `featureFlags: {}` → `git push` → 30 сек.

**DoD:**
1. [ ] `tap.js:192` → `featureFlags: { stress_v2: (userId % 100) < STRESS_V2.AB_TEST_PERCENTAGE }`
2. [ ] Для 50% пользователей `high_stress` оффер срабатывает при депрессии ≥ 20
3. [ ] `progression.js` применяет `DEPRESSION_PASSIVE_DECAY_PER_HOUR × hoursElapsed` к `depression_level` (проверить `recoverProgression`)
4. [ ] A/B split корректен: пользователи с чётным `userId % 2 === 0` стабильно попадают в одну группу
5. [ ] Cooldown 3h предотвращает оффер-спам при постоянной депрессии 20+

**MVP Guard Check:** Tap → депрессия > 20 → для 50% пользователей появляется `high_stress` оффер. Tap → idle 1 час → `depression_level` снижается на ~5 ед.

**Devil's Advocate:**
- *10× нагрузка:* `userId % 100` — детерминированный расчёт без БД-запроса → zero overhead при 10× нагрузке.
- *Откат за 2 мин:* Изменить `tap.js:192` → `featureFlags: {}` → `git push && pm2 restart all`. Пользователи мгновенно переходят обратно на порог 55.

---

### TASK-003: Снизить порог `low_energy` оффера 25% → 15%

- **Конфликт-ID:** C-004
- **Pillar:** MON
- **Priority:** P0
- **RICE Score:** (10 × 6 × 1.0) / 0.1 = **600**
- **Blast Radius:**
  - `backend/src/config/balance.js:7` (1 строка: `energyPercentThreshold: 25` → `15`)
  - `backend/src/utils/offers.js:93` (читает порог без изменений)
- **Regression Risk:** LOW — изменение одной числовой константы. Функциональных зависимостей нет. Риск: оффер слишком поздний → ниже engagement. Митигация: 15% = последний шанс.
- **Rollback:** Вернуть `25` в `balance.js:7` → `git push` → 30 сек.

**DoD:**
1. [ ] `balance.js:7` → `energyPercentThreshold: 15`
2. [ ] `low_energy` оффер показывается при энергии ≤ 15% от `maxEnergy`
3. [ ] При `maxEnergy: 100` → оффер при energy ≤ 15 (было ≤ 25)
4. [ ] Cooldown 90 мин сохранён

**MVP Guard Check:** Tap до energy = 14 → появляется `low_energy` оффер. Tap до energy = 20 → оффер не появляется.

**Devil's Advocate:**
- *10× нагрузка:* Порог — статический расчёт в `offers.js:93`: `(energy / maxEnergy) * 100 <= 15`. Zero DB-запросов. Линейно масштабируется.
- *Откат за 2 мин:* Вернуть `energyPercentThreshold: 25` — 1 строка.

---

### TASK-004: Пересчитать математику пасса + удалить dead code `SPRINT_PASS_LEVELS`

- **Конфликт-ID:** C-008, C-016
- **Pillar:** PROD
- **Priority:** P0
- **RICE Score:** (8 × 8 × 0.9) / 1 = **58**
- **Blast Radius:**
  - `backend/src/config/balance.js:107-128` (`SPRINT_PASS_LEVELS` — удалить)
  - `backend/src/config/balance.js:196-251` (`STAGE2.PASS.LEVELS` — пересчитать XP)
  - `backend/src/config/balance.js:250-251` (`console.assert` — обновить)
  - Все файлы, импортирующие `SPRINT_PASS_LEVELS` (проверить grep)
  - `backend/src/routes/pass.js` (если читает `SPRINT_PASS_LEVELS`)
- **Regression Risk:** MED — изменение XP-требований пасса влияет на всех игроков с активным пассом. Уже заработанный прогресс может стать «слишком лёгким» при снижении порогов.
- **Rollback:** `git revert HEAD` — XP возвращается к 11 500. Прогресс игроков в БД не изменяется (XP хранится как accumulator).

**DoD:**
1. [ ] Grep `SPRINT_PASS_LEVELS` — найти все imports → убедиться что файл не читается нигде кроме `balance.js`
2. [ ] Удалить `SPRINT_PASS_LEVELS` из `balance.js:107-128`
3. [ ] Пересчитать `STAGE2.PASS.LEVELS`: суммарный XP ≤ 7 000 (target: 6 800 XP при запасе)
   - Новая формула: level i = 50 + (i-1) × 30 → сумма = 50×20 + 30×(0+1+...+19) = 1000 + 5700 = 6 700 XP ✓
4. [ ] Обновить `console.assert(totalStage2PassXp === 6700)` в `balance.js:250`
5. [ ] Математика проверена: 6 700 XP / 235 XP-день = 28.5 дней ≤ 30 ✓

**MVP Guard Check:** `/api/pass/status` возвращает корректный прогресс. Пасс уровень 1 требует 50 XP (было 100). `console.assert` не падает при старте сервера.

**Devil's Advocate:**
- *10× нагрузка:* XP-пороги — статические константы в памяти. Нет DB-запросов. Zero overhead.
- *Откат за 2 мин:* `git revert HEAD && pm2 restart all`. Пороги возвращаются к 11 500. Прогресс в БД (xp_total) не меняется — никто не «теряет» заработанный XP.

---

### TASK-005: Добавить bundle «Coffee Break» 25⭐ + bundle-логика в `shopCatalog.js`

- **Конфликт-ID:** C-005
- **Pillar:** MON
- **Priority:** P0
- **RICE Score:** (7 × 7 × 0.8) / 1 = **39**
- **Blast Radius:**
  - `backend/src/utils/shopCatalog.js` (новый товар + bundle schema)
  - `backend/src/config/balance.js:130-133` (`SHOP_ITEM_EFFECTS` — добавить `coffee_break`)
  - `backend/src/routes/shop.js` (если `/buy` — обработка bundle в `applyReward`)
  - `backend/src/utils/rewards.js` (добавить `bundleItems` loop)
- **Regression Risk:** LOW — добавление нового товара не затрагивает существующие.
- **Rollback:** Удалить `coffee_break` из `shopCatalog.js` и `SHOP_ITEM_EFFECTS`. `git push`.

**DoD:**
1. [ ] `shopCatalog.js` → новый товар `coffee_break: { id: 'coffee_break', name: 'Кофе-брейк', stars: 25, bundleItems: ['energy_refill_partial', 'depression_cure_partial'], icon: '☕', category: 'bundle' }`
2. [ ] `balance.js` → `SHOP_ITEM_EFFECTS.coffee_break: { energy: 50, depressionRelief: 30 }` (половинный эффект от полных товаров)
3. [ ] `rewards.js` → обработка `bundleItems` как atomic операция
4. [ ] `GET /api/shop/products` возвращает 5 товаров (было 4)
5. [ ] Цена 25⭐ закрывает ценовой разрыв: 10⭐ → **25⭐** → 40⭐ → 75⭐ → 200⭐

**MVP Guard Check:** `GET /api/shop/products` → 5 товаров. Sandbox покупка `coffee_break` → energy +50, depression -30.

**Devil's Advocate:**
- *10× нагрузка:* Bundle — просто два atomic эффекта. `applyReward` вызывается последовательно. Нет транзакционного риска при правильной реализации (один `BEGIN/COMMIT`).
- *Откат за 2 мин:* Удалить строку из `shopCatalog.js` → `git push`. Новый товар пропадает из UI. Уже купленные bundle — зачислены, не отзываются.

---

### TASK-006: Античит Слой 3 — cron-сверка балансов каждые 5 мин

- **Конфликт-ID:** C-007
- **Pillar:** SEC
- **Priority:** P0
- **RICE Score:** (5 × 8 × 0.7) / 3 = **9**
- **Blast Radius:**
  - `backend/src/jobs/balanceAudit.js` (новый файл)
  - `backend/src/index.js` (запуск `setInterval`)
  - `backend/src/config/balance.js` (пороги расхождения — добавить `AUDIT_THRESHOLDS`)
  - БД: `audit_violations` таблица (новая)
- **Regression Risk:** MED — background job не влияет на tap-flow, но `soft_ban` при ложном срабатывании заблокирует честного игрока.
- **Rollback:** Остановить `setInterval` в `index.js` (закомментировать 1 строку) → `pm2 restart all`.

**DoD:**
1. [ ] `jobs/balanceAudit.js` → каждые 5 мин выбирает пользователей с `last_tap_at > NOW() - INTERVAL '5 min'`
2. [ ] Сверяет `commits_current` vs ожидаемый диапазон (commits_per_tap × tap_count_window)
3. [ ] При расхождении >5% → запись в `audit_violations` + `console.warn`
4. [ ] Первые 7 дней: только warn + log, без soft_ban (калибровка порогов)
5. [ ] `AUDIT_THRESHOLDS` в `balance.js`: `COMMIT_DRIFT_PCT: 0.05, ENERGY_DRIFT_ABS: 10`

**MVP Guard Check:** Через 5 мин после старта сервера в логах появляется `[BalanceAudit] checked N users, 0 violations`. Нет false-positive для честного игрока.

**Devil's Advocate:**
- *10× нагрузка:* При 10 000 активных пользователей каждые 5 мин — тяжёлый SELECT. Решение: ограничить запрос `LIMIT 1000` + rolling window, не all-at-once.
- *Откат за 2 мин:* Закомментировать `startBalanceAudit()` в `index.js` → `pm2 restart all`. Job перестаёт выполняться. Данные в `audit_violations` сохраняются.

---

### TASK-007: Античит Слой 2 — паттерн-анализ (энтропия Шеннона, CV интервалов, координаты)

- **Конфликт-ID:** C-006
- **Pillar:** SEC
- **Priority:** P0
- **RICE Score:** (5 × 9 × 0.7) / 5 = **6**
- **Blast Radius:**
  - `backend/src/middleware/antiCheat.js` (новый файл)
  - `backend/src/routes/tap.js` (добавить вызов `checkTapPattern` после `checkTapRateLimit`)
  - `backend/src/config/balance.js` (пороги: `ANTICHEAT_LAYER2`)
  - БД/Redis: хранение последних N интервалов между тапами per-user
- **Regression Risk:** MED — false-positive может заблокировать честного игрока с ритмичными тапами (геймер). Митигация: только `warn` первые 14 дней.
- **Rollback:** Удалить `await checkTapPattern(...)` из `tap.js` → `git push`. Слой 2 отключается без последствий.

**DoD:**
1. [ ] Redis/in-memory store: последние 20 интервалов между тапами per-user (скользящее окно)
2. [ ] Расчёт энтропии Шеннона по распределению интервалов (bins по 50ms)
3. [ ] CV = std(intervals) / mean(intervals) — флаг при CV < 0.15
4. [ ] При энтропии < 2.5 бит → `warn` + запись в `anticheat_log`
5. [ ] Первые 14 дней: только logging, без блокировки (калибровка)
6. [ ] Пороги в `balance.js` → `ANTICHEAT_LAYER2: { MIN_ENTROPY_BITS: 2.5, MIN_CV: 0.15, WINDOW_SIZE: 20 }`

**MVP Guard Check:** Реальный пользователь (случайные тапы) → entropy ≥ 3.0, CV ≥ 0.3. Симуляция бота (равные интервалы) → entropy < 2.0, CV < 0.05 → warn в логах.

**Devil's Advocate:**
- *10× нагрузка:* Расчёт энтропии по 20 интервалам = O(20) операций — микросекунды. Redis `LPUSH/LTRIM` — < 1мс. Не блокирующий.
- *Откат за 2 мин:* Закомментировать `checkTapPattern` в `tap.js:X` → `pm2 restart all`. Слой 2 отключён.

---

## P1-МАСШТАБИРОВАНИЕ (монетизация + виральность)

---

### TASK-008: Stars-награды рефералов 50⭐/200⭐/500⭐ + полный скин «Тимлид»

- **Конфликт-ID:** C-010, C-014
- **Pillar:** SOC
- **Priority:** P1
- **RICE Score:** (6 × 7 × 0.8) / 0.5 + (4 × 7 × 0.9) / 0.5 = **67 + 50 = ~101** (объединены)
- **Blast Radius:**
  - `backend/src/config/balance.js:293-296` (`STAGE3.REFERRAL.MILESTONE_REWARDS`)
  - `backend/src/routes/referral.js` (claim-логика наград)
  - `backend/src/utils/rewards.js` (начисление Stars)
- **Regression Risk:** LOW — увеличение Stars-наград не ломает существующую механику
- **Rollback:** Вернуть старые значения Stars в `balance.js:293-296`

**DoD:**
1. [ ] `balance.js:293-296` → `milestone 1: stars: 50`, `milestone 3: stars: 200`, `milestone 5: stars: 500`
2. [ ] `balance.js:296` → `skin: 'team_lead'` вместо `skinFragment: 'recruiter'`
3. [ ] `rewards.js` поддерживает зачисление Stars через Telegram Stars API (Bot API `sendGift` или внутренний баланс)
4. [ ] `GET /api/referral/stats` возвращает обновлённые milestone rewards

---

### TASK-009: Deep-link рефералы с кнопкой «Пригласить» + предзаполненное сообщение

- **Конфликт-ID:** C-018 (Doc4, S1)
- **Pillar:** SOC
- **Priority:** P1
- **RICE Score:** (7 × 6 × 0.8) / 0.5 = **67**
- **Blast Radius:**
  - `backend/src/routes/referral.js:118` (URL format)
  - `frontend/src/components/ReferralPanel.jsx` (кнопка)
- **Regression Risk:** LOW
- **Rollback:** Вернуть `?startapp=ref_{id}` в `referral.js:118`

**DoD:**
1. [ ] `referral.js:118` → `https://t.me/${botUsername}?start=ref_${telegramId}` (параметр `start` для deep-link бота)
2. [ ] Добавить `shareUrl` в ответ: `tg://msg_url?url=...&text=Привяжись к коду! Мой инвайт: ...`
3. [ ] Frontend: кнопка «Пригласить» с `Telegram.WebApp.openTelegramLink(shareUrl)`
4. [ ] Bot обрабатывает `/start ref_123456` → вызов `POST /api/referral/activate`

---

### TASK-010: Добавить 4 недостающих SKU в магазин

- **Конфликт-ID:** C-009
- **Pillar:** MON
- **Priority:** P1
- **RICE Score:** (7 × 7 × 0.9) / 1 = **44**
- **Blast Radius:**
  - `backend/src/utils/shopCatalog.js` (+4 товара)
  - `backend/src/config/balance.js` → `SHOP_ITEM_EFFECTS` (+4 эффекта)
- **Regression Risk:** LOW
- **Rollback:** Удалить 4 новых SKU из `shopCatalog.js`

**DoD:**
1. [ ] `shopCatalog.js` + `SHOP_ITEM_EFFECTS` → «Двойной эспрессо» 15⭐ (×2 энергии, 20 сек через таймер)
2. [ ] «Таблетка от бессонницы» 30⭐ (мгновенное +100 energy)
3. [ ] «Резиновая уточка» 50⭐ (заморозка прироста депрессии на 60 сек через таймер)
4. [ ] «Пижама сеньора» 100⭐ (косметический скин, `skinId: 'senior_pajama'`)
5. [ ] Итоговый каталог: 9 SKU (4 старых + 1 bundle + 4 новых)

---

### TASK-011: First Purchase Bonus — первый `energy_refill` за 5⭐ вместо 10⭐

- **Конфликт-ID:** D4-004
- **Pillar:** MON
- **Priority:** P1
- **RICE Score:** (8 × 6 × 0.8) / 1 = **38**
- **Blast Radius:**
  - `backend/src/routes/shop.js` (проверка `first_purchase` флага)
  - `backend/src/utils/shopCatalog.js` (динамическая цена)
  - БД: `user_purchases` — проверка `COUNT(*) = 0`
- **Regression Risk:** LOW
- **Rollback:** Убрать `first_purchase` логику из `/buy`

**DoD:**
1. [ ] `/buy` проверяет: `SELECT COUNT(*) FROM purchase_log WHERE user_id = $1` = 0
2. [ ] Если первая покупка `energy_refill` → цена 5⭐ вместо 10⭐
3. [ ] Аналитическое событие `FIRST_PURCHASE_BONUS_APPLIED` логируется
4. [ ] Повторный вызов — стандартная цена 10⭐

---

### TASK-012: Формула Daily Battle `Rdaily` (веса 40/30/20/10%)

- **Конфликт-ID:** C-011
- **Pillar:** SOC
- **Priority:** P1
- **RICE Score:** (5 × 6 × 0.8) / 2 = **12**
- **Blast Radius:**
  - `backend/src/utils/battle.js` (новый файл)
  - `backend/src/routes/battle.js` (вызов `computeDailyScore`)
- **Regression Risk:** MED
- **Rollback:** `git revert` → удалить `battle.js`

**DoD:**
1. [ ] `utils/battle.js` → `computeDailyScore({ commits, depression, shares, referrals })`
2. [ ] Формула: `score = commits × 0.40 + (100 - depression) / 100 × 0.30 × 100 + shares × 0.20 × 10 + referrals × 0.10 × 10`
3. [ ] Нормализация на [0, 100]
4. [ ] Победитель = max `score` среди участников battle

---

### TASK-013: Hook Model — push-уведомления 09:00/13:00/15:00/18:00/20:00

- **Конфликт-ID:** C-012
- **Pillar:** PROD
- **Priority:** P1
- **RICE Score:** (8 × 5 × 0.5) / 2 = **10**
- **Blast Radius:**
  - `bot/scheduler.js` (новый файл)
  - `backend/src/config/balance.js` (тексты уведомлений)
- **Regression Risk:** LOW
- **Rollback:** Остановить scheduler

**DoD:**
1. [ ] `bot/scheduler.js` → node-cron задачи для 5 временных слотов
2. [ ] Per-user timezone из `progression.timezone_offset`
3. [ ] 5 контекстных текстов из Документа 3, Раздел 3.4.1 в `balance.js`
4. [ ] Unsubscribe-механика (Telegram Bot API `setChatMenuButton` или inline кнопка)

---

### TASK-014: Near-rank оффер с эскалацией 72% → 85% → 95%

- **Конфликт-ID:** D4-010
- **Pillar:** MON
- **Priority:** P1
- **RICE Score:** (5 × 5 × 0.7) / 2 = **9**
- **Blast Radius:**
  - `backend/src/config/balance.js:13-21` (`near_rank` конфиг)
  - `backend/src/utils/offers.js:103-107` (логика `near_rank`)
- **Regression Risk:** LOW
- **Rollback:** Вернуть один порог 72% в `balance.js`

**DoD:**
1. [ ] `balance.js` → три порога: 72% (стандарт), 85% (лучшее предложение), 95% (последний шанс)
2. [ ] `offers.js` → escalation logic: возвращает разный `title`/`body` в зависимости от прогресса
3. [ ] Cooldown увеличен до 6 часов (было 2 ч — Документ 4, D4-010)

---

## P2-ПОЛИРОВКА (социальные механики + контент)

---

### TASK-015: UGC-мемогенератор — 5 шаблонов с персонализацией

- **Конфликт-ID:** C-017/Doc1 Раздел 5.3
- **Pillar:** SOC
- **Priority:** P2
- **RICE Score:** (6 × 4 × 0.6) / 3 = **5**
- **Blast Radius:** `backend/src/utils/memeGenerator.js`, `bot/memeShare.js`
- **Regression Risk:** LOW

**DoD:**
1. [ ] 5 шаблонов (Документ 1, Раздел 5.3): «Мой код работает, но я не знаю почему», «404: sleep not found», «It works on my machine», «TODO: fix before prod», «Born to code, forced to meetings»
2. [ ] Переменные: `{{username}}`, `{{commits_today}}`, `{{depression_level}}`, `{{days_without_burnout}}`
3. [ ] node-canvas рендер + Telegram `sendPhoto`
4. [ ] Тригеры генерации из Документа 1 (депрессия >80%, провал мини-игры 3+ раз, и т.д.)

---

### TASK-016: Telegram Stories — шеринг Daily Battle 9:16 + опрос-стикер

- **Конфликт-ID:** C-019
- **Pillar:** SOC
- **Priority:** P2
- **RICE Score:** (5 × 4 × 0.5) / 2 = **5**
- **Blast Radius:** `backend/src/utils/storyGenerator.js`, `bot/storyShare.js`
- **Regression Risk:** LOW

**DoD:**
1. [ ] node-canvas рендер 1080×1920 с анимированным пьедесталом (gold/silver/bronze)
2. [ ] Telegram Bot API `sendStory` (если доступно) или `sendPhoto` с `?start=battle_share`
3. [ ] Интерактивный стикер-опрос: «У кого больше коммитов?» (2 варианта — аватар победителя vs открывшего)
4. [ ] Feedback loop: выбор «победителя» → depression -3, выбор «проигравшего» → depression +5

---

### TASK-017: Сессионные RNG-события раз в 30-90 сек

- **Конфликт-ID:** C-017
- **Pillar:** PROD
- **Priority:** P2
- **RICE Score:** (6 × 4 × 0.5) / 3 = **4**
- **Blast Radius:** `backend/src/utils/sessionEvents.js`, `backend/src/routes/tap.js`
- **Regression Risk:** MED

**DoD:**
1. [ ] `sessionEvents.js` → RNG по вероятностям (25%/10%/20%/15%/30%) из Документа 2, Таблица 3
2. [ ] Тригер: каждый N-й тап (N = random(30, 90)) → вероятностный выбор события
3. [ ] Ответ на тап включает опциональный `event: { type, title, choices }` для UI
4. [ ] «Прод база упала»: `-20 commits, +10 depression` (игнор) / `быстрый тап 10 кликов → +30 commits` (решить)

---

### TASK-018: Аудио — `visibilitychange` handler + верификация Ogg Vorbis файлов

- **Конфликт-ID:** D4-012, D4-013
- **Pillar:** PERF
- **Priority:** P2
- **RICE Score:** (5 × 3 × 0.7) / 2 = **5**
- **Blast Radius:** `frontend/src/audio/audioManager.js`, `frontend/src/App.jsx`
- **Regression Risk:** LOW

**DoD:**
1. [ ] `audioManager.js` → `document.addEventListener('visibilitychange', () => { if (hidden) audio.pause() else audio.resume() })`
2. [ ] `pagehide` event handler — сохранение позиции BGM
3. [ ] Проверка наличия файлов: `sfx_tap.ogg`, `sfx_silver.ogg`, `sfx_gold.ogg`, `sfx_burnout.ogg`, `sfx_empty.ogg`, `bgm_lofi.ogg`
4. [ ] Суммарный размер SFX + BGM ≤ 2 МБ (constraint: `balance.js:358`)

---

## P3-СТРАТЕГИЧЕСКИЙ ТЕХДОЛГ

---

### TASK-019: Гильдии с territorial control (ELO matchmaking)

- **Конфликт-ID:** Doc4, S5
- **Pillar:** SOC
- **Priority:** P3
- **RICE Score:** (7 × 8 × 0.5) / 20 = **1**
- **Оценка:** 1 месяц engineering. Новые таблицы: `guilds`, `guild_members`, `territories`. ELO-алгоритм. Anti-zerging.
- **Rollback:** feature flag `guilds_enabled: false`

---

### TASK-020: Tier-1 локализация (EN/HI)

- **Конфликт-ID:** Doc3, Рынок
- **Pillar:** PERF
- **Priority:** P3
- **RICE Score:** (4 × 4 × 0.5) / 4 = **2**
- **Оценка:** i18n framework + перевод всех строк + geo-routing по `language_code`

---

### TASK-021: Season Pass level-gate (разблокировать на уровне 9/Lead)

- **Конфликт-ID:** C-020
- **Pillar:** PROD
- **Priority:** P3
- **RICE Score:** (3 × 3 × 0.6) / 2 = **3** (ниже P2 из-за малого Reach)
- **Оценка:** Проверка `rank >= 4` в `/buy` endpoint. Требует согласования с монетизационной стратегией.

---

## СВОДКА ВЫПОЛНИМОСТИ P0 (MVP Guard)

| TASK | Effort (days) | Dependencies | Параллельность |
|------|--------------|-------------|----------------|
| TASK-001 | 3 | Telegram Stars API sandbox | — |
| TASK-002 | 0.5 | — | Параллельно с TASK-003 |
| TASK-003 | 0.1 | — | Параллельно с TASK-002 |
| TASK-004 | 1 | Grep SPRINT_PASS_LEVELS | После TASK-002 |
| TASK-005 | 1 | TASK-001 (bundle в `/buy`) | Параллельно с TASK-004 |
| TASK-006 | 3 | Redis/pg_cron | Параллельно с TASK-001 |
| TASK-007 | 5 | Redis (интервалы) | Параллельно, но после TASK-006 |

**Минимальное время закрытия всех P0 (при параллельной работе 2 инженеров):** ~5 рабочих дней.

---

*Дата: 2026-05-13. RICE-скоринг на основе evidence из `CONFLICT_MATRIX.md` и `SYNC_AUDIT.md`.*
