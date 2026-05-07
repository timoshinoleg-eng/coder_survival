# Support Gameplay FAQ — Coder Survival

> **Audience:** operators / support.  
> **Player-facing rules:** [`GAME_RULES.md`](../GAME_RULES.md)  
> **Deep-dive energy countdown:** [`ENERGY_COUNTDOWN_FAQ.md`](ENERGY_COUNTDOWN_FAQ.md)  
> **Last updated:** 2026-05-07

---

## How to use this doc

- **Expected behavior** — не баг, не эскалировать.
- **Possible bug** — собрать данные и эскалировать в backend scope.
- **Source-of-truth код** указан для каждой темы.

---

## Энергия

### Q1: «Энергия не восстанавливается каждую минуту»

**Ответ:**  
Восстановление идёт только во время **простоя** (idle). Интервал = `recoveryIntervalSeconds` (default 60 с) с момента последнего изменения прогрессии. Любой тап сбрасывает таймер.

**Что проверить в данных:**
- `progression.updated_at` — когда последний раз обновлялась прогрессия.
- `sessions` — частота тапов игрока.
- `recoveryIntervalSeconds` в ответе `/api/state`.

**Expected / Bug:**
- **Expected:** игрок тапает чаще чем раз в 60 с.
- **Bug:** `updated_at` не обновляется при тапе (проверить триггер `trg_progression_updated` в БД).

---

### Q2: «Countdown сбрасывается после каждого тапа»

**Ответ:**  
Ожидаемо. Любой UPDATE таблицы `progression` (тап, награда, recovery) через триггер `trg_progression_updated` ставит `updated_at = NOW()`. Таймер отсчитывает время **с этого момента**.

**Что проверить:**  
См. Q1. Если `updated_at` корректно двигается — это не баг.

---

### Q3: «Таймер дошёл до 00:00, но энергия не выросла»

**Ответ:**  
Countdown в HUD — клиентская оценка. Фактическое восстановление применяется сервером **только** при запросах `/api/state` (открытие/перезагрузка) или `/api/tap`. Если игрок смотрел на экран и не тапал, цифра не подпрыгнет сама.

**Что проверить:**
- Сделал ли игрок тап или свернул/развернул приложение после 00:00.
- Есть ли clock skew: сравнить `serverNow` из ответа с локальным временем клиента.
- `progression.energy` и `updated_at` до/после.

**Expected / Bug:**
- **Expected:** не было sync-события после достижения 00:00.
- **Bug:** `recoverProgression` не применяет восстановление при `/api/state` (маловероятно, см. `backend/src/utils/progression.js`).

---

### Q4: «Восстановилось сразу +2 или +3 энергии»

**Ответ:**  
Сервер считает `recoveredEnergy = floor(elapsedSeconds / interval)`. При 3-минутном простое — сразу +3. Countdown показывал время до **следующего** тика, а не лимит.

**Expected.**  
Подробнее: [`ENERGY_COUNTDOWN_FAQ.md`](ENERGY_COUNTDOWN_FAQ.md) Q5.

---

## Стресс (Депрессия)

### Q5: «Стресс не падает сам»

**Ответ:**  
Корректно. Стресс **не убывает со временем**. Он снижается только при восстановлении энергии: **−1 стресса за каждые 5 восстановленных единиц энергии** (т.е. за каждые 5 минут простоя при дефолтном интервале).

**Что проверить:**
- `progression.depression_level` динамика.
- Когда последний тап (`sessions.started_at`). Если игрок непрерывно тапает — стресс не уйдёт.

**Expected / Bug:**
- **Expected:** активный игрок без простоя = стресс не падает.
- **Bug:** при долгом простое (>5 мин) стресс не снизился ни на 1 (проверить `recoverProgression` в БД).

---

### Q6: «Что делает стресс?»

**Ответ:**  
Снижает доход коммитов. Формула:
```
commitsDelta = baseCommits * (1 - (stress/100) * 0.5)
```
- 50 стресса = −25% коммитов.
- 100 стресса = −50% коммитов (минимум 1 коммит за тап остаётся).

**Expected.**  
Source: `backend/src/config/balance.js` (`TAP_MECHANICS.depressionPenaltyMultiplier = 0.5`).

---

### Q7: «Что на 100% стрессе?»

**Ответ:**  
Максимальный штраф −50% к коммитам. Стресс упирается в кап 100. **Тапы не блокируются**, game over нет.

**Expected.**

---

