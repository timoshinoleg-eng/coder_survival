# Coder Survival — Live Economy Constants (facts only)

Source of truth: current repo code + migrations (as of 2026-05-07).  
No suggestions, no drift analysis — only extracted values.

---

## 1. Context Offers

| Field | `low_energy` | `near_rank` | `high_stress` | Global |
|-------|-------------|-------------|---------------|--------|
| **Priority** | 1 | 2 | 3 | — |
| **Threshold** | energy ≤ 25% | level progress ≥ 72% | depression ≥ 55 | — |
| **Cooldown** | 90 min | 2 h | 3 h | 90 s |
| **Product ID** | `energy_refill` | `tier_boost` | `depression_cure` | — |
| **Stars price** | 10⭐ | 75⭐ | 40⭐ | — |
| **Action label** | Зарядиться | Дожать | Сбросить стресс | — |
| **Title** | ⚡ Энергия просела | 🚀 Повышение рядом | 🧠 Стресс режет отдачу | — |

**Sources:** `backend/src/config/balance.js` (lines 1–31), `backend/src/utils/shopCatalog.js`

---

## 2. Shop Catalog

| ID | Name | Stars | Category | Backend effect (applyItemEffect) |
|----|------|-------|----------|----------------------------------|
| `energy_refill` | Энергетик | 10 | energy | `energy = maxEnergy` (full refill) |
| `depression_cure` | Терапия | 40 | stress | `depressionRelief: 60` (applyReward) |
| `tier_boost` | Буст коммитов | 75 | boost | `xpTotal: 40`, `commitsCurrent: 50` (applyReward) |
| `premium_pass` | Premium Pass | 200 | pass | `is_premium = TRUE` for active season |
| `streak_protect` | — | — | — | No-op (returns `{streakProtected: true}`) |

**Sources:** `backend/src/utils/shopCatalog.js`, `backend/src/routes/buy.js` (applyItemEffect, lines 102–146), `backend/src/config/balance.js` (SHOP_ITEM_EFFECTS, lines 87–90)

---

## 3. Weekly Hackathon

| Field | Value |
|-------|-------|
| **Target** | 650 commits |
| **Reward energy** | +80 |
| **Reward commitsCurrent** | +60 |
| **Reward depressionRelief** | +15 |

**Sources:** `backend/src/config/balance.js` (lines 57–62), `backend/migrations/006_balance_tuning.sql` (lines 4–7)

---

## 4. Sprint Pass — 20 Levels

| Level | Required XP | Free reward | Premium reward |
|-------|-------------|-------------|----------------|
| 1 | 20 | +10 energy | +20 energy |
| 2 | 20 | +15 commitsCurrent | +30 commitsCurrent |
| 3 | 25 | +10 energy | +20 energy |
| 4 | 25 | +15 commitsCurrent | +30 commitsCurrent, +10 depressionRelief |
| 5 | 30 | +15 energy, +20 commitsCurrent | +30 energy, +40 commitsCurrent |
| 6 | 30 | +10 energy | +20 energy |
| 7 | 35 | +20 commitsCurrent | +40 commitsCurrent |
| 8 | 35 | +10 energy | +20 energy, +10 depressionRelief |
| 9 | 40 | +20 commitsCurrent | +30 energy |
| 10 | 45 | +20 energy, +30 commitsCurrent | +40 energy, +50 commitsCurrent |
| 11 | 45 | +10 energy | +20 energy |
| 12 | 50 | +20 commitsCurrent | +45 commitsCurrent |
| 13 | 50 | +15 energy | +25 energy, +10 depressionRelief |
| 14 | 55 | +25 commitsCurrent | +45 commitsCurrent |
| 15 | 60 | +20 energy, +35 commitsCurrent | +50 energy, +60 commitsCurrent |
| 16 | 60 | +15 energy | +30 energy |
| 17 | 65 | +25 commitsCurrent | +50 commitsCurrent |
| 18 | 70 | +20 energy | +40 energy, +15 depressionRelief |
| 19 | 75 | +30 commitsCurrent | +60 commitsCurrent |
| 20 | 80 | +30 energy, +50 commitsCurrent | +80 energy, +100 commitsCurrent, +25 depressionRelief |

**Total season XP:** 915  
**Duration seed:** `CURRENT_DATE + INTERVAL '29 days'` (30-day inclusive window)

**Sources:** `backend/src/config/balance.js` (SPRINT_PASS_LEVELS, lines 64–85), `backend/migrations/006_balance_tuning.sql` (pass_rewards UPDATE, lines 9–40), `backend/migrations/004_stage4_retention.sql` (sprint_passes seed, line 107–109)

---

## 5. Daily Quests

