# Phase 9: Advanced Content & Endgame Skins — STATUS.md

> Context: [09-CONTEXT.md](./09-CONTEXT.md)
> Mode: MVP
> Status: **COMPLETE**
> Committed: `TBD`

---

## Summary

Phase 9 delivered all planned features: two new endgame mini-games, weekly sprint quest tiers, three new endgame skins with equipped bonuses, and the Architectural Committee achievement. All backend and frontend code is integrated, tested, and builds clean.

---

## Wave 1: Backend Foundation (Config, Migrations, Skin Bonuses) ✅

1. **Migration `031_phase9_skins_and_achievements.sql`** ✅
   - Skins seeded: `cto_cape`, `senior_pajamas`, `legacy_archaeologist`, `heroically_fired`
   - Achievement `architect_winner` inserted with `condition` JSONB

2. **Config update `backend/src/config/balance.js`** ✅
   - `STAGE2.MINIGAMES.architectural_committee` and `.ipo` added
   - `STAGE2.WEEKLY_SPRINT.TIERS` (EASY/MEDIUM/HARD) added

3. **Update `backend/src/utils/achievements.js`** ✅
   - `minigame_success` trigger handled with `condition.gameType` check

4. **Update `backend/src/utils/progression.js`** ✅
   - `getEffectiveRecoveryIntervalSeconds` applies `senior_pajamas` ×1.05 recovery speed

5. **Update `backend/src/routes/tap.js`** ✅
   - `legacy_archaeologist` +20% commits when rank ≥ 3 and equipped
   - `heroically_fired` +10% tap boost for 24h after rank-up when equipped
   - Burnout count tracked in `inventory.burnout_count`; auto-unlock after 10

---

## Wave 2: Architectural Committee Mini-Game ✅

6. **Frontend `frontend/src/components/MiniGameArchitecturalCommittee.jsx`** ✅
   - 5 card choices, 3 scales (techDebt, teamMood, budget)
   - Success if all scales in [20, 80] after 5 choices
   - Score = 1 (success) or 0 (failure) sent to `/api/minigame/complete`

7. **MiniGameLauncher integration** ✅
   - Added to `GAMES` array with icon 🏛️
   - Component imported and rendered

8. **Backend achievement trigger** ✅
   - `checkAchievement(client, userId, 'minigame_success', { gameType })` called on success in `minigame.js`

---

## Wave 3: IPO Pitch Simulator Mini-Game ✅

9. **Frontend `frontend/src/components/MiniGameIPO.jsx`** ✅
   - 3 rounds with investor questions, 2 options each
   - 30-second timer per round; all correct answers required for success
   - Score = 1 (success) or 0 (failure)

10. **MiniGameLauncher integration** ✅
    - Added to `GAMES` array with icon 📈
    - Component imported and rendered

11. **Backend skin grant for IPO** ✅
    - `user_skins` row for `cto_cape` created on IPO success in `minigame.js`

---

## Wave 4: Weekly Sprint Quest ✅

12. **Backend utility `backend/src/utils/weeklySprint.js`** ✅
    - `getWeekStart`, `getWeeklySprintState`, `determineEligibleTier`, `canClaimTier`, `getTierReward`, `incrementSprintProgress`, `updateWeeklySprintState`

13. **Backend routes `backend/src/routes/quests.js`** ✅
    - `GET /api/quests/weekly` — returns sprint state + eligible tier
    - `POST /api/quests/weekly/claim` — claims highest eligible tier reward once per week

14. **Progress hooks** ✅
    - `tap.js`: increments `commitsEarned`
    - `quests.js` claim: increments `questsCompleted` + `commitsEarned`
    - `minigame.js`: increments `minigamesCompleted` + `commitsEarned` on success

15. **Frontend `frontend/src/components/WeeklySprintPanel.jsx`** ✅
    - Shows 3 tier cards with progress bars and claim buttons
    - Integrated into `App.jsx`

16. **State management** ✅
    - `useGameState.js` loads and refreshes `weeklySprint`; provides `claimWeeklySprintTier`

---

## Wave 5: Tests & Polish ✅

17. **Unit tests `backend/tests/phase9.unit.test.js`** ✅
    - 22 tests covering weekly sprint utilities, mini-game configs, skin definitions

18. **Frontend build verification** ✅
    - `npm run build` — zero errors, ~14s

19. **Backend test verification** ✅
    - `npm test` — 119 passed, 31 skipped, 0 failed

20. **Update `.planning/phases/09-advanced-content-endgame-skins/STATUS.md`** ✅

21. **Git commit** ⏳

---

## Verification Checklist

- [x] Architectural Committee: 5 cards, 3 scales, success if all in [20,80].
- [x] IPO: 3 rounds, timer, all correct required, awards `cto_cape` skin.
- [x] `senior_pajamas` auto-unlock at rank 5; +5% energy recovery when equipped.
- [x] `legacy_archaeologist` auto-unlock at rank 3; +20% commits when rank ≥ 3 and equipped.
- [x] `heroically_fired` unlock after 10 burnouts; +10% tap boost 24h after rank-up.
- [x] Weekly sprint: Easy/Medium/Hard tiers, claim once per week, auto-tracks progress.
- [x] Achievement "Архитектор" unlocks on Committee success.
- [x] All tests pass (22 new tests, 119 total passed).
- [x] No breaking changes to existing mini-games or daily quests.
