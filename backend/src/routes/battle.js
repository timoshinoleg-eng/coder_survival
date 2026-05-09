import { Router } from 'express';
import { pool } from '../index.js';
import { BATTLE_REWARD_PREVIEW } from '../config/balance.js';
import { distributeBattleRewards } from '../utils/battleDistribution.js';

const router = Router();

/**
 * GET /api/battle/today
 * Lazy daily battle — no cron, computed on-the-fly from sessions today.
 * Returns top players, current user's position, and time until reset.
 */
router.get('/today', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;

  try {
    const client = await pool.connect();
    try {
      const topResult = await client.query(`
        SELECT 
          u.id,
          u.telegram_id,
          u.username,
          u.first_name,
          COALESCE(SUM(s.commits_earned), 0) as commits_today
        FROM users u
        LEFT JOIN sessions s ON s.user_id = u.id AND s.started_at >= CURRENT_DATE
        GROUP BY u.id, u.telegram_id, u.username, u.first_name
        HAVING COALESCE(SUM(s.commits_earned), 0) > 0
        ORDER BY commits_today DESC
        LIMIT 10
      `);

      const topPlayers = topResult.rows.map((row, idx) => ({
        rank: idx + 1,
        userId: row.id,
        telegramId: row.telegram_id,
        username: row.username,
        firstName: row.first_name,
        commitsToday: parseInt(row.commits_today, 10)
      }));

      let myPosition = null;
      if (telegramUser) {
        const userResult = await client.query(
          `SELECT id FROM users WHERE telegram_id = $1`,
          [telegramUser.id]
        );
        if (userResult.rows.length > 0) {
          const myUserId = userResult.rows[0].id;
          const allResult = await client.query(`
            SELECT 
              u.id,
              u.telegram_id,
              u.username,
              u.first_name,
              COALESCE(SUM(s.commits_earned), 0) as commits_today
            FROM users u
            LEFT JOIN sessions s ON s.user_id = u.id AND s.started_at >= CURRENT_DATE
            GROUP BY u.id, u.telegram_id, u.username, u.first_name
            HAVING COALESCE(SUM(s.commits_earned), 0) > 0
            ORDER BY commits_today DESC
          `);

          const idx = allResult.rows.findIndex(r => r.id === myUserId);
          if (idx >= 0) {
            const around = 2;
            const start = Math.max(0, idx - around);
            const end = Math.min(allResult.rows.length, idx + around + 1);
            myPosition = {
              rank: idx + 1,
              commitsToday: parseInt(allResult.rows[idx].commits_today, 10),
              players: allResult.rows.slice(start, end).map((r, i) => ({
                rank: start + i + 1,
                userId: r.id,
                telegramId: r.telegram_id,
                username: r.username,
                firstName: r.first_name,
                commitsToday: parseInt(r.commits_today, 10),
                isMe: r.id === myUserId
              }))
            };
          }
        }
      }

      const now = new Date();
      const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const timeUntilReset = Math.max(0, midnight.getTime() - now.getTime());

      res.json({
        topPlayers,
        myPosition,
        timeUntilReset,
        rewardPreview: BATTLE_REWARD_PREVIEW
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/battle/distribute
 * Admin/cron-only: distribute yesterday's battle rewards.
 * Protected by BOT_BACKEND_SECRET header.
 */
const BOT_BACKEND_SECRET = process.env.BOT_BACKEND_SECRET;

router.post('/distribute', async (req, res, next) => {
  const headerSecret = req.get('X-Bot-Backend-Secret');
  if (!BOT_BACKEND_SECRET || headerSecret !== BOT_BACKEND_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { date } = req.body || {};

  try {
    const client = await pool.connect();
    try {
      const result = await distributeBattleRewards(client, date ? new Date(date) : null);
      res.json({
        success: true,
        ...result
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
