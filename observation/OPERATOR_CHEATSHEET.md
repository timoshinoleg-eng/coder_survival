# Coder Survival — Operator Observation Cheat Sheet

Quick reference for live economy monitoring. No backend code changes required.

---

## 30-Second Health Check

```powershell
# Full economy snapshot (last 7 days)
pwsh -File scripts/observe-economy.ps1

# Specific window
pwsh -File scripts/observe-economy.ps1 -Days 14

# Raw JSON for parsing
pwsh -File scripts/observe-economy.ps1 -Days 7 -RawJson
```

---

## What to Watch Before the Next Balance Pass

| Metric | Good Sign | Warning Sign | SQL File |
|--------|-----------|--------------|----------|
| **DAU trend** | Stable or growing | Drop > 20% week-over-week | `01_dau_retention.sql` |
| **D1 retention** | > 30% | < 15% | `01_dau_retention.sql` |
| **Quest full-clear** | > 40% daily | < 20% | `02_daily_quests.sql` |
| **Offer dismiss rate** | < 60% | > 80% | `03_context_offers.sql` |
| **Offer completed CTR** | > 5% | < 1% | `03_context_offers.sql` |
| **Hackathon completion** | > 25% at target 650 | < 10% | `04_weekly_hackathon.sql` |
| **Pass premium conversion** | > 5% | < 2% | `05_sprint_pass.sql` |
| **Shop completion rate** | > 70% | < 50% | `06_shop_purchases.sql` |
| **Avg energy** | > 50 | < 30 | `07_economy_health.sql` |
| **High-stress users** | < 15% | > 30% | `07_economy_health.sql` |

---

## Common Checks

### Check if the weekly hackathon target is too hard

```sql
-- From 04_weekly_hackathon.sql
-- Look at the commit distribution buckets.
-- If most users are in `under_25_pct`, the target is likely too high.
```

### Check if sprint pass XP curve is too steep

```sql
-- From 05_sprint_pass.sql
-- Look at level distribution.
-- If > 50% of players are stuck at level 1-3 after 7 days, the early curve may be too steep.
```

### Check if shop prices scare users away

```sql
-- From 06_shop_purchases.sql
-- High `pending` count + low `completed` count = friction in payment flow.
-- Also check `03_context_offers.sql` for offer-to-purchase proxy CTR.
```

---

## Paths at a Glance

| Path | Speed | Depth | Skill needed |
|------|-------|-------|--------------|
| `observe-economy.ps1` | 10 seconds | Aggregate only | PowerShell |
| Manual SQL | 2–5 minutes per query | Full control | SQL / psql |

---

## Safety Rules

- All SQL files are `SELECT`-only.
- `observe-economy.ps1` is read-only (it calls a `GET` endpoint).
- Never run ad-hoc `UPDATE` / `DELETE` on production without a separate approved change.
