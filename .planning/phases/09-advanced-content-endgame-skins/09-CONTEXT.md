# Phase 9: Advanced Content & Endgame Skins — CONTEXT.md

> Status: Locked decisions for planning
> Requirements: MINI-04, MINI-05, VISU-04, VISU-06, VISU-07, PROG-02
> Date: 2026-05-22

---

## Requirements

### MINI-04: Мини-игра «Архитектурный комитет»
- Карточный выбор, Reigns-like, 3 шкалы (техдолг, команда, бюджет)
- Награда: +500 коммитов, –40 депрессии, ачивка
- Частота: раз в день; уровень 8

### MINI-05: Мини-игра «IPO»
- Симуляция питча, 3 раунда, >80% уверенности
- Награда: +1000 коммитов, –50 депрессии, скин «CTO»
- Частота: раз в неделю; уровень 10

### VISU-04: Скин «Пижама сеньора»
- +5% восстановление энергии
- Условие: уровень 5

### VISU-06: Скин «Legacy-археолог»
- +20% коммитов в зоне Legacy
- Условие: 10 входов в Legacy zone

### VISU-07: Скин «Уволенный героически»
- +10% к тапу на следующем уровне
- Условие: 10 Game Over

### PROG-02: Еженедельный спринт
- Лёгкий / средний / хард с прогрессивными наградами

---

## Locked Decisions

### Mini-Games
1. **Architectural Committee (MINI-04)**:
   - 5 card choices, each affects 3 scales (techDebt, teamMood, budget) by ±15.
   - Scales start at 50. Range 0–100. Success = all scales remain within 20–80 after 5 choices.
   - Frontend tracks scales and enforces rules. Server validates final state plausibility (all scale values must be reachable from 50 with 5 steps of ±15).
   - Score: 1 = success, 0 = failure. `maxScore: 1`, `minSuccessScore: 1`.
   - Achievement trigger: `minigame_success` with payload `{ gameType: 'architectural_committee' }`.

2. **IPO Pitch Simulator (MINI-05)**:
   - 3 rounds, each round presents a business/tech scenario with 3 pitch options.
   - Confidence score per round: +33% for best answer, +10% for okay, -20% for bad.
   - Success = total confidence ≥ 80% after 3 rounds.
   - Score: 1 = success, 0 = failure. `maxScore: 1`, `minSuccessScore: 1`.
   - Reward includes `skin: 'cto_cape'` (inserted into `user_skins` on success).

### Skin Bonuses (MVP Implementation)
3. **Generic approach**: No new DB columns. Each bonus is applied ad-hoc by querying `user_skins WHERE equipped = true AND skin_id = '...'` at the relevant game loop point. This mirrors the `team_lead` pattern in `dailySummary.js`.

4. **«Пижама сеньора» (+5% energy recovery)**:
   - Applied in `backend/src/utils/progression.js` `getEffectiveRecoveryIntervalSeconds()`.
   - If equipped, multiply recovery speed by 1.05 (i.e., interval seconds ÷ 1.05).
   - Unlock: auto-granted when player reaches rank level 5 (handled in `ensurePlayerLevel` or rank-up route).

5. **«Legacy-археолог» (+20% commits in Legacy zone)**:
   - "Legacy zone" = rank ≥ 3 (Senior) for MVP. No separate zone mechanic exists.
   - Applied in `backend/src/routes/tap.js`: if equipped AND rank ≥ 3, multiply `commitsDelta` by 1.2.
   - Unlock: achievement trigger on 10th `rank_up` to rank ≥ 3. But since rank_up happens once per rank, we instead track `legacy_zone_visits` in `progression.inventory` or `player_levels` metadata. Simpler: unlock on first `rank_up` to rank 3 (one-time) for MVP, with comment that full "10 visits" requires a Legacy zone mechanic deferred to Phase 10+.
   - **Decision**: For MVP, unlock immediately upon reaching rank 3. The "10 visits" condition is deferred because Legacy zone doesn't exist yet.

