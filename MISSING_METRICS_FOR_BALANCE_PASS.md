# Missing Metrics for Next Balance Pass

**Audit date:** 2026-05-07  
**Scope:** current repo only — backend tables, routes, audit logs, analytics layer.  
**Constraint:** no code changes, only gap analysis + minimal future plan.

---

## 1. What HANDOFF.md Explicitly Requests

| Metric | Needed for | Can be derived today? | Blocker |
|--------|-----------|----------------------|---------|
| Context offer CTR / dismiss rate | Tuning thresholds & cooldowns | **No** | No impressions logged |
| Hackathon completion rate at 650 | Validating target difficulty | Partial (claimed %) | No progression curve over time |
| Sprint pass completion pacing vs 915 XP | Validating XP curve | Partial (current level snapshot) | No historical XP/level tracking |
| Daily quest full-clear rate after 40/80/login | Validating quest tuning | **Yes** (from `daily_quests`) | — |

---

## 2. Missing Metrics by System

### 2.1 Context Offers — Critical Gap

**What exists:**
- `offer_cooldowns` table: `user_id`, `offer_type`, `last_dismissed_at`
- `audit_logs`: `offer_dismiss` action

**What is missing:**
- **Offer impressions** — when `getContextOffer` returns a non-null offer to the user (in `/api/state` or `/api/tap`). Without this, CTR = clicks / impressions is impossible.
- **Offer actions** — click on "Зарядиться"/"Дожать"/"Сбросить стресс" in `ContextOfferBanner`. Only `dismiss` is tracked.
- **Offer-to-purchase conversion** — whether a purchase originated from an offer vs organic shop open.

**Evidence:**
- `backend/src/utils/offers.js:63-67` — only `offer_dismiss` audit log.
- `frontend/src/components/ContextOfferBanner.jsx` — no analytics calls, no backend action log for clicks.

**Balance pass impact:** Cannot validate if `low_energy` at ≤25% actually drives purchases, or if users just dismiss.

---

### 2.2 Shop / Monetization — Critical Gap

**What exists:**
- `purchases` table: item_type, stars_amount, status, created_at
- `star_payments` table: completed payments
- `audit_logs`: `pass_premium_unlock`

**What is missing:**
- **Shop opens** — `POST /api/shop/products` is logged nowhere (no analytics, no audit).
- **Product views / category tabs** — frontend `ShopPanel` has tabs (energy/stress/boost/pass), but no event fires.
- **Buy clicks** — `startTelegramPurchase` in `frontend/src/utils/purchases.js` calls `/api/buy`, but no event logs the intent.
- **Payment funnel steps** — no log for: invoice opened → payment dialog shown → paid / cancelled / failed.
- **Purchase failures by reason** — `star_payments` only tracks successes; `purchases.status = 'pending'` may stay stale.

**Evidence:**
- `frontend/src/components/ShopPanel.jsx` — no analytics imports.
- `frontend/src/utils/purchases.js` — no tracking around `startTelegramPurchase`.
- `backend/src/routes/buy.js` — no audit log on purchase intent.

**Balance pass impact:** Cannot tell if shop prices (10/40/75/200⭐) are too high or if users never open shop.

---

### 2.3 Weekly Hackathon (Event) — Medium Gap

**What exists:**
- `events` + `event_contributions`: `commits_contributed`, `claimed` boolean
- `audit_logs`: `event_claim`

**What is missing:**
- **Daily progression snapshots** — only final `commits_contributed` is stored. No way to see: "Day 3 average progress = 180 commits".
- **Event panel opens** — no tracking of `EventPanel` views.
- **Drop-off by day** — cannot compute when users give up (e.g., reach 400 and stop).

**Evidence:**
- `backend/src/utils/events.js:36-51` — `recordEventContribution` increments total, no history table.
- `frontend/src/components/EventPanel.jsx` — no analytics.

**Balance pass impact:** Can compute completion %, but cannot diagnose *when* users stall or abandon.

---

### 2.4 Sprint Pass — Medium Gap

