# Coder Survival — Canonical Event Taxonomy

> Source of truth for all tracked events across frontend, backend, and observation.
> Last updated: 2026-06-24

---

## Naming Convention

- Format: `{entity}_{action}` (snake_case)
- Entities: `user`, `tap`, `shop`, `offer`, `quest`, `pass`, `event`, `team`, `referral`, `skin`, `wallet`, `death`, `session`
- Actions: `opened`, `clicked`, `completed`, `claimed`, `dismissed`, `purchased`, `failed`, `triggered`, `started`, `ended`

---

## Frontend Events (Amplitude)

All events fire via `Analytics.track(name, properties)` from `frontend/src/utils/analytics.js` — a thin wrapper around `@amplitude/analytics-browser`.

### Lifecycle & Auth

| # | Event Name | File | Properties |
|---|-----------|------|-----------|
| 1 | `app_opened` | App.jsx:119 | `source` (document.referrer or 'direct') |
| 2 | `tma_open` | App.jsx:124 | *(platform init data — TMA context)* |
| 3 | `init_data_validated` | App.jsx:136 | *(validation result context)* |
| 4 | `user_registered` | App.jsx:142 | *(new user flag)* |
| 5 | `game_session_start` | App.jsx:158 | *(session state snapshot)* |

### Onboarding

| # | Event Name | File | Properties |
|---|-----------|------|-----------|
| 6 | `onboarding_started` | OnboardingModal.jsx:34 | *(none)* |
| 7 | `onboarding_step_completed` | OnboardingModal.jsx:44 | `step`, `total_steps` |
| 8 | `onboarding_completed` | OnboardingModal.jsx:71 | `duration_sec` |

### Core Gameplay

| # | Event Name | File | Properties |
|---|-----------|------|-----------|
| 9 | `tap` | TapArea.jsx:83 | `energy_before`, `energy_after`, `rank` |
| 10 | `score_earned` | TapArea.jsx:89 | `amount` (deltaCommits), `source` ('tap') |

### Death

| # | Event Name | File | Properties |
|---|-----------|------|-----------|
| 11 | `death_screen_triggered` (burnout) | App.jsx:469 | `cause` ('burnout'), `streak_days` |
| 12 | `death_screen_triggered` (heart_attack) | App.jsx:481 | `cause` ('heart_attack'), `streak_days` |

### Session

| # | Event Name | File | Properties |
|---|-----------|------|-----------|
| 13 | `session_end` | App.jsx:492 | *(session summary — taps, commits, duration)* |

### Social / Sharing

| # | Event Name | File | Properties |
|---|-----------|------|-----------|
| 14 | `share_card_triggered` (standup_survivor) | App.jsx:443 | `type` ('standup_survivor'), `streak_days` |
| 15 | `share_card_triggered` (survival_days) | App.jsx:458 | `type` ('survival_days'), `rank` |
| 16 | `share_card_triggered` (commit_of_the_day) | App.jsx:530 | `type` ('commit_of_the_day'), `milestone` ('onboarding_complete') |

### Shop / Monetization

| # | Event Name | File | Properties |
|---|-----------|------|-----------|
| 17 | `shop_opened` | ShopPanel.jsx:67 | *(none)* |
| 18 | `purchase_initiated` (stars) | ShopPanel.jsx:108 | `product_id`, `price` |
| 19 | `purchase_initiated` (ton) | ShopPanel.jsx:408 | `product_id`, `price`, `currency` ('ton') |
| 20 | `purchase_completed` (stars) | ShopPanel.jsx:124 | `product_id`, `price`, `currency` ('stars') |
| 21 | `purchase_completed` (deal) | ShopPanel.jsx:89 | `product_id`, `price`, `currency` ('stars'), `deal_type` |
| 22 | `purchase_failed` (stars) | ShopPanel.jsx:129 | `error_code`, `product_id`, `stage` |
| 23 | `purchase_failed` (deal) | ShopPanel.jsx:94 | `error_code`, `product_id`, `stage` ('deal_checkout') |

### Wallet (TON)

| # | Event Name | File | Properties |
|---|-----------|------|-----------|
| 24 | `wallet_connected` | useTonWallet.js:29 | *(wallet address/context)* |
| 25 | `wallet_connect_failed` | useTonWallet.js:53 | `error` |
| 26 | `wallet_disconnected` | useTonWallet.js:62 | `method` ('ton_connect') |
| 27 | `wallet_transaction_sent` | useTonWallet.js:82 | *(transaction context)* |
| 28 | `wallet_transaction_failed` | useTonWallet.js:89 | *(error context)* |

