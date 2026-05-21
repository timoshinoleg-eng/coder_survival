# Phase 4: Daily Progression Overhaul — PLAN.md

> Status: Draft → Ready for review
> Requirements: PROG-01, PROG-05, PROG-06
> Context: 04-CONTEXT.md, 04-DISCUSSION-LOG.md

---

## Goal
Unify the dual quest and pass systems, redesign daily quests to 3+1, front-load Battle Pass rewards, and establish XP source attribution.

---

## Architecture

```
Before (dual system):
  daily_quests table  ←→  daily_quests_state JSONB
  pass_state JSONB    ←→  player_passes DB

After (unified):
  daily_quests_state JSONB  ← SSOT
  player_passes DB          ← SSOT
  pass_xp_log DB            ← new attribution ledger
```

---

## Work Breakdown

### W1: Unify Quest System (3+1 Redesign)

#### 1.1 Redesign quest generation (`backend/src/utils/dailyQuests.js`)
- Change from 5 quests (2 base + 3 time-windowed) to **3 regular + 1 bonus**:
  - Regular 1: `login` — automatic on state load
  - Regular 2: `tap_count` — target 50 (+rankTier*5)
  - Regular 3: `commit_count` — target 100 (+rankTier*5)
  - Bonus: random from existing POOL with **2x target and 2x reward**
- Remove time-window logic (Morning/Afternoon/Evening) from generation.
- Keep `windowStart`/`windowEnd` fields optional for future reuse.
- Update `checkQuestProgress` to handle the new types cleanly.

#### 1.2 Update `backend/src/config/balance.js`
- `DAILY_QUEST.BASE_QUESTS`: reduce to 3 entries (login, tap, commit).
- `DAILY_QUEST.POOLS.BONUS`: new pool with 3 harder quests (tap 200, crit 20, commit 500).
- Reward scaling: bonus quest gives 2x passXp and 2x energy.

#### 1.3 Unify `state.js` daily response
- In `state.js`, replace `getDailyQuestSummary(client, userId)` (DB table) with `getDailyQuestState(client, userId)` that reads `progression.daily_quests_state`.
- Return consistent shape matching what `/api/quests` returns.
- Keep old `getDailyQuestSummary` export for safety (mark `@deprecated`).

#### 1.4 Frontend: unify quest UI
- **Remove** `frontend/src/components/DailyQuestsPanel.jsx`.
- **Enhance** `frontend/src/components/DailyQuests.jsx`:
  - Accept `modal` prop. When `modal=true`, render inside a `.pixel-panel` modal overlay (reuse existing modal pattern).
  - Show 3 regular quests + 1 bonus quest with distinct styling (bonus gets gold border/accent).
  - Full-clear chest button: show locked state if not all 4 completed.
  - Pixel-art styling: `.pixel-panel`, `.pixel-button`, `.pixel-text`.
- Update `StatsBar.jsx`: quest button opens `DailyQuests` in modal mode.
- Update `App.jsx`: remove any `DailyQuestsPanel` references.

#### 1.5 Auto-tracking verification
- Verify `tap.js` still calls `updateDailyQuestProgress` correctly for new 3+1 structure.
- Ensure `commit_count` auto-tracks on tap (it already reads `commits_total`).

---

### W2: Pass Front-Loading & Single Source of Truth

#### 2.1 Add front-load rewards (`backend/src/config/balance.js`)
- `PASS.FREE_REWARDS`:
  - Level 1: `{ energy: 25 }`
  - Level 2: `{ stars: 5 }`
  - Level 3: `{ commitBoostPercent: 5, durationHours: 24 }`
  - Keep existing 5, 10, 15, 20 rewards
- `PASS.PREMIUM_REWARDS`:
  - Level 1: `{ energy: 50, stars: 10 }`
  - Level 2: `{ stars: 15, skinFragment: 1 }`
  - Level 3: `{ commitBoostPercent: 10, durationHours: 24 }`
  - Keep existing 5, 10, 15, 20 rewards

