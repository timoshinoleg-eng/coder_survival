# Phase 4: Daily Progression Overhaul — DISCUSSION-LOG.md

> Date: 2026-05-21
> Method: Codebase research + context synthesis (no live discuss-phase; research agent performed deep analysis)

---

## Research Areas Covered

### 1. Daily Quests Architecture
- Explored `backend/src/utils/dailyQuests.js`, `routes/quests.js`, `config/balance.js`
- Found dual system: JSONB `daily_quests_state` (STAGE2, active) vs DB `daily_quests` table (legacy)
- `state.js` returns DB-version; `/api/quests` uses JSONB-version
- Frontend mounts both `DailyQuests.jsx` (STAGE2) and `DailyQuestsPanel.jsx` (legacy)

**Decision**: JSONB becomes SSOT. Legacy table stays for safety but frontend unified to single component.

### 2. Battle Pass Architecture
- Explored `backend/src/utils/pass.js` — dual JSONB + DB implementation
- `state.js` uses DB relational (`player_passes`); `/api/pass` uses JSONB `pass_state`
- Only 4 reward levels (5,10,15,20). Levels 1–3 empty.

**Decision**: DB relational becomes SSOT. Add front-load rewards at levels 1–3.

### 3. XP Attribution Analysis
- Current quest passXp: ~70–85/day = ~30–37% of 6,850 total
- No source tracking exists
- Mini-games don't exist yet (Phase 6)

**Decision**: Create `pass_xp_log` table. Hook tap.js, quests.js, social actions. Mini-game bucket is placeholder.

### 4. Frontend UI Audit
- `PassPanel.jsx`: display-only, no claim
- `SprintPassPanel.jsx`: has claim but calls `window.location.reload()`
- `DailyQuests.jsx`: STAGE2 inline UI, works well
- `DailyQuestsPanel.jsx`: legacy modal, data shape mismatch

**Decision**: Remove `DailyQuestsPanel.jsx`, enhance `DailyQuests.jsx` to support modal mode. Fix SprintPassPanel reload bug.

---

## Questions Asked & Answered

| # | Question | Answer |
|---|----------|--------|
| 1 | Which quest system is the future? | JSONB `daily_quests_state` — it has time windows, auto-tracking, full-clear |
| 2 | Which pass system is the future? | DB relational — it has audit logs, claims table, premium unlock |
| 3 | Can we drop legacy tables? | No — migration safety. Stop using them, keep for rollback |
| 4 | How to track 60/20/20 split? | `pass_xp_log` table with source column. Target, not hard cap |
| 5 | What rewards for front-loading? | Level 1: energy 25; Level 2: 5 stars; Level 3: +5% commit boost (24h) |
| 6 | What are the 3+1 quests? | Login, Tap 50, Commit 100 + Bonus: random pool (higher target, 2x reward) |

---

## Decisions Locked

- D-01 through D-08 documented in 04-CONTEXT.md
- All 8 decisions unanimous (single-agent research, no conflicts)
