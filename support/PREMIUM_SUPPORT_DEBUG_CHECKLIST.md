# Premium Support & Debug Checklist

> Operational triage for monetization complaints: premium pass, entitlement confusion, and duplicate payment edge cases.  
> Use together with `support/SUPPORT_TRIAGE_CHECKLIST.md` (general payment/quest triage) and `support/GAMEPLAY_FAQ.md`.  
> All SQL is `SELECT`-only. No secrets or `.env` references.  
> **Last updated:** 2026-05-29

---

## How to Use This Doc

- **Expected behavior** — not a bug; explain to player.
- **Possible bug** — collect all SQL outputs and escalate to backend with the generic template at the end.
- Replace `:tgId` with player's Telegram ID and `:userId` with internal `users.id`.

---

## 1. Premium Pass Not Active — "Купил, а premium не виден"

### Step 1 — Identify the user
```sql
SELECT id, username, created_at
FROM users
WHERE telegram_id = :tgId;
-- Save :userId from this query for all steps below.
```

### Step 2 — Find the latest premium_pass purchase
```sql
SELECT
  id AS purchase_id,
  item_type,
  stars_amount,
  status,
  created_at
FROM purchases
WHERE user_id = :userId
  AND item_type = 'premium_pass'
ORDER BY id DESC
LIMIT 5;
```

### Step 3 — Interpret purchase status

| Status | Meaning | Next Step |
|--------|---------|-----------|
| `pending` | Payment webhook from Telegram not yet received. | Ask player to wait 1–2 min and reopen the app. If still pending after 10 min → investigate webhook path. |
| `completed` | Purchase row confirmed. | Go to Step 4. |
| `failed` | Payment failed or was cancelled. | No entitlement should exist. Ask player to check Telegram payment history. |

### Step 4 — Verify payment record
```sql
SELECT
  telegram_payment_charge_id,
  status,
  created_at
FROM star_payments
WHERE purchase_id = :purchaseId
ORDER BY id DESC;
```

- **Missing record** → webhook lost or confirm not executed. May need manual backend intervention.
- **Record exists** → go to Step 5.

### Step 5 — Check entitlement on the active pass
```sql
-- Current active pass season
SELECT id AS pass_id, start_date, end_date
FROM passes
WHERE end_date >= CURRENT_DATE
ORDER BY start_date DESC
LIMIT 1;

-- Player entitlement on that pass
SELECT
  pass_id,
  is_premium,
  current_level,
  created_at,
  updated_at
FROM player_passes
WHERE user_id = :userId
  AND pass_id = (SELECT id FROM passes WHERE end_date >= CURRENT_DATE ORDER BY start_date DESC LIMIT 1);
```

### Step 6 — Interpret entitlement state

| `is_premium` | `pass_id` matches active season | Meaning | Action |
|--------------|--------------------------------|---------|--------|
| `true` | Yes | Premium is active for current season. | Ask player to reload Mini App. Check frontend state sync. |
| `true` | No (old pass) | Premium was active for a **previous** season. | Explain v1 limitation: premium is season-scoped. A new purchase is needed for the new season. |
| `false` | Yes | Purchase completed but entitlement flag not set. | **Escalate to backend.** |
| `false` | No | No entitlement at all. | If purchase is `completed` + `star_payments` exists → **escalate to backend.** |

### Step 7 — Audit trail for premium
```sql
SELECT
  action,
  context,
  created_at
FROM audit_logs
WHERE user_id = :userId
  AND action IN ('payment_confirm', 'pass_premium_unlock', 'purchase_intent')
ORDER BY created_at DESC
LIMIT 10;
```

### Escalate to backend if
- `purchases.status = 'completed'` + `star_payments` record exists + `player_passes.is_premium = false` for active pass.
- `player_passes.is_premium = true` for active pass, but player still cannot claim premium track rewards (possible frontend desync after reload).
- Multiple `premium_pass` purchases in `pending` status older than 10 minutes.
- Audit trail shows `pass_premium_unlock` but `player_passes` row does not reflect it.

---

