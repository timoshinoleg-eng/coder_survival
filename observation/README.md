# Coder Survival — Live Observation

This directory contains **two observation paths** for the tuned economy. Both use existing tables only and require no schema changes.

---

## Path A — Operator Quick Snapshot (Recommended)

**Script:** `scripts/observe-economy.ps1`  
**Endpoint:** `GET /api/internal/observation/economy?days=N` (protected by `X-Bot-Backend-Secret`)  
**Use when:** you want a fast, human-readable aggregate report without writing SQL.

What it covers (parity with the 7 SQL slices below):

| API slice | Legacy view | Maps to SQL |
|-----------|-------------|-------------|
| `overview` | DAU, sessions, taps, commits, new users | `01_dau_retention.sql` |
| `retention` | D1 retention by cohort | `01_dau_retention.sql` |
| `quests` | Per-quest completion, full-clear rate, claim timing | `02_daily_quests.sql` |
| `offers` | Impressions, dismiss rate, proxy CTR | `03_context_offers.sql` |
| `event` | Weekly hackathon progress, completion % | `04_weekly_hackathon.sql` |
| `pass` | Sprint pass level distribution, premium conversion | `05_sprint_pass.sql` |
| `shop` | Purchase funnel, revenue per user | `06_shop_purchases.sql` |
| `health` (under `sqlSlices.economyHealth`) | One-stop economy snapshot | `07_economy_health.sql` |

Run:

```powershell
pwsh -File scripts/observe-economy.ps1 -Days 7
```

The script fetches the observation secret from the VM runtime and prints tab-separated output.

---

## Path B — Manual SQL Deep-Dive

**Location:** `observation/01..07_*.sql`  
**Use when:** you need to tweak filters, join additional tables, drill into edge cases, or validate the API aggregates manually.

### Files

| # | File | What it measures |
|---|------|------------------|
| 01 | `01_dau_retention.sql` | DAU by day, D1 retention cohorts, sticky factor |
| 02 | `02_daily_quests.sql` | Per-quest completion, full-clear rate, claim timing, bottleneck quest |
| 03 | `03_context_offers.sql` | Offer impressions, dismiss rate, proxy CTR, fatigue |
| 04 | `04_weekly_hackathon.sql` | Completion %, commit distribution, drop-off proxy |
| 05 | `05_sprint_pass.sql` | Level distribution, premium %, unclaimed rewards |
| 06 | `06_shop_purchases.sql` | Purchase funnel, revenue per user, completion rate |
| 07 | `07_economy_health.sql` | One-stop economy snapshot (energy, stress, ranks, DAU) |

### How to run

Connect to the managed PostgreSQL instance (YC console, DBeaver, or `psql` via VM) and paste query blocks one at a time.

### Data freshness

- `offer_impressions` is populated by migration `007_minimum_economy_instrumentation.sql`.
- `daily_quests.completed_at` / `claimed_at` are also from `007`.
- Some metrics are **proxies** (e.g., offer-to-purchase CTR uses a 10-minute window). A proper funnel requires frontend analytics or backend audit-log additions — see `MISSING_METRICS_FOR_BALANCE_PASS.md`.

### Safe to run

All queries are `SELECT`-only. They do not modify data.

---

## Parity Note

The backend API route (`internalObservation.js`) and the SQL pack were built to cover the **same 7 observation slices**. The API adds convenience views (legacy `overview`, `offers`, `shop`, `quests`, `pass`, `event`, `retention` objects) on top of the raw `sqlSlices` so that `observe-economy.ps1` can print a compact report.

If you ever see a discrepancy between the API output and manual SQL:
1. Trust the manual SQL first (it is the raw source).
2. Check `backend/src/routes/internalObservation.js` for any filter differences (e.g., the API uses `($1::int - 1) * INTERVAL '1 day'` while SQL uses `INTERVAL '7 days'` or `INTERVAL '14 days'`).

---

## Which path to choose?

| Need | Use |
|------|-----|
| Daily operator health check | `scripts/observe-economy.ps1` |
| Validate API numbers before a balance pass | Run both and diff |
| Drill into a specific user cohort or edge case | Manual SQL |
| Build a new metric not yet in the API | Start from SQL, then propose an API addition |