**What exists:**
- `player_passes`: `current_level`, `current_xp`, `is_premium`, `created_at`, `updated_at`
- `pass_claims`: `level`, `track`, `claimed_at`
- `audit_logs`: `pass_claim`, `pass_premium_unlock`

**What is missing:**
- **Historical XP/level snapshots** — `player_passes` is overwritten. Cannot reconstruct "on Day 7, average user was Level 5 with 120 XP".
- **Premium purchase timing** — `pass_premium_unlock` has audit log, but no correlation with current level at time of purchase.
- **Pass panel engagement** — no tracking of opens, track switches, unclaimed reward views.

**Evidence:**
- `backend/src/utils/pass.js` — `addPassXp` updates in place; no `player_pass_history` table.

**Balance pass impact:** Cannot validate if 915 XP curve is too steep or if users hit wall at Level 10.

---

### 2.5 Daily Quests — Small Gap

**What exists:**
- `daily_quests`: `quest_date`, `quest_type`, `target_value`, `progress_value`, `completed`, `claimed`
- Can compute full-clear rate per day

**What is missing:**
- **Completion timestamps** — `completed` flips to TRUE, but no `completed_at`. Cannot tell if tap quest finishes at 09:00 or 23:55.
- **Quest panel opens** — no tracking.
- **Claim timestamps** — `claimed` boolean only, no `claimed_at`.

**Evidence:**
- `backend/migrations/002_vnext_core.sql` — `daily_quests` schema has no timestamp columns.

**Balance pass impact:** Full-clear rate is computable; bottleneck timing is not.

---

### 2.6 Sessions / Engagement — Medium Gap

**What exists:**
- `sessions`: `session_id`, `user_id`, `started_at`, `ended_at`, `taps_count`, `commits_earned`
- `users`: `created_at`, `last_active`

**What is missing:**
- **`ended_at` is almost always NULL** — sessions are created in `/api/state`, but never explicitly ended. No cron or hook sets `ended_at`.
- **Session quality metrics** — no tracking of: time between taps, energy at session start/end, depression curve within session.
- **Retention materialized view** — D1/D7/D30 retention must be computed ad-hoc from `users.created_at` + `sessions.started_at`.

**Evidence:**
- `backend/src/routes/state.js:108-131` — session upsert logic; no session end mechanism.

**Balance pass impact:** Cannot compute true session length or play patterns that affect energy/depression economy.

---

### 2.7 Frontend Analytics — Critical Gap

**What exists:**
- `analytics/events.js` — full Amplitude SDK wrapper with event constants (TAP, PURCHASE_ATTEMPT, etc.).

**What is missing:**
- **Zero imports** — `analytics/events.js` is not imported by any frontend component.
- **No events are fired** — all `trackEvent` calls are dead code.

**Evidence:**
- `grep -r "analytics/events" frontend/src/` → no matches.
- `grep -r "trackEvent" frontend/src/` → no matches.

**Balance pass impact:** All user behavior analysis (funnels, engagement, feature adoption) is impossible without backend-only aggregates.

---

### 2.8 Tap-Level Economy — Intentionally Minimal

**What exists:**
- `sessions` aggregates taps per session.
- `audit_logs` explicitly avoids per-tap writes (HANDOFF.md mandate).

**What is missing:**
- Per-tap distribution of `commitsDelta` (e.g., how often users get 1 vs 5+ commits).
- Energy depletion curves per rank.
- Depression accumulation rate by play intensity.

**Balance pass impact:** Cannot fine-tune tap formula coefficients (`energyMultiplier`, `depressionPenalty`, `streakBonus`) without sampled tap events.

---

## 3. Summary Table — All Missing Metrics