## 2. Purchase Applied but Not Visible — "Купил энергию/буст, а эффекта не вижу"

> For non-premium items (`energy_refill`, `depression_cure`, `tier_boost`), also see `SUPPORT_TRIAGE_CHECKLIST.md` §1.  
> This section adds premium-specific visibility checks.

### Step 1 — Confirm purchase and payment
Same as §1 Step 2–4, but filter by the actual `item_type` the player bought.

### Step 2 — Check expected effect vs actual state

| Item | Expected State Change | SQL Check |
|------|----------------------|-----------|
| `energy_refill` | `progression.energy = maxEnergy` | `SELECT energy, max_energy FROM progression JOIN player_levels USING(user_id) WHERE user_id = :userId;` |
| `depression_cure` | `progression.depression` down by ~60 (capped at 0) | `SELECT depression FROM progression WHERE user_id = :userId;` |
| `tier_boost` | `player_levels.xp_total` +40, `progression.commits_current` +50 | `SELECT xp_total FROM player_levels WHERE user_id = :userId; SELECT commits_current FROM progression WHERE user_id = :userId;` |
| `premium_pass` | `player_passes.is_premium = true`, premium track unlocked | See §1 Step 5. |

### Step 3 — Check for unclaimed pass rewards (premium-specific)
If player bought `premium_pass` and `is_premium = true`, but says "nothing changed":
```sql
-- Which premium rewards are already unlocked but unclaimed?
SELECT
  pr.level,
  pr.reward_payload,
  pc.claimed_at
FROM pass_rewards pr
LEFT JOIN pass_claims pc
  ON pc.pass_id = pr.pass_id
 AND pc.level = pr.level
 AND pc.track = 'premium'
 AND pc.user_id = :userId
WHERE pr.pass_id = (SELECT id FROM passes WHERE end_date >= CURRENT_DATE ORDER BY start_date DESC LIMIT 1)
  AND pr.track = 'premium'
  AND pr.level <= (SELECT current_level FROM player_passes WHERE user_id = :userId AND pass_id = pr.pass_id)
ORDER BY pr.level;
```

- If rows exist with `claimed_at IS NULL` → **expected behavior**. Premium Pass unlocks the track; player must still claim each level manually.
- Explain: "Premium открывает премиум-награды, но их всё равно нужно забирать вручную на каждом уровне."

### Escalate to backend if
- `purchases.status = 'completed'` + `star_payments` exists + audit shows `payment_confirm`, **but** player state is unchanged (energy, depression, xp, or commits did not move).
- `premium_pass` entitlement is correct, but unclaimed premium rewards do not show claim buttons in UI after reload.

---

## 3. Duplicate Confirm Confusion — "Сняли деньги дважды / два чека"

### Context for Support
Telegram may send `successful_payment` webhook more than once if the first callback times out. The backend is **idempotent** by `telegram_payment_charge_id`. A duplicate callback does **not** create a duplicate entitlement or delivery.

However, the player may see:
- Two Telegram payment receipts.
- Two Stars deductions in their Telegram wallet history.
- One item delivery.

### Step 1 — Check for duplicate charge IDs
```sql
SELECT
  telegram_payment_charge_id,
  COUNT(*) AS occurrence_count,
  ARRAY_AGG(purchase_id ORDER BY purchase_id) AS purchase_ids,
  MIN(created_at) AS first_seen,
  MAX(created_at) AS last_seen
FROM star_payments
WHERE purchase_id IN (
  SELECT id FROM purchases WHERE user_id = :userId ORDER BY id DESC LIMIT 20
)
GROUP BY telegram_payment_charge_id
HAVING COUNT(*) > 1;
```

- **Result > 0** → duplicate confirm detected. This is handled safely by idempotency, but player may be confused by wallet UI.
- **Result = 0** → no duplicate charge IDs. Player likely mistook two different purchases or Telegram UI artifact.

### Step 2 — Check purchase rows for the same item type
```sql
SELECT
  id,
  item_type,
  stars_amount,
  status,
  created_at
FROM purchases
WHERE user_id = :userId
  AND item_type = :itemType
ORDER BY created_at DESC
LIMIT 10;
```

