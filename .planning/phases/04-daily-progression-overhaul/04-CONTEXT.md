# Phase 4: Daily Progression Overhaul — CONTEXT.md

> Status: Context Gathered
> Requirements: PROG-01, PROG-05, PROG-06
> Date: 2026-05-21

---

## Requirements

### PROG-01: Ежедневные квесты (3 шт. + 1 бонусный)
- 3 регулярных квеста с автоматическим отслеживанием
- 1 бонусный квест (усложнённый, большая награда)
- Ежедневный сундук (full-clear бонус) за выполнение всех 3+1
- Автоматическое отслеживание прогресса без ручных действий

### PROG-05: Battle Pass 20 уровней, бесплатный трек, фронт-лоудинг первых 3 уровней
- 20 уровней с прогрессивной шкалой XP
- Бесплатный трек с наградами
- **Front-loading**: первые 3 уровня должны давать награды сразу (hook mechanic)
- Премиум трек с расширенными наградами

### PROG-06: Battle Pass опыт: квесты 60%, мини-игры 20%, соцдействия 20%
- 60% XP пасса от выполнения ежедневных квестов
- 20% от мини-игр (placeholder — мини-игры в Phase 6)
- 20% от социальных действий (шеринг, приглашения)
- Атрибуция источника XP для балансировки

---

## Current State

### Daily Quests — Two Parallel Systems

**System A: JSONB `daily_quests_state` (STAGE2, active)**
- 5 квестов ежедневно: 2 base (`q_login`, `q_tap40`) + 3 time-windowed (Morning/Afternoon/Evening)
- Хранится в `progression.daily_quests_state`
- API: `/api/quests` (GET/POST claim/POST full-clear)
- Frontend: `DailyQuests.jsx` (inline STAGE2 UI)
- Auto-tracking: `tap.js` обновляет прогресс при каждом тапе

**System B: DB `daily_quests` table (legacy, still called)**
- 5 типов: `tap_count`, `commit_count`, `login`, `spend_energy`, `invite_friend`
- `vnext.js`: `ensureDailyQuests`, `updateDailyQuestProgress`, `getDailyQuestSummary`
- `state.js` возвращает `daily` из этой таблицы
- Frontend: `DailyQuestsPanel.jsx` (old modal UI)

**Problem**: Both systems run in parallel. Frontend mounts both `DailyQuests` and `DailyQuestsPanel`, showing inconsistent data.

### Battle Pass — Two Parallel Systems

**System A: JSONB `pass_state` (STAGE2, active for `/api/pass`)**
- In-memory level calculation via `calculatePassLevel()`
- `addPassXp()` operates on JSONB state
- Route `/api/pass` uses this system
- Frontend `PassPanel.jsx` consumes `/api/pass`

**System B: DB relational (`sprint_passes`, `player_passes`, `pass_claims`)**
- `getPassStatus()`, `addDbPassXp()`, `claimPassReward()`
- `state.js` returns DB-version pass data
- Frontend `SprintPassPanel.jsx` consumes state.pass

**Problem**: Dual system split. `state.js` and `/api/pass` can return different level/xp values.

### Pass Rewards — Current Config

Only 4 reward levels (5, 10, 15, 20) for both free and premium tracks. Levels 1–3 have **zero rewards**.

### XP Sources — Current Split

| Source | Daily passXp | % of 6,850 total |
|--------|-------------|------------------|
| Daily quests | ~70–85 | ~30–37% |
| Streak | 5–50 | ~5–10% |
| Taps (level xp) | variable | ~50%+ |
| Team hackathon | 10–50 | occasional |

**No source attribution** — all XP goes into one bucket.

---

## Locked Decisions

- **D-01**: JSONB `daily_quests_state` becomes the single source of truth for quests. Legacy `daily_quests` table stays for migration safety but `state.js` stops returning it as primary daily data.
- **D-02**: DB relational pass system (`player_passes`) becomes the single source of truth. JSONB `pass_state` in `progression` is deprecated (read-only fallback for one release).
- **D-03**: Pass front-loading: add free rewards at levels 1, 2, 3 (small but visible: energy, stars, small commit boost).
- **D-04**: XP attribution tracked via new `pass_xp_log` table (user_id, pass_id, source, amount, created_at) rather than columns on `player_passes`.
- **D-05**: Mini-games 20% XP is a **placeholder** — create the table + hook now, actual sources in Phase 6.
- **D-06**: Social 20% XP sources: meme share, successful referral bind, team invite accepted.
- **D-07**: Quest redesign: 3 regular (login, taps, commits) + 1 bonus (random from pool with higher target and reward).
- **D-08**: Frontend unification: `DailyQuestsPanel.jsx` removed, `DailyQuests.jsx` becomes the single quest UI (both inline and modal modes via prop).

---

## Scope Fences

- **IN**: Quest count redesign (5→3+1), pass front-loading (levels 1–3 rewards), XP attribution table + hooks, frontend UI unification.
- **OUT**: New mini-games (Phase 6), new social features beyond XP hooks, premium pass pricing changes, season rotation logic.
- **NO**: Dropping legacy `daily_quests` table entirely (migration safety — keep table, stop using).
- **NO**: Rewriting pass level calculation algorithm (keep current XP curve).

---

## Known Risks

1. **Data migration**: Switching `state.js` from DB-version to JSONB-version daily/pass may break `DailyQuestsPanel.jsx` and `SprintPassPanel.jsx` until frontend unified.
2. **XP attribution accuracy**: 60/20/20 split is a target, not a hard cap. Players may exceed 100% if they grind heavily.
3. **Mini-game placeholder**: The 20% mini-game bucket will be empty until Phase 6. Need UI copy explaining "coming soon".
4. **PassPanel claim missing**: `PassPanel.jsx` is display-only. Players must open modal to claim. This is acceptable for MVP but noted.