| # | Metric | System | Priority | Can add without schema change? |
|---|--------|--------|----------|-------------------------------|
| 1 | Offer impressions | Context Offers | **Critical** | No (needs new table or analytics event) |
| 2 | Offer CTR (click/conversion) | Context Offers | **Critical** | No |
| 3 | Shop opens / product views | Shop | **Critical** | No (needs analytics or audit) |
| 4 | Buy-click funnel | Shop | **Critical** | No |
| 5 | Frontend analytics events | All | **Critical** | No (needs imports + calls) |
| 6 | Event daily progress snapshots | Weekly Hackathon | Medium | No (needs history table) |
| 7 | Pass XP/level history | Sprint Pass | Medium | No (needs history table) |
| 8 | Quest completion timestamps | Daily Quests | Low | No (needs `completed_at` column) |
| 9 | Session `ended_at` population | Sessions | Medium | Partial (needs frontend hook or timeout) |
| 10 | Retention materialized view | Users | Low | Yes (SQL view only) |
| 11 | Purchase intent audit log | Shop | Medium | Yes (add INSERT in `buy.js`) |
| 12 | Team audit logs | Teams | Low | Yes (add INSERT in `team.js`) |
| 13 | Sampled tap events | Tap Economy | Low | No (needs new table + sampling logic) |

---

## 4. Minimal Plan — What to Add Later

### Phase 1 (Before next balance pass — must-haves)

**Backend:**
1. **`offer_impressions` table** — log every time `getContextOffer` returns non-null (user_id, offer_type, created_at). This alone enables CTR and dismiss-rate calculations.
2. **Audit log for `POST /api/buy`** — log purchase intent with user_id, item_type, stars_amount.
3. **`daily_quests.completed_at` + `claimed_at` columns** — trivial migration, enables bottleneck analysis.

**Frontend:**
4. **Wire up `analytics/events.js`** — import in `useGameState` or `GameProvider` and fire events at minimum for:
   - `shop_open`
   - `offer_shown`
   - `offer_click` (buy or dismiss)
   - `purchase_attempt`
   - `quest_panel_open`
   - `event_panel_open`
   - `pass_panel_open`

### Phase 2 (After balance pass — pacing & depth)

**Backend:**
5. **`player_pass_history` table** — nightly snapshot of `player_passes` (user_id, level, xp, is_premium, snapshot_date). Enables pacing curves.
6. **`event_contribution_history` table** — nightly snapshot of `event_contributions` (user_id, commits_contributed, progress_percent, snapshot_date). Enables drop-off analysis.
7. **`session_ended_at` population** — add frontend `beforeunload` / `pagehide` hook to call `/api/session/end` or set `ended_at` via timeout heuristic.
8. **Retention SQL view** — materialized view for D1/D7/D30 retention by `users.created_at` cohort.

### Phase 3 (Advanced)

**Backend:**
9. **Sampled tap logging** — write 1% of taps to `tap_samples` (user_id, rank, energy, depression, streak, commits_delta, created_at). Enables formula tuning without hot-path amplification.
10. **Team health metrics** — audit logs for create/join/leave + `team_activity` monthly snapshot.

---

## 5. What *Is* Already Measurable Today

From existing tables alone, without any new code:

| Metric | Query approach |
|--------|---------------|
| Hackathon claimed % | `SELECT COUNT(*) FILTER (WHERE claimed) * 1.0 / COUNT(*) FROM event_contributions` |
| Sprint pass level distribution | `SELECT current_level, COUNT(*) FROM player_passes GROUP BY current_level` |
| Premium conversion % | `SELECT COUNT(*) FILTER (WHERE is_premium) * 1.0 / COUNT(*) FROM player_passes` |
| Daily quest full-clear rate | `SELECT quest_date, COUNT(*) FILTER (WHERE completed) / COUNT(DISTINCT user_id) FROM daily_quests GROUP BY quest_date` |
| Purchase completion rate | `SELECT status, COUNT(*) FROM purchases GROUP BY status` |
| DAU | `SELECT DATE(started_at), COUNT(DISTINCT user_id) FROM sessions GROUP BY DATE(started_at)` |
| D1 retention (ad-hoc) | `SELECT COUNT(DISTINCT s.user_id) / COUNT(DISTINCT u.id) FROM users u LEFT JOIN sessions s ON s.user_id = u.id AND DATE(s.started_at) = DATE(u.created_at) + INTERVAL '1 day' WHERE u.created_at >= CURRENT_DATE - INTERVAL '7 days'` |

These can be run immediately as SQL queries against production PostgreSQL.

---
*End of analysis. No code was changed.*