## Тапы и Коммиты

### Q8: «Я тапнул, а коммитов мало»

**Ответ:**  
Коммиты за тап зависят от 4 факторов:
1. **Ранг** (base commits: Junior=1 … CTO=8).
2. **Энергия** (`energy/100` — множитель).
3. **Стресс** (штраф до −50%).
4. **Стрик** (бонус до +50%, `min(streakDays*0.05, 0.5)`).

Если энергия 20 и стресс 80 — коммитов будет минимальное количество.

**Что проверить:**
- `progression.energy`, `depression_level`, `streak_days`.
- `player_levels` resolved rank (`backend/src/utils/vnext.js`).

**Expected / Bug:**
- **Expected:** низкая энергия / высокий стресс / нулевой стрик.
- **Bug:** при energy=100, stress=0, streak>0 коммитов меньше базового rank-значения.

---

### Q9: «Почему иногда 1 коммит, а иногда 8?»

**Ответ:**  
База определяется рангом. Модификаторы меняют итог. При росте rank commitsPerTap растёт (1→2→3→5→8). Модификаторы могут как снизить до 1, так и поднять выше базы.

**Expected.**  
Source: `backend/src/utils/vnext.js` (`RANK_META`).

---

## XP / Ранг / Уровень

### Q10: «Как растёт прогресс?»

**Ответ:**  
XP даётся за каждый тап:
```
xpPerTap = round(1 * (1 + 0.1 * (levelInRank - 1)))
```
- Уровень 1 в ранге = 1 XP.
- Уровень 10 в ранге = 2 XP.
- Тот же XP идёт в Sprint Pass.

Ранг (Junior→CTO) определяется **только** суммарным XP (`xp_total`), а не отдельным полем.

**Expected.**  
Source: `backend/src/utils/vnext.js`.

---

### Q11: «Почему commits_current сбросился?»

**Ответ:**  
`commits_current` — визуальный прогресс-бар внутри ранга. Он сбрасывается в **0** при rank-up. Следующий тап после повышения ранга начнёт новый отсчёт.

**Что проверить:**
- `player_levels.xp_total` — перешёл ли порог для следующего ранга?
- `progression.commits_current` = 0 после `tier` change.

**Expected / Bug:**
- **Expected:** rank-up произошёл (проверить `level.rank` в ответе `/api/state`).
- **Bug:** `commits_current` сбросился **без** rank-up.

---

## Daily Quests

### Q12: «Когда засчитываются квесты?»

**Ответ:**  
Прогресс обновляется сервером:
- `tap_count` — при каждом тапе.
- `commit_count` — при каждом тапе (суммирует `commitsDelta`).
- `login` — автоматически при `/api/state` (state load).

**Важно:** выполнение (completed) ≠ получение награды (claimed).

**Expected.**  
Source: `backend/src/utils/vnext.js` (`updateDailyQuestProgress`, `markLoginQuestComplete`).

---

### Q13: «Почему full-clear бонус не выдался?»

**Ответ:**  
Бонус **+25 энергии** выдаётся только когда **все 3 квеста забраны** (`claimed = true`). Если игрок выполнил, но не нажал «Забрать» — бонуса нет.

**Что проверить:**
- `daily_quests.claimed` для всех 3 записей на текущую дату.
- `daily_quests.claimed_at` — когда забран.

**Expected / Bug:**
- **Expected:** квесты выполнены, но не claimed.
- **Bug:** все 3 claimed, но бонус не начислен (проверить `applyReward` в `backend/src/utils/rewards.js`).

---

### Q14: «Почему важен claim?»

**Ответ:**  
Награды не приходят автоматически. Игрок должен нажать «Забрать» в панели квестов. Стрик (`streak_days`) тоже считается только по **забранным** квестам.

**Expected.**

---

## Weekly Hackathon

### Q15: «Что это?»

**Ответ:**  
Активное 7-дневное событие. Личная цель: **650 коммитов** (`target_commits`). Награда: +80 энергии, +60 прогресса, −15 стресса.

**Expected.**  
Source: `backend/src/config/balance.js`, `backend/src/utils/events.js`.

---

### Q16: «Как считается вклад?»

**Ответ:**  
Каждый `commitsDelta` от тапа суммируется в `event_contributions.commits_contributed`. Это личный счётчик.

**Что проверить:**
- `event_contributions.commits_contributed` для `user_id` + `event_id`.
- `events.target_commits` (должно быть 650 для активного события).

