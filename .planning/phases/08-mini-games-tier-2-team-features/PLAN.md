# Phase 8: Mini-Games Tier 2 & Team Features — PLAN.md

> Context: [08-CONTEXT.md](./08-CONTEXT.md)
> Mode: MVP
> Estimated: 4 waves, ~18 tasks

---

## Wave 1: Dream Interview Mini-Game

**Goal:** Players level 6+ can play a 5-question IT quiz with 10s per question.

### Tasks

1. **Migration `030_team_skins.sql`** (partial — seeds only)
   - Insert `team_lead` and `team_champion` skins into `skin_definitions`:
     ```sql
     INSERT INTO skin_definitions (skin_id, name, description, unlock_type, rarity)
     VALUES
       ('team_lead', 'Тимлид', '+15% к продуктивности в Daily Battle', 'referral', 'epic'),
       ('team_champion', 'Чемпион хакатона', 'Эксклюзивный скин за золото в командном хакатоне', 'team_hackathon', 'legendary')
     ON CONFLICT (skin_id) DO NOTHING;
     ```

2. **Config update `backend/src/config/balance.js`**
   - Add to `STAGE2.MINIGAMES`:
     ```js
     dream_interview: {
       requiredLevel: 6,
       cooldownHours: 24,
       timeLimitSeconds: 60,
       maxScore: 5,
       minSuccessScore: 4,
       reward: { commits: 200, depressionRelief: 30, skinFragment: 'dream_interview_rare' }
     }
     ```
   - Add `TEAM_HACKATHON.FINAL_POST_DAY_UTC: 0` (Sunday), `FINAL_POST_HOUR_UTC: 21`.

3. **Backend validation check**
   - Verify `backend/src/utils/minigame.js` `validateScore('dream_interview', score)` works with `maxScore: 5`.
   - Verify `buildReward('dream_interview')` returns correct reward shape.
   - No code changes needed if generic utils already support any game ID from config.

4. **Frontend component `frontend/src/components/MiniGameDreamInterview.jsx`**
   - State: `questions` (5 random from 10), `currentIndex`, `score`, `timeLeft`, `phase` ('intro' | 'playing' | 'results').
   - Intro screen: title, rules (5 questions × 10 sec), start button.
   - Playing screen: question text, 4 answer buttons, 10s countdown bar.
   - On answer or timeout: record correctness, advance to next question.
   - Results screen: score / 5, success/fail message, call `onComplete(score)`.
   - Questions (hardcoded):
     ```js
     const QUESTIONS = [
       { q: 'Что вернёт `typeof null` в JavaScript?', options: ['"null"', '"object"', '"undefined"', '"number"'], correct: 1 },
       { q: 'Какая команда создаёт новую ветку в git?', options: ['git branch', 'git checkout', 'git new', 'git switch -c'], correct: 3 },
       { q: 'Сложность бинарного поиска?', options: ['O(n)', 'O(log n)', 'O(n²)', 'O(1)'], correct: 1 },
       { q: 'Какой HTTP статус означает "Not Found"?', options: ['400', '401', '403', '404'], correct: 3 },
       { q: 'Что делает SQL команда DROP?', options: ['Удаляет таблицу', 'Удаляет строку', 'Создаёт индекс', 'Обновляет данные'], correct: 0 },
       { q: 'Какой порт по умолчанию у PostgreSQL?', options: ['3306', '5432', '6379', '27017'], correct: 1 },
       { q: 'Что такое Docker image?', options: ['Контейнер', 'Снимок файловой системы', 'Виртуальная машина', 'Процесс'], correct: 1 },
       { q: 'React useEffect с пустым массивом [] вызывается...', options: ['Каждый рендер', 'Только при размонтировании', 'Только при монтировании', 'Никогда'], correct: 2 },
       { q: 'Какой алгоритм сортировки имеет среднюю сложность O(n log n)?', options: ['Bubble Sort', 'Quick Sort', 'Insertion Sort', 'Bogo Sort'], correct: 1 },
       { q: 'Что означает CAP-теорема?', options: ['Consistency, Availability, Partition tolerance', 'Cache, API, Performance', 'Code, Architecture, Pattern', 'Concurrency, Atomicity, Persistence'], correct: 0 }
     ];
     ```

5. **MiniGameLauncher integration**
   - Add `dream_interview` to `GAMES` array.
   - Import `MiniGameDreamInterview` and add conditional render.
   - Icon: 🎤 or 🧠

---

## Wave 2: Shared Telegram Utility + Team Hackathon Chat Post

**Goal:** Extract shared chat poster; add weekly final result post for team hackathon.

### Tasks

6. **Extract `backend/src/utils/telegram.js`**
   - Move `postToTelegramChat(chatId, text)` from `dailySummaryCron.js`.
   - Keep same signature: uses `BOT_TOKEN`, `fetch`, `parse_mode: 'Markdown'`.
   - Export function.

7. **Update `dailySummaryCron.js`**
   - Import `postToTelegramChat` from `../utils/telegram.js`.
   - Remove local `postToTelegramChat` function.