### Referrals

| # | Event Name | File | Properties |
|---|-----------|------|-----------|
| 29 | `referral_invite_sent` (copy) | ReferralPanel.jsx:112 | `channel` ('copy') |
| 30 | `referral_invite_sent` (telegram) | ReferralPanel.jsx:121 | `channel` ('telegram') |
| 31 | `referral_claimed` | ReferralPanel.jsx:160 | *(referral context)* |

### Rank & Progression

| # | Event Name | File | Properties |
|---|-----------|------|-----------|
| 32 | `rank_badge_clicked` | RankBadge.jsx:12 | *(none)* |
| 33 | `rank_up` | LevelUpModal.jsx:25 | `old_rank`, `new_rank` |

### Boosters

| # | Event Name | File | Properties |
|---|-----------|------|-----------|
| 34 | `boosters_opened` | BoostersPanel.jsx:61 | *(none)* |
| 35 | `booster_purchased` | BoostersPanel.jsx:79 | `booster_slug` |

### Settings

| # | Event Name | File | Properties |
|---|-----------|------|-----------|
| 36 | `settings_changed` | AudioSettings.jsx:53 | *(setting key/value context)* |

---

## Backend Events (audit_logs)

All rows insert into `audit_logs (user_id, action, context, created_at)`.

| # | Action | Source File | Table | What It Tracks |
|---|--------|-------------|-------|---------------|
| 1 | `anticheat_pattern_ban` | routes/tap.js:152 | audit_logs | Anti-cheat detected pattern ban — logs metrics (intervals, timestamps) |
| 2 | `anticheat_pattern_flag` | routes/tap.js:165 | audit_logs | Anti-cheat flagged suspicious pattern — logs metrics |
| 3 | `purchase_intent` | routes/buy.js:79 | audit_logs + purchases | User initiated a stars purchase — logs `purchaseId`, `itemType`, `starsAmount` |
| 4 | `deal_purchase_intent` | routes/shop.js:180 | audit_logs + purchases | User initiated a deal purchase — logs `purchaseId`, `dealType`, `itemType`, `starsAmount` |
| 5 | `offer_dismiss` | utils/offers.js:64 | audit_logs + offer_cooldowns | User dismissed a context offer — logs `offerType` |
| 6 | `event_claim` | utils/events.js:80 | audit_logs + event_contributions | User claimed hackathon reward — logs `eventId`, `commitsContributed` |
| 7 | `pass_claim` | utils/pass.js:299 | audit_logs + pass_claims | User claimed sprint pass reward — logs `passId`, `level`, `track`, `rewardApplied` |
| 8 | `pass_premium_unlock` | utils/pass.js:331 | audit_logs + player_passes | User unlocked premium pass — logs `passId`, `seasonNumber` |
| 9 | `pass_upgrade` | routes/pass.js:181 | audit_logs + purchases | User purchased premium pass upgrade — logs `passId`, `currency`, `price`, `seasonNumber` |
| 10 | `referral_bind_rejected` | routes/state.js:154, routes/referral.js:207 | audit_logs | Referral binding rejected (fraud) — logs `referredId`, `reason`, `bindIp` |
| 11 | `referral_bind_flagged` | routes/state.js:179, routes/referral.js:237 | audit_logs + referrals | Referral binding accepted but flagged — logs `referredId`, `flag`, `bindIp` |
| 12 | `appeal_submitted` | routes/appeal.js:71 | audit_logs + appeal_requests | User submitted ban appeal — logs `appealId`, `banScore`, `tier` |
| 13 | `balance_audit_violation` | jobs/balanceAudit.js:89 | audit_logs | Scheduled job detected economy violation — logs `type` + details |

---

## Database Tables

### Core State

| Table | Key Columns | Used By |
|-------|------------|---------|
| `users` | id, created_at, last_active | DAU, retention, cohort analysis |
| `sessions` | session_id, user_id, started_at, ended_at, taps_count, commits_earned | DAU, engagement, session metrics |
| `progression` | user_id, energy, depression_level, commits_total, anti_cheat_state, generator_state, event_state, inventory | Economy health, anti-cheat, burnout |

### Shop & Monetization

| Table | Key Columns | Used By |
|-------|------------|---------|
| `purchases` | user_id, item_type, stars_amount, status, created_at | Purchase funnel, revenue |
| `star_payments` | item_type, status, stars_amount, created_at | Payment completion tracking |