**Expected.**

---

### Q17: «Почему награда не пришла автоматически?»

**Ответ:**  
Награду нужно забрать вручную через `POST /api/event/claim`. Сервер не выдаёт её по достижению цели сам.

**Что проверить:**
- `event_contributions.claimed` = TRUE/FALSE.
- `event_contributions.commits_contributed >= events.target_commits`.

**Expected / Bug:**
- **Expected:** не нажата кнопка «Забрать».
- **Bug:** target достигнут, `claimed = false`, но запрос `/api/event/claim` возвращает ошибку.

---

## Sprint Pass

### Q18: «Откуда идёт XP?»

**Ответ:**  
Из обычного тап-XP. `tap.js` передаёт `levelAfter.xpDelta` в `addPassXp`. Это тот же XP, который идёт в уровень игрока.

**Expected.**  
Source: `backend/src/routes/tap.js:121`, `backend/src/utils/pass.js`.

---

### Q19: «Почему награды надо забирать вручную?»

**Ответ:**  
By design. Для каждого уровня игрок должен вызвать `POST /api/pass/claim` с `level` и `track` (`free` или `premium`). Сервер проверяет `playerPass.current_level` и флаг `pass_claims`.

**Что проверить:**
- `pass_claims` — есть ли запись для `user_id + pass_id + level + track`.
- `player_passes.current_level` — достигнут ли уровень.

**Expected.**

---

### Q20: «Что даёт Premium Pass?»

**Ответ:**  
Открывает **premium track** наград в **текущем активном сезоне**. Free track доступен всегда. Premium track даёт удвоенные/улучшенные награды.

**v1 Limitation:** Premium Pass действует только на текущий сезон. При смене сезона нужна новая покупка.

**Expected.**  
Source: `backend/src/utils/pass.js`, `backend/src/utils/shopCatalog.js` (`premium_pass` = 200⭐).

---

## Shop / Stars Purchases

### Q21: «Как устроен flow покупки?»

**Ответ:**  
1. `POST /api/buy` → создаёт `pending`-покупку в `purchases`.
2. Бот создаёт инвойс Telegram Stars (сумма из `purchases.stars_amount`).
3. Игрок оплачивает в Telegram.
4. Telegram шлёт `successful_payment` webhook.
5. Сервер подтверждает (`/api/internal/payments/telegram/confirm`) и выдаёт предмет.

**Expected.**  
Source: `backend/src/routes/buy.js`, `bot/api/invoice-link.js`, `backend/src/routes/internalPayments.js`.

---

### Q22: «Когда покупка считается завершённой?»

**Ответ:**  
Только после server-side confirm. Признаки:
- `purchases.status = 'completed'`.
- Запись в `star_payments` с `telegram_payment_charge_id`.
- `audit_logs` с action `payment_confirm`.

**Что проверить:**
- `SELECT * FROM purchases WHERE user_id = X ORDER BY id DESC`.
- `SELECT * FROM star_payments WHERE purchase_id = Y`.

**Expected.**

---

### Q23: «Я оплатил, но предмета нет»

**Ответ:**  
Сначала проверить статус платежа. Telegram UI может показывать "оплачено", но webhook мог не дойти до сервера.

**Что проверить:**
1. `purchases.status` — `pending` или `completed`?
2. `star_payments` — есть ли запись с `telegram_payment_charge_id`?
3. `audit_logs` — искать `purchase_intent` и `payment_confirm`.
4. Если `status = pending` и `star_payments` нет — webhook не пришёл. Попросить игрока подождать 1–2 минуты или перезайти.
5. Если `star_payments` есть, но предмета нет — возможен баг на этапе `applyItemEffect`.

**Expected / Bug:**
- **Expected:** `pending` статус, webhook в пути.
- **Bug:** `completed` + `star_payments` есть, но `progression` / `player_passes` не обновились.

---

## Context Offers

### Q24: «Почему оффер появился?»

**Ответ:**  
Офферы проверяются при `/api/state` и `/api/tap`. Условия:
- `low_energy` ⚡: энергия ≤ 25% от `maxEnergy`.
- `near_rank` 🚀: прогресс в уровне ≥ 72%.
- `high_stress` 🧠: стресс ≥ 55.

**Expected.**  
Source: `backend/src/config/balance.js` (`CONTEXT_OFFER_RULES`).

---

### Q25: «Почему оффер пропал / не появляется снова?»

