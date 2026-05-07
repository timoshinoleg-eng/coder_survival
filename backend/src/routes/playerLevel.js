import { Router } from 'express';
import { pool } from '../index.js';
import { ensurePlayerLevel } from '../utils/vnext.js';

const router = Router();

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

export default router;
