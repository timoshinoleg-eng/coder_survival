# Phase 5: Streaks, Achievements & Social Seeds — PLAN.md

> Status: Ready for review
> Requirements: PROG-03, PROG-04, PROG-07, SOCL-06, SOCL-07
> Context: 05-CONTEXT.md, 05-DISCUSSION-LOG.md
> Mode: mvp

---

## Goal
Ship long-term retention mechanics (streaks, achievements) and activate the first social/referral hooks with anti-farm protection.

---

## Architecture

```
Before:
  streak_state JSONB    → basic daily login + free save
  4 achievements        → tap, commit, rank, night
  referral JSONB        → basic tracking, energy rewards
  anti-farm             → 20 commits only

After:
  streak_state JSONB    → + star recovery (escalating cost)
  10+ achievements      → + burnout, coffee, meme, bug, referral, prod
  achievement share     → meme renderer overlay
  referral JSONB        → tiered +50/+200/Team Lead, invited auto-reward
  anti-farm             → 2 days + 20 commits
```

---

## Work Breakdown

### W1: Streaks Polish & Recovery (PROG-03, PROG-04)

#### 1.1 Update streak milestones (`backend/src/config/balance.js`)
- Remove milestone 3 and 21 from `STAGE2.STREAK.MILESTONES`
- Keep 7, 14, 30 with updated rewards:
  - 7: `{ commitBoostPercent: 10, durationHours: 24, title: 'week_warrior' }`
  - 14: `{ skinFragment: 'midnight_office', title: 'office_dweller' }`
  - 30: `{ skin: 'retro_boombox' }`

#### 1.2 Add star recovery logic (`backend/src/utils/streak.js`)
- New function `calculateRecoveryCost(starSavesUsed)` → `5 + starSavesUsed * 5`
- New function `starRecover(streakState, todayDate, starsAvailable)`:
  - Validates: streak is broken (missed > 1 day), stars >= cost
  - Restores `currentStreak` from `brokenStreak` value (stored in state)
  - Increments `starSavesUsed`
  - Returns `{ success, newState, cost }`

#### 1.3 Add recovery endpoint (`backend/src/routes/streak.js`)
- `POST /api/streak/recover`
- Body: `{ stars: number }` (client confirms cost)
- Checks `stars` inventory, deducts cost, calls `starRecover()`
- Returns updated streak state + calendar
- Never allows recovery if `loggedInToday === true`

#### 1.4 Update StreakCalendar UI (`frontend/src/components/StreakCalendar.jsx`)
- Add "Восстановить серию" button when streak is broken (missed days > 0, not logged in today)
- Show cost: "💎 5 Stars" (or current calculated cost)
- On success: toast with humorous message
- On fail: toast "Не хватает Stars или серия не прервана"

#### 1.5 Humorous break messages
- Add 5 random messages displayed when streak breaks:
  - "Ты пропустил день. Дедлайн победил."
  - "Серия сгорела, как твой прод в пятницу вечером."
  - "Один день без кодинга — уже не программист?"
  - "Твой стрик ушёл в отпуск. Без тебя."
  - "Выгорание: 1. Ты: 0. Но завтра новый раунд!"

---

### W2: Achievement Expansion (PROG-07)

#### 2.1 Migration: achievement expansion (`backend/migrations/026_achievement_expansion.sql`)
- Insert 6 new achievements into `achievements` table:
  ```sql
  INSERT INTO achievements (achievement_id, name, description, target_value, reward_payload)
  VALUES
    ('burnout_first', 'Полное выгорание', 'Поздравляем! Ты официально сгорел...', 1, '{"title":"Пепел"}'::jsonb),
    ('coffee_addict', 'Эспрессо-зависимый', 'Твоя кровь на 90% кофеин...', 50, '{}'::jsonb),
    ('meme_lord', 'Мемный олигарх', 'Ты позорился 10 раз...', 10, '{}'::jsonb),
    ('bug_hunter', 'Охотник за багами', 'Ты нашёл 100 багов...', 100, '{}'::jsonb),
    ('referral_god', 'HR-отдел в одном лице', 'Ты привёл 5 человек в этот ад...', 5, '{"title":"Рекрутёр"}'::jsonb),
    ('prod_survivor', 'Выживший на проде', 'Прод упал 10 раз...', 10, '{}'::jsonb)
  ON CONFLICT (achievement_id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    target_value = EXCLUDED.target_value,
    reward_payload = EXCLUDED.reward_payload;
  ```
- Backfill: ensure all existing users get new achievement rows via `ensureAchievementRows()`