8. **Add message builder `backend/src/utils/teamHackathon.js`**
   - `buildHackathonFinalMessage(teamName, progressPct, tier, members, success)`:
     - If success (GOLD): `🏆 Команда "${teamName}" покорила хакатон! Прогресс: ${progressPct}%. Всем членам выдан скин "Чемпион хакатона".` + member list.
     - If failure (< BRONZE): `😅 Команда "${teamName}" не дотянула до цели (${progressPct}%). Менеджер уже знает. #мы_старались` + member list.

9. **Cron job `backend/src/jobs/teamHackathonCron.js`**
   - `node-cron` schedule: `0 21 * * 0` (Sunday 21:00 UTC).
   - For each team:
     - Fetch current week hackathon state (`team_hackathon_state` from leader's progression or aggregate from all members).
     - Calculate total progress and tier.
     - If GOLD and not yet claimed: auto-grant `team_champion` skin to all active members via `user_skins` INSERT.
     - Build message via `buildHackathonFinalMessage`.
     - Post to each member's `work_chat_id` (from `progression.social_state`).
   - Idempotency: track `lastHackathonPostWeek` in a simple way (check if current week already posted by looking at `team_hackathon_state.weekId` vs posted weeks table). For MVP: skip if `team_hackathon_state` shows week already claimed/rewarded.

10. **Update `backend/src/index.js`**
    - Import and start `teamHackathonCron` (behind `ENABLE_TEAM_HACKATHON_CRON !== 'false'`).

11. **Update `backend/src/routes/teamHackathon.js`**
    - On GOLD claim: grant `team_champion` skin to all active team members.
    - Insert into `user_skins` with `equipped = false`.

---

## Wave 3: Team Lead Skin + Daily Battle Bonus

**Goal:** `team_lead` skin exists, equippable, and grants +15% productivity in Daily Battle.

### Tasks

12. **Migration `030_team_skins.sql`** (skin definitions already covered in Task 1)
    - Also ensure `team_lead` is granted correctly on referral milestone claim.
    - Check `backend/src/utils/referral.js` — `STAGE3.REFERRAL.MILESTONE_REWARDS[5]` already has `skin: 'team_lead'` for inviter.
    - Verify that `applyReward` or referral claim path actually inserts into `user_skins`. If not, fix it.

13. **Check referral skin grant path**
    - Trace `POST /api/referral/claim-milestone` or equivalent to see if skin reward creates `user_skins` row.
    - If missing, add `INSERT INTO user_skins (user_id, skin_id, equipped, unlocked_at) VALUES ($1, $2, false, NOW()) ON CONFLICT DO NOTHING` in the reward applicator.

14. **Update `backend/src/utils/dailySummary.js`**
    - In `calculateDailySummaryScores`, after fetching progression, also fetch equipped skin:
      ```sql
      SELECT skin_id FROM user_skins WHERE user_id = $1 AND equipped = true
      ```
    - If equipped skin is `team_lead`, multiply `scoreProductivity` by 1.15 before normalizing/capping.
    - Or simpler: after computing `scoreProductivity`, if `team_lead` equipped, `scoreProductivity = Math.min(scoreProductivity * 1.15, DAILY_SUMMARY.SCORE.PRODUCTIVITY_WEIGHT)`.

15. **Frontend skin presentation**
    - In `frontend/src/components/SkinPanel.jsx` (or wherever skins are listed), ensure `team_lead` and `team_champion` appear with correct names and descriptions.
    - No changes needed if skins are dynamically loaded from `/api/skins`.

---

## Wave 4: Tests & Polish

**Goal:** All new code tested, no regressions, clean working tree.

### Tasks

16. **Unit tests `backend/tests/phase8.unit.test.js`**
    - Test `validateScore('dream_interview', 4)` → true; `validateScore('dream_interview', 3)` → true (server accepts any score 0–5); `validateScore('dream_interview', 6)` → false.
    - Test `buildReward('dream_interview')` returns `{ commits: 200, depressionRelief: 30, skinFragment: 'dream_interview_rare' }`.
    - Test `buildHackathonFinalMessage` success and failure formats.
    - Test Daily Summary with `team_lead` equipped: productivity score is 15% higher than without.
    - Test `postToTelegramChat` mock (optional — skip if no Telegram token in test env).

17. **Frontend build verification**
    - `cd frontend && npm run build` — zero errors.

18. **Backend test verification**
    - `cd backend && npm test` — all new tests pass, no regressions.

19. **Update `.planning/STATE.md`**
    - Mark Phase 8 as "In Progress" → "Complete" after verification.

20. **Git commit**
    - Commit all changes with message pattern: `feat(08): ...` / `test(08): ...`

---

## Verification Checklist

- [ ] Dream Interview appears in MiniGameLauncher for level 6+ players.
- [ ] 5 random questions, 10s timer, 4 options each.
- [ ] Score 4/5 or 5/5 awards +200 commits, –30 depression, rare skin fragment.
- [ ] 24h cooldown enforced server-side.
- [ ] `team_lead` skin seeded in DB and granted on 5th referral milestone.
- [ ] `team_champion` skin seeded in DB and granted on GOLD team hackathon claim.
- [ ] Daily Battle productivity score is +15% when `team_lead` skin equipped.
- [ ] Team hackathon final post goes out Sunday 21:00 UTC to members' bound chats.
- [ ] Success post shows progress + skin award; failure post shows humorous message.
- [ ] All tests pass (target: 8+ new tests).
- [ ] No breaking changes to existing mini-games or team system.