#### 2.2 Seed new rewards into DB
- Migration `024_pass_frontload_rewards.sql`:
  - Insert rows into `pass_rewards` for levels 1–3 (if not exist) for current active `sprint_passes`.
  - Use `ON CONFLICT (pass_id, level) DO UPDATE` to safely add/modify.

#### 2.3 Unify pass state in `state.js`
- Replace JSONB `pass_state` usage in `state.js` with DB `getPassStatus()` result.
- Stop returning `pass` from `progression.pass_state`.
- Return DB-version `pass` consistently.

#### 2.4 Deprecate JSONB pass route
- In `backend/src/routes/pass.js`, rewrite `GET /api/pass` to call `getPassStatus(client, userId)` instead of reading JSONB.
- Rewrite `POST /api/pass/claim/:level` to use `claimPassReward()` from `pass.js`.
- Add `console.warn` if JSONB `pass_state` still exists in DB (migration hint).

#### 2.5 Frontend: fix SprintPassPanel
- Replace `window.location.reload()` with state refresh (`refreshPass()` from `useGameState`).
- Ensure `PassPanel.jsx` and `SprintPassPanel.jsx` both consume the same normalized shape.
- Add pixel-art styling to claim buttons.

---

### W3: XP Attribution

#### 3.1 Create `pass_xp_log` table
- Migration `025_pass_xp_log.sql`:
```sql
CREATE TABLE pass_xp_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pass_id INTEGER NOT NULL REFERENCES sprint_passes(id) ON DELETE CASCADE,
  source VARCHAR(16) NOT NULL CHECK (source IN ('quest','minigame','social','tap','other')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  context JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_pass_xp_log_user ON pass_xp_log(user_id, pass_id, created_at DESC);
CREATE INDEX idx_pass_xp_log_source ON pass_xp_log(source, created_at DESC);
```

#### 3.2 Add logging helper
- `backend/src/utils/passXpLog.js`:
```js
export async function logPassXp(client, userId, passId, source, amount, context = null)
```

#### 3.3 Hook quest XP (`backend/src/routes/quests.js`)
- When quest is claimed and gives passXp, call `logPassXp(client, userId, pass.id, 'quest', passXp, { questId })`.

#### 3.4 Hook tap XP (`backend/src/routes/tap.js`)
- Where `addDbPassXp` is called (or where pass XP would be added), also call `logPassXp` with source `'tap'`.
- If tap does not currently add pass XP directly, add a small amount (e.g., 1 passXp per 10 taps) to align with 60/20/20 split math.

#### 3.5 Hook social XP
- Meme share (`backend/src/routes/meme.js` POST /share): log source `'social'`, amount 15.
- Referral bind (`backend/src/utils/referral.js`): log source `'social'`, amount 25.
- Team invite accepted: log source `'social'`, amount 10.

#### 3.6 Mini-game placeholder
- `backend/src/utils/passXpLog.js`: add helper `getMiniGameXpPlaceholder()` returning 0 with comment "Phase 6: replace with real mini-game XP".
- No DB writes for mini-games yet.

#### 3.7 Attribution summary endpoint
- `GET /api/pass/xp-sources` — returns aggregated XP by source for current pass:
```json
{ "quest": 2450, "social": 820, "minigame": 0, "tap": 1200, "other": 0 }
```
- Frontend `SprintPassPanel.jsx`: show a small bar chart or list of sources.

---

### W4: Polish, Tests & Cleanup

#### 4.1 Remove dead code
- Delete `frontend/src/components/DailyQuestsPanel.jsx`.
- Remove `pass_state` JSONB reads from `state.js` (keep column in DB).
- Remove old `daily_quests` table reads from `state.js` (keep table in DB).

#### 4.2 Add backend tests
- `backend/tests/phase4.unit.test.js`:
  - `generateDailyQuests` returns 4 quests (3 regular + 1 bonus)
  - Bonus quest has 2x target of its base pool quest
  - `checkQuestProgress` updates tap/commit/login correctly
  - `logPassXp` writes to `pass_xp_log`
  - `getPassStatus` includes levels 1–3 rewards

