# Telegram Stars Payment Flow — Coder Survival

> Russian user-facing text. English code/comments.  
> MVP default: `MOCK_MODE=true`. No real Stars deducted in development.

---

## Overview

Telegram Stars (XTR) is Telegram's native virtual currency for digital goods.  
1 Star ≈ $0.01 USD (check current rate in [@BotFather](https://t.me/botfather) or official docs).

For Coder Survival we use Stars for in-game purchases:
- Coffee (10⭐) — instant energy refill
- Energy Pack (50⭐) — large energy refill
- Antidepressant (100⭐) — depression reset
- Premium Skin (300⭐) — cosmetic unlock

---

## Step 1: Create Invoice via Bot API

### API: `sendInvoice`

```http
POST https://api.telegram.org/bot<TOKEN>/sendInvoice
Content-Type: application/json

{
  "chat_id": 123456789,
  "title": "Кофе",
  "description": "Мгновенный прилив энергии для программиста",
  "payload": "coffee|user_123|uuid_v4",
  "provider_token": "",           // empty string for Stars
  "currency": "XTR",
  "prices": [
    {"label": "Кофе", "amount": 10}
  ],
  "start_parameter": "buy_coffee",
  "reply_markup": {
    "inline_keyboard": [[
      {"text": "⭐ Купить за 10 Stars", "pay": true}
    ]]
  }
}
```

**Key fields:**
- `provider_token`: **must be empty string** for Stars payments
- `currency`: **"XTR"** — Telegram Stars currency code
- `prices[].amount`: integer, 1 unit = 1 Star
- `payload`: bot-defined, max 128 bytes. Use for item_id + user_id + transaction_ref

### Alternative: `createInvoiceLink` (for Mini App)

```http
POST https://api.telegram.org/bot<TOKEN>/createInvoiceLink
Content-Type: application/json

{
  "title": "Кофе",
  "description": "Мгновенный прилив энергии",
  "payload": "coffee|user_123|uuid_v4",
  "provider_token": "",
  "currency": "XTR",
  "prices": [{"label": "Кофе", "amount": 10}]
}
```

Response: `{"ok":true,"result":"https://t.me/$<bot_username>?start=<param>"}`  
Open this link in Mini App via `Telegram.WebApp.openInvoice()`.

---

## Step 2: Handle `pre_checkout_query`

Telegram sends this **before** charging the user. Bot must respond within **10 seconds**.

```http
POST https://api.telegram.org/bot<TOKEN>/answerPreCheckoutQuery
Content-Type: application/json

{
  "pre_checkout_query_id": "<query_id_from_update>",
  "ok": true
}
```

**Validation logic (do before answering ok):**
1. Parse `pre_checkout_query.invoice_payload`
2. Verify item exists in catalog
3. Verify price matches current tier price
4. Check user not banned / flagged
5. Idempotency: check `transaction_ref` not already processed

**If validation fails:**
```json
{
  "pre_checkout_query_id": "<query_id>",
  "ok": false,
  "error_message": "Товар временно недоступен. Попробуйте позже."
}
```

---

## Step 3: Handle `successful_payment`

Telegram sends this as a `Message` with `successful_payment` field after user confirms.

```javascript
// Webhook payload structure
{
  "update_id": 123456789,
  "message": {
    "message_id": 42,
    "from": {"id": 123456789, ...},
    "date": 1715000000,
    "successful_payment": {
      "currency": "XTR",
      "total_amount": 10,
      "invoice_payload": "coffee|user_123|uuid_v4",
      "telegram_payment_charge_id": "XTR_1234567890_abcdef",
      "provider_payment_charge_id": ""
    }
  }
}
```

**Processing steps:**
1. Extract `telegram_payment_charge_id` — unique payment ID
2. Parse payload: `item_id|user_id|transaction_ref`
3. Idempotency check: skip if `telegram_payment_charge_id` already in DB
4. Grant item to user (update balance/inventory in PostgreSQL)
5. Log transaction
6. Send confirmation message to user

**Database schema (suggested):**
```sql
CREATE TABLE star_payments (
  id SERIAL PRIMARY KEY,
  telegram_payment_charge_id VARCHAR(64) UNIQUE NOT NULL,
  user_id BIGINT NOT NULL,
  item_id VARCHAR(32) NOT NULL,
  stars_amount INTEGER NOT NULL,
  payload VARCHAR(128) NOT NULL,
  status VARCHAR(16) DEFAULT 'completed', -- completed, refunded
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_star_payments_charge_id ON star_payments(telegram_payment_charge_id);
CREATE INDEX idx_star_payments_user_id ON star_payments(user_id);
```

---

## Step 4: Stars → Developer Balance

### How it works

1. Users buy Stars from Telegram (via in-app purchase, Apple/Google pay)
2. Users spend Stars in your bot
3. Telegram credits your bot's **Stars balance**
4. You convert Stars to real money

### Checking balance

```http
POST https://api.telegram.org/bot<TOKEN>/getStarTransactions
Content-Type: application/json

{
  "offset": 0,
  "limit": 100
}
```

### Withdrawal options

| Method | Process | Fees | Speed |
|--------|---------|------|-------|
| **Fragment** | Sell Stars for TON on Fragment.com | ~5-10% spread | Instant |
| **TON → Exchange** | Send TON to CEX (Bybit, OKX, etc.) | Network fee ~0.05 TON | 5-30 min |
| **Direct (if available)** | Telegram may offer direct withdrawal | Varies | Varies |

**Fragment process:**
1. Go to [fragment.com](https://fragment.com)
2. Connect with your bot's Telegram account
3. Sell Stars balance for TON
4. Withdraw TON to wallet or exchange

**Important:** Stars are non-refundable by default. Use `refundStarPayment` only for actual disputes.

---

## Step 5: Refunds

```http
POST https://api.telegram.org/bot<TOKEN>/refundStarPayment
Content-Type: application/json

{
  "user_id": 123456789,
  "telegram_payment_charge_id": "XTR_1234567890_abcdef"
}
```

**When to refund:**
- User complains about accidental purchase
- Item could not be delivered (bug)
- Fraud detected

**Note:** Refunded Stars return to user's balance. Your developer balance is reduced.

---

## Mock Mode (MVP Default)

For development without real Stars:

```javascript
// In bot-webhook.js
const MOCK_MODE = process.env.MOCK_MODE === 'true';

if (MOCK_MODE) {
  // Simulate successful payment immediately after pre_checkout_query
  // Skip actual Telegram charge, grant item directly
}
```

Mock flow:
1. Frontend calls backend `/api/mock/purchase`
2. Backend validates, grants item, returns success
3. No Telegram API calls made
4. Log mock transaction with `mock: true` flag

Switch to production:
```bash
MOCK_MODE=false
```

---

## Testing

### Test environment
- Use Telegram test servers (requires test bot token from @BotFather)
- Or use Mock Mode for local development

### Test checklist
- [ ] Invoice renders with Star icon
- [ ] `pre_checkout_query` arrives within 2 seconds
- [ ] Payment confirmation updates user balance
- [ ] Duplicate `successful_payment` is idempotent
- [ ] Refund flow works (if implemented)
- [ ] Mock mode toggles correctly

---

## API Reference Summary

| Endpoint | Purpose |
|----------|---------|
| `sendInvoice` | Send payment invoice to user |
| `createInvoiceLink` | Generate invoice URL for Mini App |
| `answerPreCheckoutQuery` | Confirm or reject pending payment |
| `refundStarPayment` | Refund a completed Stars payment |
| `getStarTransactions` | List Stars transactions |

---

## Security Checklist

- [ ] Validate all prices server-side — never trust client
- [ ] Idempotency on `telegram_payment_charge_id`
- [ ] Rate limit: max 10 purchases / minute / user
- [ ] Log all payment events
- [ ] Alert on payment anomalies (spike in refunds, etc.)

---

*Last updated: 2026-05-05*