### Quests & Events

| Table | Key Columns | Used By |
|-------|------------|---------|
| `daily_quests` | user_id, quest_date, quest_type, target_value, progress_value, completed, claimed | Quest completion rates, bottleneck analysis |
| `events` | id, event_type, title, target_commits, start_date, end_date | Hackathon event config |
| `event_contributions` | user_id, event_id, commits_contributed, claimed | Hackathon progress, completion rates |

### Sprint Pass

| Table | Key Columns | Used By |
|-------|------------|---------|
| `sprint_passes` | id, season_number, start_date, end_date, is_active | Active pass identification |
| `player_passes` | user_id, pass_id, current_level, current_xp, is_premium | Level distribution, premium conversion |
| `pass_rewards` | pass_id, level, required_xp | XP curve definition |
| `pass_claims` | user_id, pass_id, level, track, claimed_at | Reward claiming, unclaimed analysis |

### Offers

| Table | Key Columns | Used By |
|-------|------------|---------|
| `offer_impressions` | user_id, offer_type, source, shown_at | Offer CTR, dismiss rates, fatigue |
| `offer_cooldowns` | user_id, offer_type, last_dismissed_at | Cooldown enforcement |

### Social

| Table | Key Columns | Used By |
|-------|------------|---------|
| `referrals` | referrer_id, referred_id, status, bind_ip, device_hash, is_referred_premium | Referral funnel, fraud detection |
| `teams` | *(team system tables)* | Team metrics |

### Other

| Table | Key Columns | Used By |
|-------|------------|---------|
| `daily_farm_log` | user_id, farm_date, loc_earned | Generator economy, passive income |
| `appeal_requests` | user_id, ban_score_snapshot, sanction_tier, status | Appeal pipeline |
| `audit_logs` | user_id, action, context, created_at | All backend event tracking |
| `player_levels` | user_id, xp_total, prestige_level | Rank resolution |

---

## Observation SQL Coverage

Maps each `observation/*.sql` file to the events/tables it queries.

| SQL File | Domain | Tables/Events Covered |
|----------|--------|----------------------|
| `01_dau_retention.sql` | Engagement | `sessions`, `users` — DAU, D1 retention, sticky factor |
| `02_daily_quests.sql` | Quests | `daily_quests` — completion rate, full-clear, claim timing, bottleneck |
| `03_context_offers.sql` | Offers | `offer_impressions`, `audit_logs` (offer_dismiss, purchase_intent) — CTR, dismiss rate, conversion, fatigue |
| `04_weekly_hackathon.sql` | Events | `events`, `event_contributions` — participation, completion %, drop-off |
| `05_sprint_pass.sql` | Pass | `player_passes`, `pass_claims`, `pass_rewards`, `audit_logs` (pass_premium_unlock) — level dist, velocity, unclaimed |
| `06_shop_purchases.sql` | Shop | `purchases`, `star_payments`, `audit_logs` (purchase_intent) — funnel, revenue, conversion |
| `07_economy_health.sql` | Economy | `progression`, `player_levels`, `sessions`, `daily_quests` — energy, depression, rank dist |
| `08_stress_cohort_ab.sql` | Cohort | `progression`, `sessions` — stress cohort analysis |
| `09_phase2_metrics.sql` | Advanced | Cross-table composite metrics |

---

## ⚠️ MISSING Events (Gaps)

Events that should exist but currently don't — sourced from `MISSING_METRICS_FOR_BALANCE_PASS.md` audit (2026-05-07).

### Critical Gaps

| Missing Event | System | Why It Matters |
|--------------|--------|---------------|
| `offer_impression` | Context Offers | Without logging when offers are shown, CTR = clicks/impressions is impossible. The `offer_impressions` table exists but is populated by `getContextOffer` server-side — no frontend confirmation that the banner was actually rendered. |
| `offer_click` | Context Offers | Only `offer_dismiss` is tracked. No event fires when user clicks the CTA ("Зарядиться" / "Дожать" / "Сбросить стресс"). Cannot measure engagement vs dismissal. |
| `shop_tab_viewed` | Shop | `ShopPanel` has tabs (energy/stress/boost/pass) but no event fires on tab switch. Cannot measure which categories get attention. |
| `quest_panel_opened` | Quests | No tracking of daily quest panel views. Cannot compute view-to-completion funnel. |
| `event_panel_opened` | Events | `EventPanel` has no analytics calls. Cannot measure hackathon engagement funnel. |
| `pass_panel_opened` | Pass | No tracking of sprint pass panel views. Cannot measure pass engagement. |

