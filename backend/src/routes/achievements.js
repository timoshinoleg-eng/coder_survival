import { Router } from 'express';
import { pool } from '../index.js';
import {
  getAchievementsWithProgress,
  claimAchievement,
  markNotificationsRead,
} from '../utils/achievementsEngine.js';

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

      const rows = await getAchievementsWithProgress(userId);
      const achievements = rows.map((r) => {
        const isSecretAndLocked = r.is_secret && !r.earned_at;
        return {
          slug: r.slug,
          name: isSecretAndLocked ? '???' : r.name,
          description: isSecretAndLocked ? 'Secret achievement' : r.description,
          category: r.category,
          rarity: r.rarity,
          trigger_type: r.trigger_type,
          is_progressive: r.is_progressive,
          criteria: isSecretAndLocked ? null : r.criteria,
          reward: isSecretAndLocked ? null : r.reward,
          earned_at: r.earned_at,
          claimed_at: r.claimed_at,
          notification_sent: r.notification_sent,
          current_value: r.current_value,
          target_value: r.target_value,
          percent: r.percent,
        };
      });

      return res.json({ achievements });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.get('/my', async (req, res, next) => {
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

      const rows = await getAchievementsWithProgress(userId);
      const earned = rows
        .filter((r) => r.earned_at)
        .map((r) => ({
          slug: r.slug,
          name: r.name,
          rarity: r.rarity,
          earned_at: r.earned_at,
          claimed_at: r.claimed_at,
          notification_sent: r.notification_sent,
        }));

      return res.json({ earned });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/:slug/claim', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  const { slug } = req.params;
  if (!slug || !/^[a-z0-9_]+$/.test(slug)) {
    return next({ status: 400, message: 'Invalid slug format' });
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

      const result = await claimAchievement(userId, slug);
      return res.json(result);
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/read', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  const { slugs } = req.body;
  if (!Array.isArray(slugs) || slugs.length === 0) {
    return next({ status: 400, message: 'slugs array required' });
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

      const result = await markNotificationsRead(userId, slugs);
      return res.json(result);
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
