# Weekly Balance Review — [DATE RANGE]

## How to Run

1. **Quick:** `.\scripts\observe-economy.ps1 -Days 7` (live snapshot via API)
2. **Deep:** Run SQL queries from `WEEKLY_REVIEW_TEMPLATE.sql` against production PostgreSQL
3. **Fill metrics** in the tables below with query results

```powershell
# Quick snapshot
pwsh -File scripts/observe-economy.ps1 -Days 7

# Or connect to DB directly
psql -h <host> -U <user> -d <database> -f observation/WEEKLY_REVIEW_TEMPLATE.sql
```

---

## Metrics Dashboard

### Retention & Engagement

| Metric | This Week | Last Week | Delta | Target |
|--------|-----------|-----------|-------|--------|
| DAU (avg) | | | | |
| D1 Retention | | | | >30% |
| D7 Retention | | | | >15% |
| Sticky Factor (%) | | | | |
| Avg Session Length | | | | |
| Avg Taps per Session | | | | |

### Economy

| Metric | This Week | Last Week | Delta | Threshold |
|--------|-----------|-----------|-------|-----------|
| Avg Energy at Session End | | | | >50 |
| Avg Depression Level | | | | <55 |
| High-Stress Users (%) | | | | <15% |
| Energy Starvation Rate | | | | <20% |
| Generator Purchase Rate | | | | |

### Monetization

| Metric | This Week | Last Week | Delta | Target |
|--------|-----------|-----------|-------|--------|
| Shop Purchase Funnel (pending→completed) | | | | |
| Purchase Intent to Confirm | | | | >70% |
| Revenue (Stars) | | | | |
| Paying Users | | | | |
| Avg Purchases per Paying User | | | | |
| Median Lifetime Stars | | | | |
| Premium Pass Adoption (%) | | | | >5% |

### Offers

| Metric | This Week | Last Week | Delta | Target |
|--------|-----------|-----------|-------|--------|
| Offer Impressions (total) | | | | |
| Unique Users Reached | | | | |
| Dismiss Rate (%) | | | | <60% |
| Proxy CTR (impression→purchase) | | | | >5% |
| Avg Impressions per User per Day | | | | |

### Quests & Pass

| Metric | This Week | Last Week | Delta | Target |
|--------|-----------|-----------|-------|--------|
| Daily Full-Clear Rate | | | | >40% |
| Quest Completion by Type | | | | |
| Avg Minutes to Claim | | | | |
| Bottleneck Quest | | | | |
| Sprint Pass Level Distribution | | | | |
| Premium Pass Conversion (%) | | | | >5% |

### Events & Social

| Metric | This Week | Last Week | Delta | Target |
|--------|-----------|-----------|-------|--------|
| Hackathon Participation Rate | | | | |
| Hackathon Completion Rate | | | | >25% at target |
| Avg Commits per Participant | | | | |
| Drop-off Rate (stalled users) | | | | |
| Team Battle Participation | | | | |
| Referral: Reached 3+ Friends (%) | | | | |
| Meme Shares per Day | | | | |

---

## Red Flags Checklist

- [ ] Burnout rate > 5%
- [ ] Energy starvation > 20%
- [ ] High-stress users > 30%
- [ ] Offer CTR < 3%
- [ ] Offer dismiss rate > 80%
- [ ] Daily full-clear < 20%
- [ ] Premium conversion < 2%
- [ ] D1 retention < 15%
- [ ] Shop completion rate < 50%
- [ ] Hackathon completion < 10%
- [ ] Sprint pass: >50% stuck at level 1–3 after 7 days

---

## SQL Quick Reference

All consolidated queries live in `WEEKLY_REVIEW_TEMPLATE.sql`. Sections:

| # | Section | Source SQL |
|---|---------|-----------|
| 1 | Retention & Engagement | `01_dau_retention.sql` |
| 2 | Economy Health | `07_economy_health.sql`, `08_stress_cohort_ab.sql` |
| 3 | Monetization | `06_shop_purchases.sql` |
| 4 | Offers | `03_context_offers.sql` |
| 5 | Quests & Pass | `02_daily_quests.sql`, `05_sprint_pass.sql` |
| 6 | Events & Social | `04_weekly_hackathon.sql`, `09_phase2_metrics.sql` |

---

## Operator Notes

[Space for weekly observations, hypothesis, and balance decisions]

---

## Archive

| Week | Key Findings | Action Taken |
|------|-------------|--------------|
| | | |
| | | |
| | | |
