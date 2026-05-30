# Phase 7: Daily Battle & Referral Rewards — PLAN.md

> Context: [07-CONTEXT.md](./07-CONTEXT.md)
> Mode: MVP
> Estimated: 4 waves, ~16 tasks

---

## Wave 1: Backend Core (DB, Config, Scoring, Distribution)

**Goal:** Backend can calculate daily summary scores, determine statuses, distribute rewards, and store results idempotently.

### Tasks

1. **Migration `029_daily_summary.sql`**
   - Create `daily_summary_results` table:
     ```sql
     CREATE TABLE daily_summary_results (
       id SERIAL PRIMARY KEY,
       user_id INTEGER NOT NULL REFERENCES users(id),
       summary_date DATE NOT NULL,
       score_total NUMERIC(6,2) NOT NULL DEFAULT 0,
       score_productivity NUMERIC(6,2) NOT NULL DEFAULT 0,
       score_depression NUMERIC(6,2) NOT NULL DEFAULT 0,
       score_social NUMERIC(6,2) NOT NULL DEFAULT 0,
       score_referral NUMERIC(6,2) NOT NULL DEFAULT 0,
       rank INTEGER,
       status VARCHAR(50),
       reward_payload JSONB DEFAULT '{}',
       claimed_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ DEFAULT NOW(),
       UNIQUE(user_id, summary_date)
     );
     CREATE INDEX idx_daily_summary_date ON daily_summary_results(summary_date);
     CREATE INDEX idx_daily_summary_rank ON daily_summary_results(summary_date, rank);
     ```

2. **Config update `backend/src/config/balance.js`**
   - Add `DAILY_SUMMARY` object:
     ```js
     DAILY_SUMMARY: {
       SCORE: {
         PRODUCTIVITY_MAX_COMMITS: 500,
         PRODUCTIVITY_WEIGHT: 40,
         DEPRESSION_WEIGHT: 30,
         SOCIAL_MAX_EVENTS: 5,
         SOCIAL_WEIGHT: 20,
         REFERRAL_MAX_COUNT: 3,
         REFERRAL_WEIGHT: 10
       },
       STATUSES: {
         PRODUCTIVE_GENIUS: { id: 'productive_genius', title: 'Продуктивный гений' },
         BURNT_OUT: { id: 'burnt_out', title: 'Выгорел дня' },
         DEPRESSION_SAVIOR: { id: 'depression_savior', title: 'Спаситель депрессии' }
       },
       REWARDS: {
         RANK_1: { tapBoostPercent: 15, tapBoostDurationHours: 24, skinFragment: 'battle_hero', title: 'daily_hero' },
         RANK_2: { tapBoostPercent: 10, tapBoostDurationHours: 12 },
         RANK_3: { tapBoostPercent: 5, tapBoostDurationHours: 6 }
       },
       POST_HOUR_UTC: 18
     }
     ```

3. **Utility `backend/src/utils/dailySummary.js`**
   - `calculateDailySummaryScores(client, date)`:
     - Fetch all users who had activity today (sessions, progression).
     - For each user, compute four sub-scores using formula from CONTEXT.md.
     - Return array of `{ userId, scores: { total, productivity, depression, social, referral } }`.
   - `determineStatuses(results, progressionRows)`:
     - Find highest `score_productivity` → "productive_genius"
     - Find highest `depression_level` → "burnt_out"
     - Find lowest `depression_level` → "depression_savior"
     - Attach status to result row.
   - `distributeDailySummaryRewards(client, date)`:
     - Advisory lock (`pg_advisory_xact_lock`) + idempotency check.
     - Call `calculateDailySummaryScores`.
     - Rank by `score_total DESC`.
     - Assign statuses.
     - Insert into `daily_summary_results`.
     - Apply rewards to top 3 via `applyReward()` + `addEffect()` for tap boost.
     - Return `{ distributed, results }`.

4. **Route `backend/src/routes/dailySummary.js`**
   - `GET /api/daily-summary/today` — returns today's results (top 10), current user's result, time until next battle.
   - `GET /api/daily-summary/history` — returns last 7 days of results for current user.
   - `POST /api/daily-summary/bind-chat` — accepts `{ chatId }`, stores in `progression.social_state.work_chat_id`. (Alternative to bot `/bindchat` — frontend can also bind if it has chatId.)
   - `POST /api/daily-summary/trigger` — admin/cron endpoint, protected by `X-Bot-Backend-Secret`. Body optional `{ date }`. Calls `distributeDailySummaryRewards()`.