#### 2.2 Extend achievement engine (`backend/src/utils/achievements.js`)
- Add new trigger types: `burnout`, `use_item`, `meme_share`, `random_event`, `referral`, `quest_claim`, `streak_recover`
- Update `checkAchievement()` with cases for each new trigger
- For `burnout`: check if `depression_level >= 100`
- For `use_item`: filter by `itemId === 'coffee'`
- For `meme_share`: increment `meme_lord`
- For `random_event`: filter by `eventId === 'prod_down'`
- For `referral`: count referrals via `referrals` table (or track in JSONB)
- For `quest_claim`: check 7 consecutive full clears (more complex — defer to Phase 6 or simplified version)
- For `streak_recover`: increment `streak_saver` (bonus, defer if complex)

#### 2.3 Hook achievements across routes
- `backend/src/routes/state.js`: after depression update, if `>= 100` → `checkAchievement(client, userId, 'burnout')`
- `backend/src/routes/tap.js`: on crit tap → `checkAchievement(client, userId, 'tap', { isCrit: true })` (extend existing tap case with crit filtering)
- `backend/src/routes/meme.js`: after successful share → `checkAchievement(client, userId, 'meme_share')`
- `backend/src/routes/quests.js`: after full clear claim → `checkAchievement(client, userId, 'quest_claim')`
- `backend/src/routes/referral.js`: after successful track → `checkAchievement(client, userId, 'referral')`
- Random events: hook in event processor (if exists) or note for Phase 6

#### 2.4 Create AchievementsPanel (`frontend/src/components/AchievementsPanel.jsx`)
- Modal component (reuse DailyQuests modal pattern)
- Lists all achievements with: icon placeholder, name, description, progress bar, completed status
- Completed achievements show ✅ and «Позориться» button
- «Позориться» calls `/api/meme/achievement` (new endpoint) and opens Telegram share

#### 2.5 Achievement meme endpoint (`backend/src/routes/meme.js` or new)
- `GET /api/meme/achievement?achievementId=xxx` — returns PNG with achievement name + description + player stats
- Reuse `@napi-rs/canvas` renderer from Phase 3
- Template: achievement card with pixel-art styling, player avatar placeholder, funny quote

#### 2.6 Update StatsBar (`frontend/src/components/StatsBar.jsx`)
- Add 🏆 achievement button opening `AchievementsPanel` modal
- Show badge with count of newly unlocked (unseen) achievements

#### 2.7 Update useGameState hook (`frontend/src/hooks/useGameState.js`)
- Add `achievements` array to state
- Add `refreshAchievements()` helper
- Add `shareAchievement(achievementId)` helper

---

### W3: Referral Rebalancing & Anti-Farm (SOCL-06, SOCL-07)

#### 3.1 Migration: anti-farm field (`backend/migrations/027_streak_recovery.sql`)
- Actually for anti-farm, not streak recovery (rename conceptually):
  ```sql
  ALTER TABLE progression ADD COLUMN IF NOT EXISTS first_active_at TIMESTAMPTZ DEFAULT NOW();
  ```
- Backfill existing rows with `created_at` from `users` table where NULL

#### 3.2 Update referral config (`backend/src/config/balance.js`)
- Update `STAGE3.REFERRAL.MILESTONE_REWARDS`:
  ```js
  1: { inviter: { commits: 50, energy: 25 }, invited: { commits: 100, inventory: { coffee_cups: 1 } } },
  3: { inviter: { commits: 200, energy: 50, stars: 5 }, invited: { commits: 100, energy: 25 } },
  5: { inviter: { skin: 'team_lead', energy: 100 }, invited: { commits: 100, stars: 5 } }
  ```
- Add `REFERRAL.ANTI_FARM_DAYS = 2`

#### 3.3 Update referral engine (`backend/src/utils/referral.js`)
- Modify `checkReferralMilestones(referralState, totalCommits, firstActiveAt, now)`:
  - Check `daysBetween(firstActiveAt, now) >= 2`
  - Check `totalCommits >= ACTIVE_THRESHOLD_COMMITS`
  - Both must be true for milestone unlock
- Add helper `isReferralActive(referredProgression)` → boolean

#### 3.4 Update referral routes (`backend/src/routes/referral.js`)
- In `/track` and `/`: after creating referral, schedule/check invited reward
- In claim endpoints: use new milestone reward shape (commits instead of raw energy)
- Auto-grant invited reward when anti-farm threshold reached:
  - On any state load or referral status check, if referred user now meets 2 days + 20 commits:
    - Grant `commits: 100` to referred user's `progression.commits_total`
    - Grant `coffee_cups: 1` to inventory
    - Mark referral status as 'rewarded'

#### 3.5 Ensure pass XP log hook
- Verify `state.js` (or referral route) calls `logPassXp(client, referrerId, activePass.id, 'social', 25, { referredId })` on successful bind
- This already exists in `state.js:195` per Phase 4 — verify it still works after changes

#### 3.6 Update ReferralPanel UI (`frontend/src/components/ReferralPanel.jsx`)
- Update milestone display to show new rewards (commits, energy, stars, skins)
- Add invited reward preview: "Твой друг получит +100 коммитов и эспрессо"
- Show anti-farm status for pending referrals: "2 дня / 20 коммитов"

