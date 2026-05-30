# Weekly Balance Review Template

Шаблон еженедельного review для live economy / retention / monetization.

Использовать вместе с:
- `scripts/observe-economy.ps1`
- `observation/README.md`
- `HANDOFF.md`
- `ROADMAP.md`

---

## Review meta

- Period:
- Reviewer:
- Environment: production
- Report source:
  - [ ] `scripts/observe-economy.ps1`
  - [ ] SQL deep-dive from `observation/`
  - [ ] both

## 1. Executive summary

### What improved
- 

### What regressed
- 

### What needs tuning next
- 

Decision:
- [ ] keep current balance
- [ ] run small tuning pass
- [ ] investigate before changing anything

---

## 2. Topline health

| Metric | Current | Previous | Delta | Comment |
|---|---:|---:|---:|---|
| Total users |  |  |  |  |
| DAU today |  |  |  |  |
| DAU yesterday |  |  |  |  |
| Avg DAU in window |  |  |  |  |
| Sessions total |  |  |  |  |
| Taps total |  |  |  |  |
| Commits total |  |  |  |  |
| D1 retention |  |  |  |  |

Questions:
- DAU стабилен, растёт или шумит?
- Есть ли аномальное падение sticky / retention?

---

## 3. Offer funnel

### Summary by offer type

| Offer type | Impressions | Unique users | Dismiss rate | Intent rate | Completed purchase rate | Notes |
|---|---:|---:|---:|---:|---:|---|
| `low_energy` |  |  |  |  |  |  |
| `near_rank` |  |  |  |  |  |  |
| `high_stress` |  |  |  |  |  |  |

### Breakdown by source

| Offer type | Source | Impressions | Intent rate | Completed rate | Notes |
|---|---|---:|---:|---:|---|
| `low_energy` | `state` |  |  |  |  |
| `low_energy` | `tap` |  |  |  |  |
| `near_rank` | `state` |  |  |  |  |
| `near_rank` | `tap` |  |  |  |  |
| `high_stress` | `state` |  |  |  |  |
| `high_stress` | `tap` |  |  |  |  |

Questions:
- Какие offers реально двигают purchase intent?
- Есть ли fatigue по конкретному типу?
- Какой source даёт лучший CTR/conversion?

Decision:
- [ ] keep thresholds
- [ ] tune thresholds
- [ ] tune cooldowns
- [ ] rewrite copy only

---

## 4. Shop / purchase funnel

| Item type | Buy requests | Purchase rows | Completed purchases | Failed purchases | Payment records | Intent→Completed | Purchase→Completed | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `energy_refill` |  |  |  |  |  |  |  |  |
| `depression_cure` |  |  |  |  |  |  |  |  |
| `tier_boost` |  |  |  |  |  |  |  |  |
| `premium_pass` |  |  |  |  |  |  |  |  |

Coverage notes:
- Tracked steps:
- Missing steps:

Questions:
- Где biggest drop-off — на buy request, completion или payment record?
- Есть ли SKU с unusually weak conversion?
- Нужен ли post-purchase UX polish или pricing/bundle tuning?

Decision:
- [ ] keep prices
- [ ] test better offer placement
- [ ] improve purchase UX
- [ ] investigate failures/duplicates

---

## 5. Daily quests

| Metric | Current | Previous | Delta | Comment |
|---|---:|---:|---:|---|
| Users with any complete |  |  |  |  |
| Full clear rate |  |  |  |  |
| Full claim rate |  |  |  |  |
| Avg minutes to claim |  |  |  |  |
| Bottleneck quest |  |  |  |  |

Questions:
- Слишком ли тяжёлый `40 / 80 / login` набор?
- Есть ли claim friction после completion?
- Какой quest чаще всего последний?

Decision:
- [ ] keep daily targets
- [ ] lower targets
- [ ] increase clarity only
- [ ] investigate claim friction

---

## 6. Sprint pass

| Metric | Current | Previous | Delta | Comment |
|---|---:|---:|---:|---|
| Players in pass |  |  |  |  |
| Premium players |  |  |  |  |
| Premium conversion |  |  |  |  |
| Avg level |  |  |  |  |
| Avg XP |  |  |  |  |
| Most unclaimed level |  |  |  |  |

Questions:
- Кривая `915 XP` слишком длинная или нормальная?
- Есть ли проблема с unclaimed rewards?
- Premium value виден игроку или теряется в UI?

Decision:
- [ ] keep curve
- [ ] tune early levels
- [ ] tune late levels
- [ ] improve claim UX only

---

## 7. Weekly event

| Metric | Current | Previous | Delta | Comment |
|---|---:|---:|---:|---|
| Participants |  |  |  |  |
| Target reached |  |  |  |  |
| Claimed |  |  |  |  |
| Completion rate |  |  |  |  |
| Avg progress |  |  |  |  |

Questions:
- Достижим ли target `650` в реальной аудитории?
- Есть ли drop-off before completion?
- Нужно ли менять reward payload или только UI urgency?

Decision:
- [ ] keep event target
- [ ] lower target
- [ ] improve return hooks
- [ ] investigate participation drop-off

---

## 8. Economy health snapshot

| Metric | Current | Previous | Delta | Comment |
|---|---:|---:|---:|---|
| Avg energy |  |  |  |  |
| Median energy |  |  |  |  |
| Low-energy users |  |  |  |  |
| Avg stress |  |  |  |  |
| High-stress users |  |  |  |  |
| Avg commits total |  |  |  |  |

Questions:
- Игроки чаще страдают от нехватки энергии или от стресса?
- Не стало ли pain слишком навязчивым?
- Нет ли явного дисбаланса между free loop и monetized recovery?

---

## 9. Action items for next week

### Keep
- 

### Tune
- 

### Investigate
- 

### Blockers / risks
- 

## 10. Final call

- [ ] No balance changes this week
- [ ] Small server-side tuning only
- [ ] UX-only polish, no economy changes
- [ ] Deeper investigation before next pass