6. **«Уволенный героически» (+10% tap on next level)**:
   - "Game Over" = depression reaching 100% (burnout) for MVP. No permadeath mechanic exists.
   - Applied in `backend/src/routes/tap.js`: after rank-up, if skin equipped, apply +10% tap boost via `active_effects` for 24h.
   - Unlock: achievement trigger on 10th burnout (`depression_level >= 100`). Track `burnout_count` in `progression.inventory`.

### Weekly Sprint Quest (PROG-02)
7. **3 tiers per week**: Easy / Medium / Hard.
8. **Stored in `progression.weekly_quests_state` JSONB** — `weekId`, `tier`, `progress`, `completed`, `claimed`.
9. **Targets** (configurable in `balance.js`):
   - Easy: 500 commits, 3 daily quests completed
   - Medium: 1500 commits, 5 daily quests completed, 1 mini-game played
   - Hard: 3000 commits, 7 daily quests completed, 2 mini-games played, 1 meme shared
10. **Rewards**:
    - Easy: energy 30, xp 20
    - Medium: energy 50, xp 40, skinFragment 'sprint_contender'
    - Hard: energy 100, xp 80, skinFragment 'sprint_hero', title 'sprint_master'
11. **Auto-progress**: Hooks in `tap.js` (commits), `quests.js` (daily quest complete), `minigame.js` (play), `meme.js` (share).
12. **Frontend**: New panel `WeeklySprintPanel.jsx`, button in StatsBar.

### Scope Fences
- **IN**: 2 new mini-games, 3 new skins with MVP bonuses, weekly sprint quest system, achievement for MINI-04.
- **OUT**: Full Legacy zone gameplay (deferred), permadeath/Game Over mechanic (deferred), generic skin bonus framework.
- **NO**: Phaser scenes for mini-games.
- **NO**: Changing `skin_definitions` schema.

---

## Reusable Assets

| Asset | Location | How to reuse |
|-------|----------|-------------|
| Mini-game engine | `backend/src/routes/minigame.js`, `backend/src/utils/minigame.js` | Add config entries for `architectural_committee` and `ipo` |
| Achievement engine | `backend/src/utils/achievements.js` | Add `minigame_success` trigger case |
| Active effects | `backend/src/utils/activeEffects.js` | Grant temporary tap boost for Heroically Fired skin |
| Energy recovery | `backend/src/utils/progression.js` | Add skin multiplier check |
| Tap logic | `backend/src/routes/tap.js` | Add skin commit multiplier checks |
| Quest engine | `backend/src/utils/dailyQuests.js` | Extend with weekly quest tracking hooks |
| Skin grant | `user_skins` INSERT pattern | Reuse for CTO skin and auto-unlock skins |

---

## Files to Create

| File | Description |
|------|-------------|
| `backend/migrations/031_phase9_skins_and_achievements.sql` | Seed `cto_cape`, `senior_pajamas`, `legacy_archaeologist`, `heroically_fired` skins + new achievement |
| `frontend/src/components/MiniGameArchitecturalCommittee.jsx` | Reigns-like card choice UI |
| `frontend/src/components/MiniGameIPO.jsx` | 3-round pitch simulator UI |
| `frontend/src/components/WeeklySprintPanel.jsx` | Weekly quest tier selection & progress |
| `backend/src/utils/weeklyQuests.js` | Weekly quest generation, progress checking, reward application |
| `backend/tests/phase9.unit.test.js` | Tests for mini-game validation, skin bonus math, weekly quest logic |

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/config/balance.js` | Add 2 mini-games, 4 skins, weekly sprint config |
| `backend/src/routes/minigame.js` | Achievement trigger on success; skin grant for IPO |
| `backend/src/utils/achievements.js` | Add `minigame_success` trigger; add new achievements |
| `backend/src/utils/progression.js` | Energy recovery skin bonus (+5% for senior_pajamas) |
| `backend/src/routes/tap.js` | Commit multiplier for legacy_archaeologist; tap boost trigger for heroically_fired |
| `backend/src/routes/quests.js` | Add weekly sprint endpoints; hook daily quest completion |
| `frontend/src/components/MiniGameLauncher.jsx` | Add 2 new games |
| `frontend/src/components/StatsBar.jsx` | Add Weekly Sprint button |
| `backend/src/index.js` | Register weekly quest routes if needed |
