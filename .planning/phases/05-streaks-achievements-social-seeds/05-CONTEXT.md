# Phase 5: Streaks, Achievements & Social Seeds — CONTEXT.md

> Status: Context Gathered
> Requirements: PROG-03, PROG-04, PROG-07, SOCL-06, SOCL-07
> Date: 2026-05-21

---

## Requirements

### PROG-03: Система стриков «Дни без выгорания»
- 7 дней — +10% к коммитам (tap/commit boost)
- 14 дней — фрагмент скина «Офис после полуночи» + титул
- 30 дней — скин «Ретро-магнитофон»
- Ежедневная награда за вход: энергия + XP + passXp

### PROG-04: Восстановление стрика
- Стоимость восстановления: 5 Stars
- Шутливое сообщение при прерывании стрика
- Один бесплатный save уже реализован (`freeUsed`)

### PROG-07: Ироничные ачивки (≥10 штук)
- Каждая ачивка имеет юмористическое описание
- Кнопка «Позориться» для шеринга в Telegram
- Награды: скины, фрагменты, титулы

### SOCL-06: Реферальная система с двусторонней выгодой
- Пригласивший: +50 / +200 / скин «Тимлид» (tiered milestones)
- Приглашённый: +100 коммитов + эспрессо (кофе)

### SOCL-07: Реферальная антиферма
- Награда разблокируется только после 2 дней в игре и 20 коммитов

---

## Current State

### Streaks — Partially Implemented
**Backend:**
- `backend/src/utils/streak.js` — `processDailyLogin` с логикой streak, free save, team save
- `backend/src/routes/streak.js` — GET `/api/streak`, POST `/api/streak/claim`
- JSONB `streak_state` в `progression` (currentStreak, maxStreak, lastLoginDate, protection)
- `backend/src/config/balance.js` — `STAGE2.STREAK` с DAILY_REWARD и MILESTONES (3, 7, 14, 21, 30)

**Frontend:**
- `frontend/src/components/StreakCalendar.jsx` — календарь на 7 дней, кнопка claim, индикатор защиты

**Gap:** Нет endpoint для восстановления streak за 5 Stars. Нет UI для этого. Milestones включают 3 и 21, которых нет в REQUIREMENTS.md.

### Achievements — Skeleton Exists
**Backend:**
- `backend/src/utils/achievements.js` — `checkAchievement()` с 4 trigger types: tap, commit_total, rank_up, night_session
- Таблицы `achievements` и `user_achievements` существуют в БД
- Авто-разблокировка скинов через `reward_payload->>'skinId'`

**Current achievements (4):**
1. `tap_master` — 1000 taps
2. `commit_king` — 10000 commits
3. `legacy_zone` — reach rank 3
4. `night_shift_30` — 30 night sessions

**Gap:** Только 4 ачивки (нужно ≥10). Нет фронтенд UI. Нет кнопки «Позориться». Нет интеграции с meme engine для шеринга ачивок.

### Referral — Mostly Implemented
**Backend:**
- `backend/src/utils/referral.js` — `trackReferral`, `getUnlockedReferralMilestones`, `checkReferralMilestones`
- `backend/src/routes/referral.js` — /stats, /link, /status, /track, /claim, /claim-milestone
- Таблица `referrals` с `status` (pending → rewarded?)
- `referral_codes` — генерация кода `ref_{telegram_id}`
- `referral_milestone_claims` — отслеживание claimed milestones

**Frontend:**
- `frontend/src/components/ReferralPanel.jsx` — UI со статистикой, milestones, кнопкой share/copy
- `frontend/src/components/ReferralChainPanel.jsx` — цепочка рефералов

**Current config:**
```js
REFERRAL_ACTIVE_THRESHOLD_COMMITS = 20
REFERRAL_MILESTONE_REWARDS = {
  1: { energy: 30 },
  3: { energy: 60 },
  5: { energy: 100 }
}
STAGE3.REFERRAL.MILESTONE_REWARDS = {
  1: { inviter: { energy: 30, xp: 50 }, invited: { energy: 50, inventory: { starter_pack: 1 } } },
  3: { inviter: { energy: 50, xp: 100, stars: 10 }, invited: { energy: 50, stars: 10 } },
  5: { ... }
}
```