### Medium Gaps

| Missing Event | System | Why It Matters |
|--------------|--------|---------------|
| `payment_dialog_shown` | Shop | Purchase funnel breaks at "invoice created" — no log for payment dialog shown / paid / cancelled / failed. |
| `session_quality_snapshot` | Sessions | `ended_at` is almost always NULL. No session quality metrics (tap intervals, energy/depression curves within session). |
| `event_daily_progress` | Events | Only final `commits_contributed` stored. No daily snapshots → cannot see when users stall or abandon. |
| `pass_xp_history` | Pass | `player_passes` is overwritten. Cannot reconstruct "on Day 7, average user was Level 5 with 120 XP." |

### Low Gaps

| Missing Event | System | Why It Matters |
|--------------|--------|---------------|
| `quest_completed_at` | Quests | `completed` flips to TRUE but no timestamp. Cannot tell if quest finishes at 09:00 or 23:55. |
| `quest_claimed_at` | Quests | `claimed` boolean only, no timestamp. Cannot measure claim delay. |
| `tap_sampled` | Tap Economy | No sampled tap logging. Cannot fine-tune `energyMultiplier`, `depressionPenalty`, `streakBonus` coefficients. |
| `team_*` (any) | Teams | Zero audit logs for team create/join/leave. Cannot measure team health or retention impact. |

### Summary

| Priority | Count | Status |
|----------|-------|--------|
| Critical | 6 | Blocks balance pass validation |
| Medium | 4 | Needed for pacing/depth analysis |
| Low | 4 | Nice-to-have for advanced tuning |
| **Total gaps** | **14** | |
| **Frontend events tracked** | **36** | |
| **Backend audit actions** | **13** | |
| **Grand total active events** | **49** | |

---

## Event-to-Table Cross-Reference

Quick lookup: which tables each event touches or depends on.

| Event | Frontend | Backend audit_logs | DB Tables |
|-------|----------|-------------------|-----------|
| `app_opened` | ✅ | — | — |
| `tma_open` | ✅ | — | — |
| `init_data_validated` | ✅ | — | — |
| `user_registered` | ✅ | — | users |
| `game_session_start` | ✅ | — | sessions |
| `onboarding_started` | ✅ | — | — |
| `onboarding_step_completed` | ✅ | — | — |
| `onboarding_completed` | ✅ | — | — |
| `tap` | ✅ | — | progression |
| `score_earned` | ✅ | — | progression |
| `session_end` | ✅ | — | sessions |
| `death_screen_triggered` | ✅ | — | progression |
| `share_card_triggered` | ✅ | — | — |
| `shop_opened` | ✅ | — | — |
| `purchase_initiated` | ✅ | `purchase_intent` / `deal_purchase_intent` | purchases |
| `purchase_completed` | ✅ | — | purchases, star_payments |
| `purchase_failed` | ✅ | — | purchases |
| `wallet_connected` | ✅ | — | — |
| `wallet_connect_failed` | ✅ | — | — |
| `wallet_disconnected` | ✅ | — | — |
| `wallet_transaction_sent` | ✅ | — | — |
| `wallet_transaction_failed` | ✅ | — | — |
| `referral_invite_sent` | ✅ | — | — |
| `referral_claimed` | ✅ | — | referrals |
| `rank_badge_clicked` | ✅ | — | — |
| `rank_up` | ✅ | — | player_levels |
| `boosters_opened` | ✅ | — | — |
| `booster_purchased` | ✅ | — | — |
| `settings_changed` | ✅ | — | — |
| — | — | `anticheat_pattern_ban` | progression, audit_logs |
| — | — | `anticheat_pattern_flag` | progression, audit_logs |
| — | — | `offer_dismiss` | offer_cooldowns, audit_logs |
| — | — | `event_claim` | event_contributions, audit_logs |
| — | — | `pass_claim` | pass_claims, audit_logs |
| — | — | `pass_premium_unlock` | player_passes, audit_logs |
| — | — | `pass_upgrade` | purchases, audit_logs |
| — | — | `referral_bind_rejected` | audit_logs |
| — | — | `referral_bind_flagged` | referrals, audit_logs |
| — | — | `appeal_submitted` | appeal_requests, audit_logs |
| — | — | `balance_audit_violation` | audit_logs |