| Quest type | Target | Reward | Notes |
|------------|--------|--------|-------|
| `tap_count` | 40 taps | +15 energy | — |
| `commit_count` | 80 commits | +10 energy, +30 commitsCurrent | — |
| `login` | 1 login | +10 energy | Auto-completed on state load |
| **All claimed bonus** | — | **+25 energy** | Applied when last daily reward is claimed |

**Sources:** `backend/src/config/balance.js` (DAILY_QUEST_DEFS + DAILY_QUEST_ALL_CLAIMED_BONUS, lines 37–55), `backend/migrations/002_vnext_core.sql` (daily_quests schema)

---

## 6. Rank Meta (vNext Progression)

| Rank | Name | Commits per tap | Max energy |
|------|------|-----------------|------------|
| 1 | Junior | 1 | 100 |
| 2 | Middle | 2 | 120 |
| 3 | Senior | 3 | 150 |
| 4 | Lead | 5 | 180 |
| 5 | CTO | 8 | 220 |

**XP per tap formula:** `round(1 * (1 + 0.1 * (levelInRank - 1)))`

**Sources:** `backend/src/utils/vnext.js` (RANK_META, lines 15–21; computeTapXp, lines 94–97)

---

## 7. Daily Battle Rewards

| Place | Reward |
|-------|--------|
| Top 1 | +50 energy |
| Top 2 | +30 energy |
| Top 3 | +15 energy |

**Sources:** `backend/src/routes/battle.js` (lines 93–97)

---

## 8. Referral Milestones

| Active referrals | Reward |
|------------------|--------|
| 1 | +30 energy |
| 3 | +60 energy |
| 5 | +100 energy |

**Active definition:** `progression.commits_total >= 20`  
**Sources:** `backend/src/routes/referral.js` (MILESTONE_REWARDS, line 7; stats query, line 51)

---

## 9. Tap Mechanics

| Parameter | Value / Formula |
|-----------|-----------------|
| Base commits | `commitsPerTap` (from rank) |
| Energy multiplier | `energy / 100` |
| Depression penalty | `depression / 100 * 0.5` |
| Streak bonus | `min(streak * 0.05, 0.5)` |
| Commits delta | `round(base * energyMult * (1 - penalty) * (1 + streakBonus))`, min 1 |
| Energy delta | −1 |
| Depression delta | 0 (energy≥20), 1 (energy<20), 2 (energy<10) |

**Sources:** `backend/src/routes/tap.js` (calculateTapDelta, lines 203–254)

---

## 10. Energy Recovery

| Parameter | Value |
|-----------|-------|
| Recovery interval | `ENERGY_RECOVERY_INTERVAL_SECONDS` env, default 60 s |
| Energy recovered | `floor(elapsedSeconds / interval)` |
| Stress recovered | `floor(recoveredEnergy / 5)` |
| Cap | `LEAST(maxEnergy, energy + recovered)` |

**Sources:** `backend/src/utils/progression.js` (lines 1–30)

---

## 11. Rate Limits

| Parameter | Env var | Code default | .env.example value |
|-----------|---------|--------------|-------------------|
| Burst limit | `RATE_LIMIT_MAX_TAPS_PER_SECOND` | 20 | 15 |
| Soft ban | `RATE_LIMIT_SOFT_BAN_THRESHOLD` | 40 | 25 |
| Daily IP cap | `RATE_LIMIT_DAILY_CAP_PER_IP` | 10 000 | 10 000 |
| Window | — | 2 seconds | — |

**Sources:** `backend/src/middleware/rateLimit.js` (lines 8–79), `backend/.env.example` (lines 19–21)

---

## Source Files Index

| File | What it defines |
|------|-----------------|
| `backend/src/config/balance.js` | Context offers, daily quests, weekly hackathon, sprint pass rewards, shop item effects |
| `backend/src/utils/shopCatalog.js` | Product catalog (names, prices, categories) |
| `backend/src/routes/buy.js` | Item effect application logic (applyItemEffect) |
| `backend/src/utils/vnext.js` | Rank meta, XP per tap, level thresholds |
| `backend/src/routes/tap.js` | Tap delta calculation formula |
| `backend/src/routes/battle.js` | Daily battle reward preview |
| `backend/src/routes/referral.js` | Referral milestone rewards |
| `backend/src/utils/progression.js` | Energy/stress recovery formula |
| `backend/src/middleware/rateLimit.js` | Rate limit thresholds |
| `backend/migrations/006_balance_tuning.sql` | DB tuning for event target + pass XP curve |
| `backend/migrations/004_stage4_retention.sql` | Sprint pass duration seed (`+29 days`), event duration seed (`+6 days`) |
| `backend/migrations/002_vnext_core.sql` | Daily quests schema |