**Gap:**
- Нет проверки на 2 дня в игре (только 20 коммитов)
- Milestone rewards не соответствуют REQUIREMENTS.md (+50/+200/Team Lead skin)
- Invited не получает +100 commits + espresso автоматически
- Нет `pass_xp_log` hook для referral bind (SOCL-06 даёт social XP)

---

## Locked Decisions

- **D-01**: Streak milestones — строго 7 / 14 / 30 (убираем 3 и 21 из конфига).
  - 7 дней: `commitBoostPercent: 10, durationHours: 24` + титул "Неделя без выгорания"
  - 14 дней: `skinFragment: 'midnight_office', title: 'Обитатель офиса'`
  - 30 дней: `skin: 'retro_boombox'`
- **D-02**: Streak recovery — 5 Stars, endpoint `POST /api/streak/recover`, шутливое сообщение при сбросе.
- **D-03**: Achievements — расширяем с 4 до 10+. Новые ачивки (см. список ниже). Каждая имеет `reward_payload` (skin/title/fragment).
- **D-04**: Achievement share — кнопка «Позориться» генерирует мем-картинку через существующий backend renderer (`/api/meme`) с шаблоном achievement. Шеринг через Telegram native share.
- **D-05**: Referral milestones — обновляем до tiered: 1 friend (+50 commits + energy), 3 friends (+200 commits + energy + stars), 5 friends (skin "Team Lead").
- **D-06**: Invited reward — +100 commits + 1 espresso (coffee_cups: 1), выдаётся автоматически при достижении антиферм порога.
- **D-07**: Anti-farm — 2 дня в игре + 20 коммитов. Добавляем `first_active_at` в `progression` (или используем `created_at` из `users`).
- **D-08**: XP attribution — referral bind логируется в `pass_xp_log` как `social` (уже частично в `state.js`, но нужно убедиться).
- **D-09**: Frontend — новый компонент `AchievementsPanel.jsx` (modal), кнопка в StatsBar. `StreakCalendar` остаётся как есть с добавлением кнопки восстановления.

---

## Achievement List (10 + 2 bonus)

| ID | Name | Target | Trigger | Reward | Description |
|----|------|--------|---------|--------|-------------|
| `tap_master` | Клавиатурный маньяк | 1000 taps | `tap` | — | *Ты кликнул 1000 раз. Твоя мышь подаёт на тебя в суд.* |
| `commit_king` | Гит-император | 10000 commits | `commit_total` | — | *Твой git log длиннее «Войны и мира».* |
| `legacy_zone` | Археолог легаси | Rank 3 | `rank_up` | skinFragment: `legacy_hat` | *Ты видел код, который писали до StackOverflow.* |
| `night_shift_30` | Ночной страж | 30 night sessions | `night_session` | title: `Вампир` | *Соседи уверены, что ты вампир. Они почти правы.* |
| `burnout_first` | Полное выгорание | 100% depression once | `burnout` | title: `Пепел` | *Поздравляем! Ты официально сгорел. Вот твоя ачивка, она тоже горит.* |
| `coffee_addict` | Эспрессо-зависимый | 50 coffees | `use_item` | — | *Твоя кровь на 90% кофеин. Врачи в шоке.* |
| `meme_lord` | Мемный олигарх | 10 meme shares | `meme_share` | — | *Ты позорился 10 раз. Гордись этим.* |
| `bug_hunter` | Охотник за багами | 100 crit taps | `tap` (crit) | — | *Ты нашёл 100 багов. Их было 5, но ты сделал 100 коммитов.* |
| `referral_god` | HR-отдел в одном лице | 5 friends invited | `referral` | title: `Рекрутёр` | *Ты привёл 5 человек в этот ад. HR-ы завидуют.* |
| `prod_survivor` | Выживший на проде | 10 "prod down" events | `random_event` | — | *Прод упал 10 раз. Ты всё ещё здесь. Зачем?* |
| `full_clear_week` | Неделя без выходных | 7 days Full Clear | `quest_claim` | — | *Ты выполнял квесты 7 дней подряд. У тебя есть жизнь?* |
| `streak_saver` | Страховой агент | Restore streak for Stars | `streak_recover` | — | *Ты заплатил, чтобы не работать. Капитализм одобряет.* |

**Note:** Первые 4 уже существуют. Новые: `burnout_first`, `coffee_addict`, `meme_lord`, `bug_hunter`, `referral_god`, `prod_survivor`. `full_clear_week` и `streak_saver` — бонус для Phase 6+.