#### 4.3 Add integration tests (if DB available)
- `POST /api/quests/claim` logs quest XP source
- `POST /api/meme/share` logs social XP source
- `GET /api/pass` returns unified DB-version data

#### 4.4 Frontend build verification
- `npm run build` in frontend — 0 errors.
- Visual smoke: open DailyQuests modal, see 4 quests + bonus styling.
- Visual smoke: open SprintPassPanel, see levels 1–3 with rewards.

#### 4.5 Balance audit
- Verify total quest passXp per day ≈ 60% of pass level-up needs:
  - 3 regular × ~25 passXp = 75
  - 1 bonus × ~50 passXp = 50
  - Total = 125/day
  - 30-day season = 3,750
  - Total pass XP needed = ~6,850
  - 3,750 / 6,850 = **55%** — close enough, social + tap fill remainder.

---

## Files to Create

| File | Description |
|------|-------------|
| `backend/migrations/024_pass_frontload_rewards.sql` | Insert levels 1–3 rewards into pass_rewards |
| `backend/migrations/025_pass_xp_log.sql` | XP attribution ledger |
| `backend/src/utils/passXpLog.js` | Helper to write XP sources |
| `backend/tests/phase4.unit.test.js` | Unit tests for quest redesign, XP logging |

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/config/balance.js` | Redesign DAILY_QUEST (3+1), add PASS front-load rewards |
| `backend/src/utils/dailyQuests.js` | 3+1 generation, bonus logic |
| `backend/src/routes/quests.js` | Log quest XP source on claim |
| `backend/src/routes/tap.js` | Log tap XP source |
| `backend/src/routes/state.js` | Unify daily + pass to DB/JSONB SSOT |
| `backend/src/routes/pass.js` | Use DB `getPassStatus` instead of JSONB |
| `backend/src/routes/meme.js` | Log social XP on share |
| `backend/src/utils/referral.js` | Log social XP on bind |
| `frontend/src/components/DailyQuests.jsx` | Modal mode, bonus styling, pixel-art |
| `frontend/src/components/SprintPassPanel.jsx` | Fix reload bug, add XP source display |
| `frontend/src/components/StatsBar.jsx` | Wire quest button to modal DailyQuests |
| `frontend/src/App.jsx` | Remove DailyQuestsPanel references |

## Verification

- [ ] `npm test` backend — all existing tests pass + new phase4 tests pass.
- [ ] `npm run build` frontend — 0 errors.
- [ ] `generateDailyQuests` returns exactly 4 quests.
- [ ] Bonus quest target = 2× base pool target.
- [ ] `state.js` no longer returns mismatched daily/pass data.
- [ ] Pass rewards exist for levels 1, 2, 3 in DB.
- [ ] `pass_xp_log` receives entries on quest claim, tap, meme share, referral bind.
- [ ] `GET /api/pass/xp-sources` returns correct aggregates.
- [ ] Frontend: DailyQuests modal shows 4 quests with distinct bonus styling.
- [ ] Frontend: SprintPassPanel shows levels 1–3 rewards and XP source breakdown.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Dual-system removal breaks legacy clients | Keep DB tables/columns, only stop returning them in API. One-release deprecation. |
| Front-load rewards unbalance economy | Small rewards (energy 25, 5 stars, 5% boost). Not game-breaking. |
| XP attribution overhead | `pass_xp_log` is append-only, indexed. Writes are async (fire-and-forget where possible). |
| Bonus quest too hard for new players | Target scales with rankTier: `base + rankTier * 5`. Low-tier players get easier targets. |

## Estimation

- W1: Quest redesign + frontend unification — ~3h
- W2: Pass front-loading + SSOT unification — ~2.5h
- W3: XP attribution table + hooks — ~2h
- W4: Tests, cleanup, polish — ~2h
- **Total: ~9.5h**
