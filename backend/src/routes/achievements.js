import { Router } from 'express';
import { pool } from '../index.js';
import { getUserAchievements } from '../utils/phase2State.js';

const router = Router();

router.get('/', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
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
      const achievements = await getUserAchievements(client, userId);
      return res.json({ achievements });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