- If two `completed` rows with **different** `id` and **different** `created_at` → player bought twice intentionally or by mistake.
- If two rows but one is `pending` and one is `completed` → normal flow; the pending row may be old.

### Step 3 — Verify actual entitlement count
```sql
-- For premium_pass: how many times was premium unlocked?
SELECT
  purchase_id,
  item_type,
  COUNT(*) OVER (PARTITION BY item_type) AS total_count
FROM purchases
WHERE user_id = :userId
  AND item_type = 'premium_pass'
  AND status = 'completed'
ORDER BY purchase_id DESC;
```

### What to tell the player
> "Сервер зафиксировал вашу покупку один раз. Иногда Telegram может отображать две транзакции в интерфейсе из-за повторной отправки подтверждения, но сама игра выдаёт предмет только один раз. Если с вашего счёта списались Stars дважды по ошибке — это refund-запрос в поддержку Telegram, а не в игру."

### Escalate to backend if
- Duplicate `telegram_payment_charge_id` returned **different** `purchase_id`s (should never happen; possible mapping bug).
- Two `completed` purchases with **different** `telegram_payment_charge_id` for the same item within 1 minute, and player claims they tapped buy only once (possible double-submit bug).
- Player requests a refund or Stars credit — this is outside game scope and should go to Telegram support, but escalate if pattern suggests a frontend bug.

---

## 4. Quick Reference: Premium Entitlement State Matrix

Use this as a one-glance decision tree during live chat.

| Purchase Status | Star Payment | `is_premium` Active Pass | Interpretation | Player Message |
|-----------------|--------------|--------------------------|----------------|----------------|
| `pending` | Missing | N/A | Payment in flight | "Подождите 1–2 минуты и перезайдите в приложение." |
| `completed` | Exists | `true` | Premium active | "Перезагрузите приложение. Premium открывает премиум-награды, которые нужно забирать вручную." |
| `completed` | Exists | `false` | Entitlement bug | Gather data and escalate. |
| `completed` | Missing | — | Webhook lost | Escalate for manual confirm check. |
| `failed` | Missing | — | Payment failed | "Платёж не прошёл. Проверьте историю платежей в Telegram." |
| `completed` | Exists | `true` (old pass) | Expired season | "Premium действует только на сезон, в котором он куплен. Новый сезон требует новой покупки." |

---

## 5. Generic Escalation Template

When a case is **not** expected behavior, include the following in the backend ticket:

**Required:**
- `telegram_id`: ______
- `user_id` (from `users.id`): ______
- Time of complaint (UTC): ______
- Screenshot of player's pass panel / shop / wallet
- Item type involved: `energy_refill` / `depression_cure` / `tier_boost` / `premium_pass`

**SQL results (paste all):**
- [ ] `SELECT * FROM purchases WHERE user_id = :userId ORDER BY id DESC LIMIT 5;`
- [ ] `SELECT * FROM star_payments WHERE purchase_id = :purchaseId;`
- [ ] `SELECT * FROM player_passes WHERE user_id = :userId ORDER BY pass_id DESC LIMIT 3;`
- [ ] `SELECT * FROM audit_logs WHERE user_id = :userId AND action IN ('payment_confirm','pass_premium_unlock','purchase_intent','offer_dismiss') ORDER BY created_at DESC LIMIT 10;`
- [ ] For non-premium items: `SELECT energy, depression, commits_current FROM progression WHERE user_id = :userId;`

**Optional but helpful:**
- API error response (if player saw an error message)
- Device / platform (iOS, Android, Desktop)
- Whether issue persists after app reload

---

## Related Files

- `support/SUPPORT_TRIAGE_CHECKLIST.md` — general payment, quest, event, team, referral triage
- `support/GAMEPLAY_FAQ.md` — player-facing rules and expected behavior
- `analytics/CANONICAL_EVENT_TAXONOMY.md` — event names for purchase/offer funnel
- `observation/06_shop_purchases.sql` — deep-dive SQL for shop metrics
