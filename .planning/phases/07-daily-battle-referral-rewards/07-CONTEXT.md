# Phase 7: Daily Battle & Referral Rewards — CONTEXT.md

> Status: Locked decisions for planning
> Requirements: SOCL-01, SOCL-02
> Date: 2026-05-22

---

## Requirements

### SOCL-01: Daily Battle — ежедневная сводка в рабочем чате
- Время публикации: 18:00 ежедневно
- Формула score: продуктивность 40%, депрессия 30%, соцактивность 20%, рефералы 10%
- Автоматическая публикация в привязанный рабочий чат

### SOCL-02: Daily Battle — статусы и награды
- Три статуса: «Продуктивный гений», «Выгорел дня», «Спаситель депрессии»
- Награды: титулы, скины (фрагменты), временный бонус к тапу
- Отображение на профиле игрока

---

## Locked Decisions

### Naming & Architecture
1. **Internal name: `DailySummary`** — avoids collision with existing PvP `battle_state` / `/api/battle/*`. In UI still displayed as "Ежедневная битва" / "Daily Battle".
2. **Database table: `daily_summary_results`** — columns: `id`, `user_id`, `summary_date`, `score_total`, `score_productivity`, `score_depression`, `score_social`, `score_referral`, `rank`, `status` (nullable), `reward_payload JSONB`, `claimed_at` (nullable).
3. **Work chat storage: `progression.social_state.work_chat_id`** — BIGINT, stored inside existing JSONB. No new column needed.
4. **Scheduler: `node-cron` in backend** — cron expression `0 18 * * *` (18:00 UTC). UTC is acceptable for MVP; timezone per-user deferred.
5. **Posting flow:** Backend cron → calculate → store results → call Telegram Bot API directly (`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`) to post rich-text summary to `work_chat_id`. No bot cron needed.

### Score Formula (MVP)
6. **Productivity 40%**: `commits_earned` from `sessions` table today, normalized: `MIN(commits / 500, 1) * 40`. Cap at 500 commits = 100% of productivity component.
7. **Depression 30%**: Inverted depression level. `((100 - depression_level) / 100) * 30`. Lower depression = higher score.
8. **Social activity 20%**: Count of (`meme_share` events today + daily quests completed today + mini-games played today). Normalized: `MIN(count / 5, 1) * 20`.
9. **Referrals 10%**: Count of active referrals (passed anti-farm: ≥2 days + 20 commits). Normalized: `MIN(count / 3, 1) * 10`.
10. **Total score**: sum of the four components. Rank players by `score_total DESC`.

### Statuses & Rewards
11. **«Продуктивный гений»** — awarded to player with highest `score_productivity` (commits today) among top-10.
12. **«Выгорел дня»** — awarded to player with highest `depression_level` among those who played today.
13. **«Спаситель депрессии»** — awarded to player with lowest `depression_level` among those who played today.
14. **Titles**: stored in `progression.inventory` as `title_productive_genius`, `title_burnt_out`, `title_depression_savior`.
15. **Tap bonus reward**: +15% tap boost for 24 hours, applied via `progression.active_effects` (reuse Phase 6 engine). Only for #1 ranked player.
16. **Skin fragment reward**: `battle_hero` fragment for #1 ranked player.
17. **Idempotency**: Advisory lock + check `daily_summary_results` for date before calculation (same pattern as `battleDistribution.js`).

### Bot Binding
18. **Command: `/bindchat`** — when sent in a group chat, bot saves `ctx.chat.id` into caller's `progression.social_state.work_chat_id`. Replies with confirmation.
19. **Requirement to bind**: Player must have `work_chat_id` set for daily summary to be posted. If not set, cron silently skips posting for that user (no error). Posting is per-user, not global. Only users with bound chat get their summary posted.

### Scope Fences
- **IN**: Daily summary scoring, cron job, work chat binding, three statuses, title/tap-bonus rewards, Telegram posting.
- **OUT**: Team-based daily battle (Phase 8), timezone support, per-group leaderboards, GIF/image generation for chat post.
- **NO**: Renaming existing PvP battle system.
- **NO**: New DB tables beyond `daily_summary_results`.
- **NO**: Energy cost to participate.

---

## Reusable Assets

| Asset | Location | How to reuse |
|-------|----------|-------------|
| Active effects engine | `backend/src/utils/activeEffects.js` | Grant tap boost via `addEffect('tapBoost', ...)` |
| Reward applicator | `backend/src/utils/rewards.js` — `applyReward()` | Consistent reward grants (commits, energy, inventory) |
| Battle distribution lock pattern | `backend/src/utils/battleDistribution.js` | Copy advisory lock + idempotency check |
| Meme share tracking | `backend/src/routes/meme.js` | Hook `share_stats` JSONB for social score |
| Daily quest completion | `backend/src/utils/dailyQuests.js` | Check `daily_quests_state` for quests completed today |
| Mini-game state | `progression.minigame_state` | Check `lastPlayedAt` dates for games played today |
| Referral anti-farm | `backend/src/utils/referral.js` | Reuse `checkReferralMilestones` / active threshold logic |
| Bot command pattern | `bot/src/createBot.js` | Add `/bindchat` handler alongside existing commands |

---

## Files to Create

| File | Description |
|------|-------------|
| `backend/migrations/029_daily_summary.sql` | Create `daily_summary_results` table |
| `backend/src/utils/dailySummary.js` | Score calculation, status determination, distribution logic |
| `backend/src/routes/dailySummary.js` | Routes: `/api/daily-summary/today`, `/api/daily-summary/history`, `/api/daily-summary/bind-chat` |
| `backend/src/jobs/dailySummaryCron.js` | `node-cron` job: calculate + post at 18:00 |
| `backend/tests/phase7.unit.test.js` | Tests for scoring, status, rewards, cron idempotency |
| `frontend/src/components/DailySummaryPanel.jsx` | Panel showing today's results, user's status, countdown to 18:00 |

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/config/balance.js` | Add `DAILY_SUMMARY` config: score caps, status definitions, rewards |
| `backend/src/index.js` | Register `dailySummary` routes, start cron job |
| `bot/src/createBot.js` | Add `/bindchat` command handler |
| `frontend/src/components/StatsBar.jsx` | Add Daily Summary button |
| `frontend/src/hooks/useGameState.js` | Add `dailySummary` state helpers |
