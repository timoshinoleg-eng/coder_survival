import { Router } from 'express';
import { pool } from '../index.js';
import { applyItemEffect } from './buy.js';
import { getProductById } from '../utils/shopCatalog.js';
import { sendAlert } from '../utils/alertSender.js';
import { arePaymentsEnabled, paymentsDisabledResponse } from '../config/payments.js';
import { secretsMatch } from '../utils/secretCompare.js';

const router = Router();

const BOT_BACKEND_SECRET = process.env.BOT_BACKEND_SECRET;

function parseInvoicePayload(payload) {
  const match = /^purchase:(\d+):([a-z_]+)$/.exec(payload || '');
  if (!match) {
    return null;
  }

  return {
    purchaseId: Number(match[1]),
    itemType: match[2]
  };
}

/**
 * Invoice context feeds Telegram invoice creation, so it is a *new charge* path
 * and is fully gated. Auth is still checked first so an unauthenticated caller
 * cannot use the payment-state response as an oracle.
 */
router.post('/telegram/invoice-context', async (req, res, next) => {
  const headerSecret = req.get('X-Bot-Backend-Secret');
  if (!secretsMatch(headerSecret, BOT_BACKEND_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!arePaymentsEnabled()) {
    return res.status(403).json(paymentsDisabledResponse());
  }

  const { invoicePayload } = req.body || {};
  if (!invoicePayload) {
    return res.status(400).json({ error: 'Missing invoicePayload' });
  }

  const parsed = parseInvoicePayload(invoicePayload);
  if (!parsed) {
    return res.status(400).json({ error: 'Invalid invoice payload format' });
  }

  try {
    const client = await pool.connect();
    try {
      const purchaseResult = await client.query(
        `SELECT id, item_type, stars_amount, status
         FROM purchases
         WHERE id = $1 AND item_type = $2`,
        [parsed.purchaseId, parsed.itemType]
      );

      if (purchaseResult.rows.length === 0) {
        return res.status(404).json({ error: 'Purchase not found' });
      }

      const purchase = purchaseResult.rows[0];
      if (purchase.status === 'completed') {
        return res.status(409).json({ error: 'Purchase already completed' });
      }

      const product = getProductById(purchase.item_type);
      if (!product) {
        return res.status(409).json({ error: 'Catalog item not found for purchase' });
      }

      return res.status(200).json({
        purchase: {
          id: purchase.id,
          itemType: purchase.item_type,
          starsAmount: purchase.stars_amount,
          status: purchase.status
        },
        invoice: {
          title: product.name,
          description: product.description,
          payload: invoicePayload,
          currency: 'XTR',
          prices: [
            { label: product.name, amount: purchase.stars_amount }
          ]
        }
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * Fulfillment of an ALREADY-CHARGED payment.
 *
 * This endpoint is deliberately NOT gated by the payments kill switch. The
 * switch exists to stop *new* charges; refusing here would strand a user who
 * was already debited by Telegram — charge-without-delivery, which is strictly
 * worse than the thing we are preventing. Without an automatic refund path, the
 * only honest response to a real, secret-authenticated, amount-matched payment
 * is to deliver what was paid for, idempotently.
 *
 * Arrival while disabled is still an anomaly (it means a charge slipped through
 * the race between checkout and the flag flip), so we raise a redacted alert.
 */
router.post('/telegram/confirm', async (req, res, next) => {
  const headerSecret = req.get('X-Bot-Backend-Secret');
  if (!secretsMatch(headerSecret, BOT_BACKEND_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const paymentsWereDisabled = !arePaymentsEnabled();

  const {
    telegramUserId,
    telegramPaymentChargeId,
    providerPaymentChargeId,
    invoicePayload,
    totalAmount,
    currency,
    rawPayment
  } = req.body || {};

  if (!telegramUserId || !telegramPaymentChargeId || !invoicePayload || !totalAmount || !currency) {
    return res.status(400).json({ error: 'Missing required payment fields' });
  }

  const parsed = parseInvoicePayload(invoicePayload);
  if (!parsed) {
    return res.status(400).json({ error: 'Invalid invoice payload format' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existingPayment = await client.query(
        `SELECT id, user_id, purchase_id, item_type, stars_amount
         FROM star_payments
         WHERE telegram_payment_charge_id = $1`,
        [telegramPaymentChargeId]
      );

      if (existingPayment.rows.length > 0) {
        await client.query('COMMIT');
        if (paymentsWereDisabled) {
          alertPaymentWhileDisabled({ itemType: parsed.itemType, idempotent: true });
        }
        return res.status(200).json({
          success: true,
          idempotent: true,
          payment: existingPayment.rows[0],
          ...(paymentsWereDisabled ? { paymentsDisabled: true } : {})
        });
      }

      const userResult = await client.query(
        `SELECT id FROM users WHERE telegram_id = $1`,
        [telegramUserId]
      );

      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }

      const userId = userResult.rows[0].id;

      // Serialize paid fulfillment per user so two simultaneous first purchases
      // cannot both observe an empty payment history and both receive the x2 bonus.
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [userId]);

      const purchaseResult = await client.query(
        `SELECT id, user_id, item_type, stars_amount, status
         FROM purchases
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [parsed.purchaseId, userId]
      );

      if (purchaseResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Purchase not found' });
      }

      const purchase = purchaseResult.rows[0];

      if (purchase.item_type !== parsed.itemType) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Purchase payload mismatch' });
      }

      if (purchase.stars_amount !== totalAmount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Amount mismatch' });
      }

      const product = getProductById(parsed.itemType);
      const priorPaidPurchase = await client.query(
        `SELECT 1
         FROM star_payments
         WHERE user_id = $1
           AND status IN ('completed', 'refunded')
         LIMIT 1`,
        [userId]
      );
      const firstPurchaseBonusApplied = (
        product?.first_purchase_bonus === true
        && priorPaidPurchase.rows.length === 0
      );

      await applyItemEffect(client, userId, parsed.itemType);
      if (firstPurchaseBonusApplied) {
        // The catalog flag is intentionally opt-in. Calling the same server-side
        // effect twice keeps fulfillment authoritative and gives an exact x2
        // reward while preserving each effect's normal caps (for example energy).
        await applyItemEffect(client, userId, parsed.itemType);
        await client.query(
          `INSERT INTO audit_logs (user_id, action, context)
           VALUES ($1, 'first_purchase_bonus', $2::jsonb)`,
          [
            userId,
            JSON.stringify({
              purchaseId: purchase.id,
              itemType: parsed.itemType,
              multiplier: 2
            })
          ]
        );
      }

      await client.query(
        `UPDATE purchases
         SET status = 'completed'
         WHERE id = $1`,
        [purchase.id]
      );

      const paymentInsert = await client.query(
        `INSERT INTO star_payments (
            user_id,
            purchase_id,
            telegram_payment_charge_id,
            provider_payment_charge_id,
            invoice_payload,
            item_type,
            stars_amount,
            currency,
            status,
            raw_payload
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed', $9)
         RETURNING id, purchase_id, item_type, stars_amount, currency, status, created_at`,
        [
          userId,
          purchase.id,
          telegramPaymentChargeId,
          providerPaymentChargeId || null,
          invoicePayload,
          parsed.itemType,
          totalAmount,
          currency,
          rawPayment || null
        ]
      );

      await client.query('COMMIT');
      if (paymentsWereDisabled) {
        alertPaymentWhileDisabled({ itemType: parsed.itemType, idempotent: false });
      }
      return res.status(200).json({
        success: true,
        idempotent: false,
        firstPurchaseBonusApplied,
        payment: paymentInsert.rows[0],
        ...(paymentsWereDisabled ? { paymentsDisabled: true } : {})
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    trackPaymentFailure(err);
    next(err);
  }
});

/**
 * Redacted anomaly alert: a real payment landed while payments were disabled.
 *
 * Deliberately carries NO raw identifiers — no Telegram user id, no charge id,
 * no invoice payload, no rawPayment. The item type is a catalog slug (already
 * public, e.g. "energy_refill") and the idempotent flag distinguishes a replay
 * from a first delivery; together they are enough to investigate without
 * copying payment identifiers into an outbound Telegram message or the logs.
 */
function alertPaymentWhileDisabled({ itemType, idempotent }) {
  const kind = idempotent ? 'replayed' : 'newly fulfilled';
  console.warn(
    `[payments] Payment ${kind} while PAYMENTS_ENABLED is not "true" ` +
      `(item: ${itemType}). Already-charged payment was honoured to avoid ` +
      'charge-without-delivery. Identifiers intentionally omitted.'
  );
  sendAlert(
    `Payment arrived while payments are DISABLED (${kind}). Item: ${itemType}. ` +
      'The charge was honoured to avoid charge-without-delivery. ' +
      'Investigate why a checkout completed in non-commercial test mode.'
  );
}

/**
 * POST /api/internal/payments/telegram/refund
 * Bot-side wrapper: the bot calls refundStarPayments() on the Bot API FIRST,
 * and only after Telegram accepts the refund does it record it here.
 * Idempotent: a charge that was already refunded returns 200 { alreadyRefunded: true }.
 *
 * Item effects are deliberately NOT reversed (consumables like energy cannot be
 * un-consumed; cosmetics are kept per standard Telegram refund practice) — the
 * ledger marks the money side only, plus an audit entry with the operator reason.
 */
router.post('/telegram/refund', async (req, res, next) => {
  const headerSecret = req.get('X-Bot-Backend-Secret');
  if (!secretsMatch(headerSecret, BOT_BACKEND_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { telegramPaymentChargeId, telegramUserId, reason } = req.body || {};
  if (!telegramPaymentChargeId || !telegramUserId) {
    return res.status(400).json({ error: 'telegramPaymentChargeId and telegramUserId are required' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const paymentResult = await client.query(
        `SELECT sp.id AS star_payment_id, sp.user_id, sp.purchase_id, sp.item_type, sp.stars_amount, sp.status,
                u.telegram_id
         FROM star_payments sp
         JOIN users u ON u.id = sp.user_id
         WHERE sp.telegram_payment_charge_id = $1
         FOR UPDATE OF sp`,
        [telegramPaymentChargeId]
      );
      if (paymentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Charge not found' });
      }
      const payment = paymentResult.rows[0];

      if (Number(payment.telegram_id) !== Number(telegramUserId)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Charge does not belong to this Telegram user' });
      }

      if (payment.status === 'refunded') {
        await client.query('COMMIT'); // no-op transaction
        return res.status(200).json({ success: true, alreadyRefunded: true });
      }

      await client.query(
        `UPDATE star_payments SET status = 'refunded' WHERE id = $1`,
        [payment.star_payment_id]
      );
      if (payment.purchase_id) {
        await client.query(
          `UPDATE purchases SET status = 'refunded' WHERE id = $1 AND status = 'completed'`,
          [payment.purchase_id]
        );
      }
      await client.query(
        `INSERT INTO audit_logs (user_id, action, context)
         VALUES ($1, 'payment_refund', $2::jsonb)`,
        [
          payment.user_id,
          JSON.stringify({
            itemType: payment.item_type,
            stars: payment.stars_amount,
            reason: String(reason || '').slice(0, 200) || null
          })
        ]
      );

      await client.query('COMMIT');
      return res.status(200).json({
        success: true,
        refunded: true,
        starsAmount: payment.stars_amount,
        itemType: payment.item_type
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// --- Payment failure rate tracking ---
const _paymentFailures = [];

function trackPaymentFailure(err) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000; // 10 minutes
  _paymentFailures.push(now);

  // Prune old entries
  while (_paymentFailures.length > 0 && _paymentFailures[0] < now - windowMs) {
    _paymentFailures.shift();
  }

  if (_paymentFailures.length >= 3) {
    const count = _paymentFailures.length;
    _paymentFailures.length = 0;
    sendAlert(`Payment failures spike: ${count} failures in 10 min. Latest: ${err.message}`);
  }
}

export default router;