---

### W4: Tests, Polish & Cleanup

#### 4.1 Backend tests (`backend/tests/phase5.unit.test.js`)
- `processDailyLogin` — streak continuation, break, free save, star recovery cost escalation
- `starRecover` — validates cost, restores streak, deducts stars
- `checkAchievement` — all 10 triggers complete correctly
- `checkReferralMilestones` — anti-farm gate (2 days + 20 commits)
- `getUnlockedReferralMilestones` — tiered rewards parsing

#### 4.2 Integration tests (if DB available)
- `POST /api/streak/recover` — full flow with stars deduction
- `GET /api/achievements` — returns list with progress
- `POST /api/referral/track` — anti-farm blocks premature reward

#### 4.3 Frontend build verification
- `npm run build` in frontend — 0 errors
- Visual smoke: AchievementsPanel opens, shows 10 achievements, "Позориться" visible on completed
- Visual smoke: StreakCalendar shows recovery button when appropriate
- Visual smoke: ReferralPanel shows new tiered milestones

#### 4.4 Balance audit
- Streak recovery: 5 Stars base, escalating. At 3 recoveries = 15 Stars. Not game-breaking.
- Achievement rewards: mostly cosmetic (titles, fragments). No pay-to-win.
- Referral: inviter gets commits (not raw energy), invited gets starter pack. Balanced.

#### 4.5 Remove dead code
- Clean up any old referral reward constants if duplicated
- Remove commented-out milestone 3/21 references

---

## Files to Create

| File | Description |
|------|-------------|
| `backend/migrations/026_achievement_expansion.sql` | Insert 6 new achievements |
| `backend/migrations/027_anti_farm_first_active.sql` | Add `first_active_at` to progression |
| `backend/tests/phase5.unit.test.js` | Unit tests for streak recovery, achievements, referral anti-farm |
| `frontend/src/components/AchievementsPanel.jsx` | Achievement list modal |
| `frontend/src/components/AchievementShare.jsx` | Share overlay for achievement meme |

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/config/balance.js` | Update STREAK milestones, REFERRAL rewards, achievement registry |
| `backend/src/utils/streak.js` | Add `starRecover()`, `calculateRecoveryCost()` |
| `backend/src/routes/streak.js` | Add `POST /api/streak/recover` |
| `backend/src/utils/achievements.js` | Add 6 new trigger types |
| `backend/src/routes/tap.js` | Hook `bug_hunter` on crit |
| `backend/src/routes/meme.js` | Hook `meme_lord`; add achievement meme endpoint |
| `backend/src/routes/state.js` | Hook `burnout_first` on depression=100 |
| `backend/src/routes/quests.js` | Hook `full_clear_week` (simplified) |
| `backend/src/utils/referral.js` | Add 2-day + 20 commit anti-farm check |
| `backend/src/routes/referral.js` | Update rewards, auto-grant invited reward, milestone shapes |
| `frontend/src/components/StreakCalendar.jsx` | Add recovery button + cost display |
| `frontend/src/components/StatsBar.jsx` | Add achievement button |
| `frontend/src/components/ReferralPanel.jsx` | Update milestone rewards display |
| `frontend/src/hooks/useGameState.js` | Add achievements state helpers |

## Verification

- [ ] `npm test` backend — all existing tests pass + new phase5 tests pass
- [ ] `npm run build` frontend — 0 errors
- [ ] Streak milestones: 7/14/30 only, rewards match config
- [ ] Streak recovery: cost escalates 5→10→15, deducts stars, restores streak
- [ ] Achievements: 10 visible in panel, 6 new trigger correctly
- [ ] Achievement share: "Позориться" generates PNG, opens Telegram share
- [ ] Referral: 1→+50/+energy, 3→+200/+stars, 5→Team Lead skin
- [ ] Anti-farm: referral reward blocked until 2 days + 20 commits
- [ ] Invited auto-reward: +100 commits + espresso on threshold reach
- [ ] Pass XP log: referral bind logs `social` XP

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Achievement triggers missed in some routes | Centralized `checkAchievement()` call + audit all routes in W4 |
| Achievement meme renderer overload | Rate limit `/api/meme/achievement` (reuse Phase 3 rate limiter) |
| Referral anti-farm breaks existing referrals | Backfill `first_active_at` with `users.created_at`; grandfather existing rewarded referrals |
| Star recovery too cheap/expensive | Start with 5 Stars base, monitor economy; adjust via balance config |
| Achievement panel performance | Lazy-load achievements; paginate if >20 (not needed yet) |

## Estimation

- W1: Streak polish + recovery — ~2.5h
- W2: Achievement expansion + share — ~3.5h
- W3: Referral rebalancing + anti-farm — ~2.5h
- W4: Tests, cleanup, polish — ~2h
- **Total: ~10.5h**

---

*Plan ready for review. Next: `/gsd:execute-phase 5` or `/gsd:review` for cross-AI peer review.*
