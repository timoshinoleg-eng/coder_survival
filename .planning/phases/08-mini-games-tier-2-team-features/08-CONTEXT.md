# Phase 8: Mini-Games Tier 2 & Team Features — CONTEXT.md

> Status: Locked decisions for planning
> Requirements: MINI-03, SOCL-04, SOCL-05, VISU-05
> Date: 2026-05-22

---

## Requirements

### MINI-03: Мини-игра «Собеседование мечты»
- IT-викторина, 5 вопросов по 10 секунд каждый
- Награда при успехе: +200 коммитов, –30 депрессии, фрагмент редкого скина
- Частота: раз в день (24h cooldown)
- Уровень: 6+

### SOCL-04: Командные цели (Team weekly hackathon)
- Группы до 5 человек
- Виджет прогресса в рабочем чате

### SOCL-05: Командные цели — награды и провал
- Эксклюзивный скин при достижении цели (GOLD tier)
- Шутливый статус при провале

### VISU-05: Скин «Тимлид»
- Бонус: +15% к продуктивности в Daily Battle
- Условие: пригласить 5 друзей

---

## Locked Decisions

### Dream Interview (MINI-03)
1. **Success threshold: 4/5 correct answers** — forgiving for MVP, prevents frustration.
2. **Questions stored in frontend** — backend validates only score count (0–5) and time plausibility, same pattern as Tier 1 mini-games.
3. **Question set**: 10 hardcoded IT trivia questions (mixed: algorithms, git, JavaScript, SQL, DevOps). Frontend picks 5 randomly per play.
4. **Timer per question**: 10 seconds. Total max time ~50s + transitions. Server enforces max total time of 60s (anti-cheat).
5. **Config in `STAGE2.MINIGAMES.dream_interview`**:
   ```js
   {
     requiredLevel: 6,
     cooldownHours: 24,
     timeLimitSeconds: 60,
     maxScore: 5,
     minSuccessScore: 4,
     reward: { commits: 200, depressionRelief: 30, skinFragment: 'dream_interview_rare' }
   }
   ```
6. **Component pattern**: Reuse Phase 6 overlay (`MiniGameLauncher` → `MiniGameDreamInterview.jsx`). No Phaser scene.

### Team Hackathon Chat Widget (SOCL-04)
7. **Posting schedule**: Final result posted once per week on Sunday at 21:00 UTC.
8. **Message content**: Team name, progress %, tier reached (BRONZE/SILVER/GOLD), members' contributions.
9. **Per-member posting**: Posted to each team member's bound `work_chat_id` (from Phase 7 `social_state`). If a member has no bound chat, skip silently.
10. **No team-level chat binding**: Reuse individual `work_chat_id` from Phase 7. A team may have members with different bound chats — post to all unique chats.
11. **Extract shared utility**: Move `postToTelegramChat()` from `dailySummaryCron.js` to `backend/src/utils/telegram.js` for reuse.

### Team Skin & Failure Status (SOCL-05)
12. **Exclusive skin**: `team_champion` — granted to all team members when team reaches GOLD tier (100% of hackathon target) and claims reward.
13. **Failure status**: If team ends week below BRONZE tier ( < 50% ), post a humorous message to chat instead of skin reward. No actual "status" stored in DB for failure — just the chat message.
14. **Skin grant flow**: On `/api/team/hackathon/claim` for GOLD tier, insert `team_champion` skin into `user_skins` for every active team member.

### Team Lead Skin (VISU-05)
15. **Skin definition**: Add `team_lead` row to `skin_definitions` (if missing). Name: «Тимлид», bonus description in UI: "+15% энергии команды в Daily Battle".
16. **Actual bonus implementation**: +15% multiplier on `score_productivity` component in Daily Battle calculation when player has `team_lead` skin equipped.
17. **Unlock condition**: Already implemented in referral system (5 friends milestone). Need to ensure `team_lead` skin is actually inserted into `user_skins` when milestone is claimed.
18. **Migration**: Seed `team_lead` and `team_champion` skins into `skin_definitions`.

### Scope Fences
- **IN**: Dream Interview mini-game, weekly hackathon chat post, team champion skin grant, team lead skin seed + Daily Battle bonus.
- **OUT**: Daily team hackathon notifications (9/15/21) — only final Sunday post for MVP.
- **OUT**: Team-level chat binding (use individual `work_chat_id`).
- **NO**: Phaser scene for Dream Interview.
- **NO**: Backend-stored question bank.
- **NO**: Real "team energy" shared pool — bonus applies to individual Daily Battle score.

---

## Reusable Assets

| Asset | Location | How to reuse |
|-------|----------|-------------|
| Mini-game generic API | `backend/src/routes/minigame.js`, `backend/src/utils/minigame.js` | Add `dream_interview` config entry |
| Mini-game launcher | `frontend/src/components/MiniGameLauncher.jsx` | Add game to `GAMES` array, import component |
| Active effects / rewards | `backend/src/utils/activeEffects.js`, `backend/src/utils/rewards.js` | Grant rewards via existing helpers |
| Team hackathon backend | `backend/src/routes/teamHackathon.js`, `backend/src/utils/teamHackathon.js` | Extend claim endpoint for skin grant |
| Telegram posting | `backend/src/jobs/dailySummaryCron.js` → extract to `utils/telegram.js` | Reuse for hackathon final post |
| Skin system | `backend/src/routes/skins.js`, `skin_definitions` table | Seed new skins, add bonus check in Daily Summary |
| Daily Summary scoring | `backend/src/utils/dailySummary.js` | Add equipped skin check for productivity multiplier |

---

## Files to Create

| File | Description |
|------|-------------|
| `backend/migrations/030_team_skins.sql` | Seed `team_lead` and `team_champion` into `skin_definitions` |
| `backend/src/utils/telegram.js` | Shared `postToTelegramChat()` extracted from dailySummaryCron |
| `backend/src/jobs/teamHackathonCron.js` | Weekly cron: calculate final results, post to chats, grant/notify |
| `frontend/src/components/MiniGameDreamInterview.jsx` | Quiz UI: 5 questions, 10s timer, results screen |
| `backend/tests/phase8.unit.test.js` | Tests for quiz validation, skin bonus math, hackathon message builder |

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/config/balance.js` | Add `dream_interview` to `STAGE2.MINIGAMES`; add `TEAM_HACKATHON.FINAL_POST_HOUR_UTC` |
| `backend/src/utils/dailySummary.js` | Add `team_lead` equipped skin check → +15% productivity multiplier |
| `backend/src/jobs/dailySummaryCron.js` | Import `postToTelegramChat` from `utils/telegram.js` |
| `backend/src/routes/teamHackathon.js` | On GOLD claim, grant `team_champion` skin to all members |
| `backend/src/utils/teamHackathon.js` | Add `buildHackathonFinalMessage()` helper |
| `backend/src/index.js` | Register `teamHackathonCron` |
| `frontend/src/components/MiniGameLauncher.jsx` | Add `dream_interview` to `GAMES`, add component render |