**Ответ:**  
Dismiss сохраняется на сервере и запускает кулдауны:
- Глобальный: **90 секунд** после любого dismiss.
- `low_energy`: **90 минут**.
- `near_rank`: **2 часа**.
- `high_stress`: **3 часа**.

**Что проверить:**
- `offer_cooldowns.last_dismissed_at` для `user_id` и `offer_type`.
- `offer_impressions` — когда оффер последний раз показывался.

**Expected / Bug:**
- **Expected:** кулдаун ещё не истёк.
- **Bug:** кулдаун истёк, условия выполнены, но оффера нет (проверить `getContextOffer` в `backend/src/utils/offers.js`).

---

## Team / Squad

### Q26: «Лимит участников?»

**Ответ:**  
Максимум **5** человек в команде.

**Expected.**  
Source: `backend/src/utils/teams.js`.

---

### Q27: «Как растёт total_commits команды?»

**Ответ:**  
Сумма тапов всех участников **плюс** награды, которые дают `commitsCurrent` (квесты, Sprint Pass, `tier_boost` из магазина).

**Что проверить:**
- `teams.total_commits`.
- `team_members` — кто в составе.
- Недавние `pass_claims`, `daily_quests` (claimed), `event_contributions` для non-tap источников.

**Expected.**  
Source: `backend/src/utils/rewards.js` (`updateTeamProgress` вызывается из `applyReward` и `tap.js`).

---

## Referral

### Q28: «Когда приглашённый считается активным?»

**Ответ:**  
Когда наберёт **20 коммитов** (`REFERRAL_ACTIVE_THRESHOLD_COMMITS`). До этого статус `pending`.

**Что проверить:**
- `referrals.status` для пары referrer-referred.
- `progression.commits_total` приглашённого.

**Expected.**  
Source: `backend/src/config/balance.js`.

---

### Q29: «Почему milestone не засчитался сразу?»

**Ответ:**  
Milestone проверяется ретроспективно, но **забрать** награду нужно вручную в панели рефералов. Кнопка «Забрать» появляется, когда порог активных рефералов достигнут.

**Что проверить:**
- `referrals.reward_claimed`.
- `referral_milestones` / `backend/src/config/balance.js` (пороги 1/3/5, награды 30/60/100 энергии).

**Expected / Bug:**
- **Expected:** порог достигнут, но игрок не нажал «Забрать».
- **Bug:** порог достигнут, кнопка не появляется или claim падает с ошибкой.

---

## Known Support Ambiguities

| Сценарий | Почему путает игрока | Как формулировать саппорту |
|----------|----------------------|----------------------------|
| **Countdown 00:00, но энергия не поднялась** | Игрок ожидает мгновенной мутации числа | «Таймер показывает, когда вы *сможете* получить +1. Чтобы увидеть прибавку, сделайте тап или перезайдите в приложение.» |
| **+2/+3 энергии за раз** | Countdown показывал только следующий +1 | «При долгом отсутствии энергия накапливается. Сервер выдаёт всё сразу при следующем входе.» |
| **Стресс не падает** | Нет passive decay; только через recovery | «Стресс снижается только когда восстанавливается энергия во время простоя. Если тапать без остановки — стресс не уйдёт.» |
| **Commits "прыгают"** | Зависимость от энергии/стресса/стрика | «Количество коммитов за тап зависит от текущей энергии, стресса и стрика. Оно меняется каждый тап.» |
| **Full-clear bonus missing** | Игрок выполнил, но не claimed | «Бонус выдаётся только после того, как вы заберёте все 3 квеста вручную.» |
| **Premium Pass "не работает"** | Открывает track, но не auto-claim | «Premium Pass открывает премиум-награды. Их всё равно нужно забирать вручную на каждом уровне.» |
| **Payment "успешен" в Telegram, но нет предмета** | Telegram UI ≠ server confirm | «Подождите 1–2 минуты. Если предмет не появился, проверим статус платежа на сервере.» |
| **Commits_current сбросился** | Выглядит как потеря прогресса | «Это визуальный прогресс внутри ранга. При повышении ранга он сбрасывается, а общий счётчик (`commits_total`) продолжает расти.» |
| **Offer не появляется снова** | Кулдауны не видны игроку | «Оффер скрыт после закрытия на определённое время (от 90 секунд до 3 часов). Это норма.» |
| **Referral "не активен"** | Приглашённый уже играет, но не дал 20 коммитов | «Друг считается активным только после 20 коммитов. До этого он не идёт в milestone.» |