5. **Cron job `backend/src/jobs/dailySummaryCron.js`**
   - Use `node-cron` package (add to `package.json` if missing).
   - Schedule: `cron.schedule('0 18 * * *', async () => { ... })`
   - Inside job:
     - Connect to pool.
     - Call `distributeDailySummaryRewards(client)`.
     - For each user with `work_chat_id`, post summary message via Telegram Bot API.
     - Release client.
   - Message format (Markdown):
     ```
     🏆 *Ежедневная битва завершена!*

     🥇 [Name] — Продуктивный гений (score: X)
     🥈 [Name] — score: Y
     🥉 [Name] — score: Z

     Статусы дня:
     🧠 Продуктивный гений: [Name]
     🔥 Выгорел дня: [Name]
     💚 Спаситель депрессии: [Name]
     ```

---

## Wave 2: Bot Integration

**Goal:** Players can bind a work chat; backend can post to Telegram.

### Tasks

6. **Bot command `/bindchat`** (`bot/src/createBot.js`)
   - Handler for `bot.command('bindchat')`.
   - Only works in group chats (`ctx.chat.type !== 'private'`).
   - Saves `ctx.chat.id` to backend via `POST /api/daily-summary/bind-chat` (internal auth).
   - Reply: "✅ Рабочий чат привязан. Ежедневная битва будет публиковаться здесь в 18:00."

7. **Backend Telegram posting helper**
   - Add `postToTelegramChat(chatId, text)` in `dailySummaryCron.js` or separate util.
   - Uses `fetch` to `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage` with `parse_mode: 'Markdown'`.
   - Handle errors gracefully (log and continue).

8. **Install `node-cron`**
   - `cd backend && npm install node-cron`
   - Add `@types/node-cron` if using TypeScript (project is JS, so skip).

---

## Wave 3: Frontend

**Goal:** Players can view daily summary results, their status, and time until next battle.

### Tasks

9. **Component `frontend/src/components/DailySummaryPanel.jsx`**
   - Modal panel (reuse existing modal pattern from `DailyQuests.jsx`).
   - Sections:
     - **Countdown**: Time until 18:00 UTC next day.
     - **Top 3**: Podium display with avatars (reuse `Leaderboard.jsx` row style).
     - **My Result**: My rank, total score, breakdown (productivity/depression/social/referral bars).
     - **My Status**: If I won a status today, show badge with title.
     - **History**: Last 7 days summary.
   - Data from `GET /api/daily-summary/today` and `GET /api/daily-summary/history`.

10. **StatsBar integration**
    - Add button in `frontend/src/components/StatsBar.jsx` to open `DailySummaryPanel`.
    - Icon: 🏆 or trophy emoji.

11. **useGameState hook update**
    - Add `fetchDailySummary()`, `dailySummary` state.
    - Refresh on app open.

---

## Wave 4: Tests & Polish

**Goal:** All new code tested; no regressions; working tree clean.

### Tasks

12. **Unit tests `backend/tests/phase7.unit.test.js`**
    - Test score calculation with known inputs (commits, depression, social, referrals).
    - Test normalization caps (commits > 500 still = 40 productivity points).
    - Test status determination (highest productivity, highest/lowest depression).
    - Test idempotency (calling distribute twice returns `alreadyDistributed: true`).
    - Test advisory lock behavior.
    - Test tap boost reward application (check `active_effects` JSONB).

13. **Integration: register routes and cron**
    - `backend/src/index.js`: `app.use('/api/daily-summary', dailySummaryRouter);`
    - Import and start cron job after server start (behind `if (process.env.ENABLE_DAILY_SUMMARY_CRON !== 'false')`).

14. **Frontend build verification**
    - `cd frontend && npm run build` — zero errors.

15. **Backend test verification**
    - `cd backend && npm test` — all new tests pass, no regressions.

16. **Documentation update**
    - Update `.planning/STATE.md` — mark Phase 7 as "In Progress".
    - Update `backend/README.md` if needed (new env var `ENABLE_DAILY_SUMMARY_CRON`).

---

## Verification Checklist

- [ ] `daily_summary_results` table created and indexed.
- [ ] Score formula produces 0–100 total for edge cases.
- [ ] Cron job fires at 18:00 UTC (testable by adjusting system time or manual trigger).
- [ ] `/bindchat` in group saves chat_id and bot confirms.
- [ ] Chat post shows top 3 + statuses in Markdown.
- [ ] Top player gets `active_effects.tapBoost` with +15% for 24h.
- [ ] Frontend panel shows countdown, top 3, my result, history.
- [ ] All tests pass (target: 10+ new tests).
- [ ] No breaking changes to existing PvP battle system.
