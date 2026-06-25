import { Router } from 'express';
import { pool } from '../index.js';
import { dismissContextOffer, isValidOfferType } from '../utils/offers.js';

const router = Router();

router.post('/dismiss', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  const offerType = req.body?.offerType;
  if (!isValidOfferType(offerType)) {
    return res.status(400).json({ error: 'Invalid offerType' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        `SELECT id FROM users WHERE telegram_id = $1`,
        [telegramUser.id]
      );

      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }

      const userId = userResult.rows[0].id;
      const result = await dismissContextOffer(client, userId, offerType);
      if (result.error) {
        await client.query('ROLLBACK');
        return res.status(result.status || 400).json({ error: result.error });
      }

      await client.query('COMMIT');
      res.json({ success: true, offerType: result.offerType, dismissedAt: result.dismissedAt });
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

router.post('/click', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  const { offerType, source } = req.body || {};
  if (!isValidOfferType(offerType)) {
    return res.status(400).json({ error: 'Invalid offerType' });
  }

  try {
    const client = await pool.connect();
    try {
      const userResult = await client.query(
        `SELECT id FROM users WHERE telegram_id = $1`,
        [telegramUser.id]
      );
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      const userId = userResult.rows[0].id;

      await client.query(
        `INSERT INTO audit_logs (user_id, action, context)
         VALUES ($1, 'offer_clicked', $2::jsonb)`,
        [userId, JSON.stringify({ offerType, source: source || 'tap' })]
      );

      res.json({ success: true });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Failed to log offer_clicked:', err);
    next(err);
  }
});

export default router;
