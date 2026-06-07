import { Router } from 'express';
import { pool } from '../index.js';
import { ensurePlayerLevel, resolveCareerRank, addPlayerXp } from '../utils/vnext.js';

const router = Router();
const VALID_XP_SOURCES = ['tap', 'minigame', 'quest', 'streak'];

router.get('/', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
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

      const level = await ensurePlayerLevel(client, userResult.rows[0].id);
      res.json({
        success: true,
        level: level.resolved
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/xp', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  const amount = Number(req.body?.amount);
  const source = typeof req.body?.source === 'string' ? req.body.source : '';

  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive integer' });
  }

  if (!VALID_XP_SOURCES.includes(source)) {
    return res.status(400).json({ error: `source must be one of: ${VALID_XP_SOURCES.join(', ')}` });
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
      const record = await addPlayerXp(client, userId, amount);

      await client.query(
        `INSERT INTO player_xp_log (user_id, source, amount)
         VALUES ($1, $2, $3)`,
        [userId, source, amount]
      );

      await client.query('COMMIT');

      const career = resolveCareerRank(record.xp_total);

      res.json({
        success: true,
        xpTotal: record.xp_total,
        xpDelta: amount,
        source,
        career
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

router.get('/rank', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
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
      const level = await ensurePlayerLevel(client, userId);
      const career = resolveCareerRank(level.xp_total);

      res.json({
        success: true,
        rank: career.rank,
        xp: career.xpTotal,
        xpToNextRank: career.xpToNextRank,
        activeBonuses: career.bonuses
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
