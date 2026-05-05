/**
 * Bot webhook handlers for Telegram Stars payments
 * Coder Survival — Monetization Layer
 *
 * Endpoints:
 *   POST /webhook/telegram — main webhook from Telegram
 *
 * Environment:
 *   MOCK_MODE=true  — simulate payments (default for MVP)
 *   MOCK_MODE=false — real Telegram Stars processing
 */

const express = require('express');
const router = express.Router();

// ─── Config ───────────────────────────────────────────────────────────
const MOCK_MODE = process.env.MOCK_MODE === 'true' || true; // default mock
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || null;

// ─── In-memory mock store (replace with PostgreSQL in production) ───
const mockTransactions = new Map(); // transaction_ref -> {status, item_id, user_id}

// ─── Helper: parse invoice payload ──────────────────────────────────
function parsePayload(payload) {
  // Format: "item_id|user_id|transaction_ref"
  const parts = payload.split('|');
  return {
    item_id: parts[0] || 'unknown',
    user_id: parts[1] || '0',
    transaction_ref: parts[2] || `mock_${Date.now()}`
  };
}

// ─── Helper: get price for user's tier ──────────────────────────────
function getPrice(item_id, tier) {
  const prices = require('./prices.json');
  const item = prices.items.find(i => i.id === item_id);
  if (!item) return null;
  const tierKey = tier || 'tier1';
  return item[tierKey] || item.stars;
}

// ─── Helper: log payment event ─────────────────────────────────────
function logPayment(level, data) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    ...data
  };
  console.log(JSON.stringify(entry));
  // TODO: send to centralized logging (Loki / CloudWatch)
}

// ─── POST /webhook/telegram ─────────────────────────────────────────
router.post('/telegram', async (req, res) => {
  try {
    const update = req.body;

    // ── pre_checkout_query ─────────────────────────────────────────
    if (update.pre_checkout_query) {
      const query = update.pre_checkout_query;
      const { item_id, user_id, transaction_ref } = parsePayload(query.invoice_payload);

      logPayment('info', {
        event: 'pre_checkout_query',
        query_id: query.id,
        user_id: query.from.id,
        item_id,
        total_amount: query.total_amount,
        currency: query.currency
      });

      // Validation
      const price = getPrice(item_id, 'tier1'); // TODO: resolve actual user tier
      if (!price) {
        logPayment('warn', { event: 'invalid_item', item_id, query_id: query.id });
        return res.json({
          ok: false,
          error_message: 'Товар не найден в каталоге.'
        });
      }

      if (query.currency !== 'XTR') {
        logPayment('warn', { event: 'invalid_currency', currency: query.currency });
        return res.json({
          ok: false,
          error_message: 'Неподдерживаемая валюта.'
        });
      }

      // Idempotency check
      if (mockTransactions.has(transaction_ref)) {
        logPayment('warn', { event: 'duplicate_pre_checkout', transaction_ref });
        return res.json({ ok: false, error_message: 'Эта транзакция уже обработана.' });
      }

      // Mock mode: store pending transaction
      if (MOCK_MODE) {
        mockTransactions.set(transaction_ref, {
          status: 'pending',
          item_id,
          user_id: query.from.id,
          amount: query.total_amount,
          created_at: Date.now()
        });
      }

      // Answer OK to Telegram
      return res.json({ ok: true });
    }

    // ── successful_payment ─────────────────────────────────────────
    if (update.message?.successful_payment) {
      const payment = update.message.successful_payment;
      const { item_id, user_id, transaction_ref } = parsePayload(payment.invoice_payload);
      const charge_id = payment.telegram_payment_charge_id;

      logPayment('info', {
        event: 'successful_payment',
        charge_id,
        user_id: update.message.from.id,
        item_id,
        amount: payment.total_amount,
        currency: payment.currency
      });

      // Idempotency: skip if already processed
      if (mockTransactions.has(transaction_ref) && mockTransactions.get(transaction_ref).status === 'completed') {
        logPayment('warn', { event: 'duplicate_payment', charge_id, transaction_ref });
        return res.sendStatus(200);
      }

      // Grant item to user
      try {
        await grantItemToUser(user_id, item_id, {
          charge_id,
          transaction_ref,
          amount: payment.total_amount,
          currency: payment.currency
        });

        // Mark completed
        if (MOCK_MODE) {
          mockTransactions.set(transaction_ref, {
            status: 'completed',
            item_id,
            user_id: update.message.from.id,
            amount: payment.total_amount,
            completed_at: Date.now()
          });
        }

        // Notify admin
        if (ADMIN_CHAT_ID) {
          await notifyAdmin(`✅ Покупка: ${item_id} за ${payment.total_amount}⭐ от user ${user_id}`);
        }

        return res.sendStatus(200);
      } catch (err) {
        logPayment('error', { event: 'grant_failed', charge_id, error: err.message });
        // Still return 200 to Telegram to prevent retries
        // But log for manual review
        return res.sendStatus(200);
      }
    }

    // ── Other updates ──────────────────────────────────────────────
    return res.sendStatus(200);

  } catch (err) {
    logPayment('error', { event: 'webhook_error', error: err.message, stack: err.stack });
    return res.sendStatus(500);
  }
});

// ─── Helper: grant item to user (replace with DB call) ──────────────
async function grantItemToUser(user_id, item_id, paymentMeta) {
  // TODO: Implement actual DB update
  // Example:
  // await db.query(
  //   'INSERT INTO user_inventory (user_id, item_id, quantity, source) VALUES ($1, $2, 1, $3)',
  //   [user_id, item_id, 'stars_purchase']
  // );
  // await db.query(
  //   'INSERT INTO star_payments (telegram_payment_charge_id, user_id, item_id, stars_amount, payload) VALUES ($1, $2, $3, $4, $5)',
  //   [paymentMeta.charge_id, user_id, item_id, paymentMeta.amount, paymentMeta.transaction_ref]
  // );

  console.log(`[GRANT] user=${user_id} item=${item_id} meta=${JSON.stringify(paymentMeta)}`);
}

// ─── Helper: notify admin via Telegram ──────────────────────────────
async function notifyAdmin(text) {
  // TODO: Implement bot.sendMessage(ADMIN_CHAT_ID, text)
  console.log(`[ADMIN] ${text}`);
}

// ─── Mock purchase endpoint (for development) ─────────────────────
router.post('/mock/purchase', async (req, res) => {
  if (!MOCK_MODE) {
    return res.status(403).json({ error: 'Mock mode disabled' });
  }

  const { user_id, item_id, tier } = req.body;
  if (!user_id || !item_id) {
    return res.status(400).json({ error: 'user_id and item_id required' });
  }

  const transaction_ref = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const price = getPrice(item_id, tier);

  if (!price) {
    return res.status(400).json({ error: 'Item not found' });
  }

  // Simulate full flow
  mockTransactions.set(transaction_ref, {
    status: 'completed',
    item_id,
    user_id,
    amount: price,
    completed_at: Date.now()
  });

  await grantItemToUser(user_id, item_id, {
    charge_id: `MOCK_${transaction_ref}`,
    transaction_ref,
    amount: price,
    currency: 'XTR'
  });

  logPayment('info', {
    event: 'mock_purchase',
    user_id,
    item_id,
    amount: price,
    transaction_ref
  });

  res.json({
    success: true,
    transaction_ref,
    item_id,
    stars_deducted: price,
    mock: true
  });
});

// ─── Health check ───────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mock_mode: MOCK_MODE,
    pending_transactions: mockTransactions.size
  });
});

module.exports = router;