---

## Scope Fences

- **IN**: Streak recovery за Stars, achievement expansion (4→10), achievement share UI, referral milestone rebalancing, anti-farm 2-day check.
- **OUT**: New mini-games (Phase 6), new social features beyond referral (Phase 7), season rotation, premium pass pricing.
- **NO**: Dropping existing `streak_state` JSONB (keep and enhance).
- **NO**: Rewriting referral DB schema (keep `referrals`, `referral_codes`, `referral_milestone_claims`).
- **NO**: Creating new meme templates beyond achievement overlay (reuse existing renderer).

---

## Known Risks

1. **Achievement trigger coverage**: Не все trigger types реализованы (`burnout`, `use_item`, `meme_share`, `random_event`). Нужно добавить хуки в соответствующие роуты.
2. **Referral migration**: Изменение `REFERRAL.MILESTONE_REWARDS` сломает существующие claimed milestones? Нет, т.к. rewards выдаются сразу, а не хранятся как ссылки.
3. **Anti-farm 2-day gap**: Нужно добавить `first_active_at` или использовать `users.created_at`. Если `created_at` не反映 actual first play, нужно новое поле.
4. **Achievement share dependency**: Требует рабочего `/api/meme` renderer (Phase 3). Убедиться, что achievement template добавляется без поломки существующих.
5. **Streak recovery economy**: 5 Stars — это разовая покупка или repeatable? Решение: repeatable, но цена растёт (+5 Stars каждый раз: 5, 10, 15...).

---

## Reusable Assets

| Asset | Location | How to reuse |
|-------|----------|-------------|
| Streak engine | `backend/src/utils/streak.js` | Add `starRecover()` function |
| Streak UI | `frontend/src/components/StreakCalendar.jsx` | Add recovery button |
| Achievement engine | `backend/src/utils/achievements.js` | Extend `checkAchievement()` with new triggers |
| Referral engine | `backend/src/utils/referral.js` | Update `checkReferralMilestones()` with 2-day check |
| Referral UI | `frontend/src/components/ReferralPanel.jsx` | Update milestone display |
| Meme renderer | `backend/src/utils/memeRenderer.js` | Add achievement overlay template |
| Pass XP log | `backend/src/utils/passXpLog.js` | Ensure referral bind logs `social` XP |
| Modal pattern | `frontend/src/components/DailyQuests.jsx` | Copy modal pattern for `AchievementsPanel.jsx` |
| StatsBar hook | `frontend/src/components/StatsBar.jsx` | Add achievement button |

---

## Files to Create

| File | Description |
|------|-------------|
| `backend/migrations/026_achievement_expansion.sql` | Insert new achievements into `achievements` table |
| `backend/migrations/027_streak_recovery.sql` | Add `first_active_at` to `progression` (for anti-farm) |
| `backend/tests/phase5.unit.test.js` | Tests for streak recovery, achievement triggers, referral anti-farm |
| `frontend/src/components/AchievementsPanel.jsx` | Achievement list modal with "Позориться" button |
| `frontend/src/components/AchievementToast.jsx` | Toast notification on new achievement unlock |

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/config/balance.js` | Update STREAK milestones (7/14/30), REFERRAL rewards (tiered), add achievement IDs |
| `backend/src/utils/streak.js` | Add `starRecover()` function |
| `backend/src/routes/streak.js` | Add `POST /api/streak/recover` endpoint |
| `backend/src/utils/achievements.js` | Add new trigger types and achievement checks |
| `backend/src/routes/quests.js` | Hook `full_clear_week` achievement on 7-day full clear |
| `backend/src/routes/tap.js` | Hook `bug_hunter` (crit), `coffee_addict` (item use) |
| `backend/src/routes/meme.js` | Hook `meme_lord` achievement on share |
| `backend/src/routes/state.js` | Hook `burnout_first` on depression=100; ensure referral bind logs social XP |
| `backend/src/utils/referral.js` | Add 2-day check to `checkReferralMilestones()` |
| `backend/src/routes/referral.js` | Update invited auto-reward (+100 commits + espresso) |
| `frontend/src/components/StreakCalendar.jsx` | Add "Восстановить за 5 Stars" button |
| `frontend/src/components/StatsBar.jsx` | Add achievement button |
| `frontend/src/hooks/useGameState.js` | Add `achievements`, `claimAchievement`, `recoverStreak` state helpers |
