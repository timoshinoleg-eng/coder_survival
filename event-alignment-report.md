# Coder Survival — Event Name Alignment Audit Report

Generated: 2026-06-24 | Read-only audit, zero modifications

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Frontend unique event names | 29 |
| Backend audit_logs unique actions | 13 |
| SQL files referencing audit actions | 3 of 9 |
| Broken SQL queries | 1 (meme_share) |
| Naming mismatches across layers | 3 |
| Frontend events with no backend mirror | 25 |
| Backend audit actions with no frontend track | 11 |

---

## A. Frontend Analytics.track() Events

Collected from `frontend/src/` via grep for `Analytics.track(`.

```
app_opened                     App.jsx:119
booster_purchased              BoostersPanel.jsx:79
boosters_opened                BoostersPanel.jsx:61
death_screen_triggered         App.jsx:469, 481
game_session_start             App.jsx:158
init_data_validated            App.jsx:136
onboarding_completed           OnboardingModal.jsx:71
onboarding_started             OnboardingModal.jsx:34
onboarding_step_completed      OnboardingModal.jsx:44
purchase_completed             ShopPanel.jsx:89, 124
purchase_failed                ShopPanel.jsx:94, 129
purchase_initiated             ShopPanel.jsx:108, 408
rank_badge_clicked             RankBadge.jsx:12
rank_up                        LevelUpModal.jsx:25
referral_claimed               ReferralPanel.jsx:160
referral_invite_sent           ReferralPanel.jsx:112, 121
score_earned                   TapArea.jsx:89
session_end                    App.jsx:492
settings_changed               AudioSettings.jsx:53
share_card_triggered           App.jsx:443, 458, 530
shop_opened                    ShopPanel.jsx:67
tap                            TapArea.jsx:83
tma_open                       App.jsx:124
user_registered                App.jsx:142
wallet_connect_failed          useTonWallet.js:53
wallet_connected               useTonWallet.js:29
wallet_disconnected            useTonWallet.js:62
wallet_transaction_failed      useTonWallet.js:89
wallet_transaction_sent        useTonWallet.js:82
```

## B. Backend audit_logs INSERT Actions

Collected from `backend/src/` — all `INSERT INTO audit_logs` statements.

```
anticheat_pattern_ban          routes/tap.js:153
anticheat_pattern_flag         routes/tap.js:166
appeal_submitted               routes/appeal.js:72
balance_audit_violation        jobs/balanceAudit.js:89
deal_purchase_intent           routes/shop.js:181
event_claim                    utils/events.js:81
offer_dismiss                  utils/offers.js:65
pass_claim                     utils/pass.js:300
pass_premium_unlock            utils/pass.js:332
pass_upgrade                   routes/pass.js:182
purchase_intent                routes/buy.js:80
referral_bind_flagged          routes/state.js:180, routes/referral.js:238
referral_bind_rejected         routes/state.js:155, routes/referral.js:208
```

## C. SQL Observation Audit Action References

| SQL / Route File | Quoted Action String | Line |
|------------------|---------------------|------|
| observation/03_context_offers.sql | `offer_dismiss` | 32 |
| observation/05_sprint_pass.sql | `pass_premium_unlock` | 62 |
| observation/09_phase2_metrics.sql | `meme_share` | 34 |
| routes/internalObservation.js | `offer_dismiss` | 500 |
| routes/internalObservation.js | `purchase_intent` | 540, 615, 1032 |
| routes/internalObservation.js | `pass_premium_unlock` | 923 |
| routes/internalObservation.js | `anticheat_pattern_ban` | 315 |
| routes/internalObservation.js | `anticheat_pattern_flag` | 315 |
| routes/internalObservation.js | `balance_audit_violation` | 315 |

## D. Cross-Reference Matrix

### Naming conflicts (same concept, different strings)

