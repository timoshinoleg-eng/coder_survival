import { Router } from 'express';
import { pool } from '../index.js';
import { claimDailyQuest, getDailyQuestSummary } from '../utils/vnext.js';

const router = Router();

router.get('/daily', async (req, res, next) => {
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

      const summary = await getDailyQuestSummary(client, userResult.rows[0].id);
      res.json({
        success: true,
        daily: summary
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/claim', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  const { questId } = req.body || {};
  if (!questId) {
    return res.status(400).json({ error: 'questId is required' });
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

      const result = await claimDailyQuest(client, userResult.rows[0].id, Number(questId));
      if (result.error) {
        await client.query('ROLLBACK');
        return res.status(result.status).json({ error: result.error });
      }

      await client.query('COMMIT');
      res.json({
        success: true,
        reward: result.reward,
        bonusReward: result.bonusReward,
        daily: result.summary
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
