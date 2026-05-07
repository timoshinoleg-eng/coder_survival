import { Router } from 'express';
import { pool } from '../index.js';
import { getPassStatus, claimPassReward } from '../utils/pass.js';
import { getProductById } from '../utils/shopCatalog.js';

const router = Router();

/**
 * GET /api/pass/status
 */
router.get('/status', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Unauthorized' });
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

      const status = await getPassStatus(client, userResult.rows[0].id);
      res.json({
        success: true,
        status: status ? {
          ...status,
          premiumPassProduct: getProductById('premium_pass')
        } : null
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/pass/claim
 * Body: { level: number, track: 'free' | 'premium' }
 */
router.post('/claim', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { level, track } = req.body || {};
  if (!level || !['free', 'premium'].includes(track)) {
    return res.status(400).json({ error: 'Invalid level or track' });
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

      const result = await claimPassReward(client, userResult.rows[0].id, Number(level), track);
      if (result.error) {
        await client.query('ROLLBACK');
        return res.status(result.status).json({ error: result.error });
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        level,
        track,
        reward: result.reward,
        applied: result.applied
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

export default router;