| Domain concept | Frontend string | Backend string | Verdict |
|---------------|----------------|----------------|---------|
| User begins purchase flow | `purchase_initiated` | `purchase_intent` | **MISMATCH** — rename frontend to `purchase_intent` |
| Discount deal checkout | `purchase_initiated` (reused) | `deal_purchase_intent` | Backend more specific; frontend conflates two flows |
| Offer dismissed by user | (none) | `offer_dismiss` | Backend-only; frontend has no tracking for this |

### Frontend-only events (no backend audit_logs entry)

All 25 remaining frontend events lack a corresponding backend audit insert:

```
app_opened, booster_purchased, boosters_opened, death_screen_triggered,
game_session_start, init_data_validated, onboarding_completed,
onboarding_started, onboarding_step_completed, purchase_completed,
purchase_failed, rank_badge_clicked, rank_up, referral_claimed,
referral_invite_sent, score_earned, session_end, settings_changed,
share_card_triggered, shop_opened, tap, tma_open, user_registered,
wallet_connect_failed, wallet_connected, wallet_disconnected,
wallet_transaction_failed, wallet_transaction_sent
```

Note: `session_end` is intentionally frontend-only — the backend `sessions` table captures the same data independently.

### Backend-only actions (no frontend Analytics.track call)

```
anticheat_pattern_ban, anticheat_pattern_flag, appeal_submitted,
balance_audit_violation, deal_purchase_intent, event_claim,
offer_dismiss, pass_claim, pass_premium_unlock, pass_upgrade,
referral_bind_flagged, referral_bind_rejected
```

These are server-side operations with no client-side analytics counterpart. This is expected for anti-cheat and internal auditing, but `offer_dismiss`, `pass_claim`, and `event_claim` are user-facing actions that would benefit from frontend tracking.

## E. Critical Bug: meme_share SQL Gap

`observation/09_phase2_metrics.sql` line 34 contains:

```sql
WHERE action = 'meme_share'
```

The backend meme route (`routes/meme.js:187-188`) calls `recordMemeShare()` which writes to `meme_shares` table and `checkAchievement()`, but **never inserts into audit_logs**. The SQL query silently returns zero rows.

The meme_shares table has columns `(user_id, template_id, format, shared_to)` — the data exists, just not in the table the SQL expects.

## F. Prioritized Recommendations

### Priority 1 — Broken query (data loss)

| Action | Change |
|--------|--------|
| Fix `observation/09_phase2_metrics.sql:34` | Either add audit insert to `routes/meme.js` after `recordMemeShare()`, or rewrite SQL to query `meme_shares` table directly. Second option is cleaner. |

### Priority 2 — Naming inconsistency

| Action | Change |
|--------|--------|
| Rename frontend event | `ShopPanel.jsx` lines 108 and 408: change `'purchase_initiated'` to `'purchase_intent'` to match backend |

### Priority 3 — Observation blind spots

| Missing audit action | Where to add | Rationale |
|---------------------|-------------|-----------|
| `offer_dismiss` from frontend | `ShopPanel.jsx` or offer component | SQL 03_context_offers.sql relies on it but only backend logs it — double counting possible if frontend adds its own |
| `share_card_triggered` backend audit | `App.jsx` share handlers | Social virality has no server-side record |
| `death_screen_triggered` backend audit | `App.jsx` death handlers | Churn signal invisible to backend analytics |
| `rank_up` backend audit | `LevelUpModal.jsx` or progression route | Progression milestones untracked server-side |

### Priority 4 — Observational hygiene

| Item | Note |
|------|------|
| `internalObservation.js:524` vs `03_context_offers.sql:56` | Internal route maps `stress_warning` to `depression_cure`, but SQL maps `high_stress` to `depression_cure` — same offer concept, two different offer_type strings in the VALUES clauses |
| `deal_purchase_intent` vs `purchase_intent` | Two separate audit actions for shop purchases — one for direct buy, one for discounted deal. SQL 06_shop_purchases.sql only queries the `purchases` table, not audit_logs, so no conflict yet. But if audit queries are added later, both must be covered. |

---

End of report. Zero files modified.
