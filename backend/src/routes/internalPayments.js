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

      await applyItemEffect(client, userId, parsed.itemType);

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
