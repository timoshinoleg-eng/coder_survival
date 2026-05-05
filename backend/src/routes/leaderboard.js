import { Router } from 'express';
import { pool } from '../index.js';

const router = Router();

/**
 * GET /api/leaderboard — топ игроков
 * Query: ?limit=50&period=all|week|today
 */
router.get('/', async (req, res, next) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const period = req.query.period || 'all';

  try {
    const client = await pool.connect();
    try {
      let query;
      let params = [limit];

      if (period === 'today') {
        // Лидерборд за сегодня по коммитам в сессиях
        query = `
          SELECT 
            u.id,
            u.telegram_id,
            u.username,
            u.first_name,
            COALESCE(SUM(s.commits_earned), 0) as commits_today,
            COALESCE(SUM(s.taps_count), 0) as taps_today
          FROM users u
          LEFT JOIN sessions s ON s.user_id = u.id AND s.started_at >= CURRENT_DATE
          GROUP BY u.id, u.telegram_id, u.username, u.first_name
          HAVING COALESCE(SUM(s.commits_earned), 0) > 0
          ORDER BY commits_today DESC
          LIMIT $1
        `;
      } else if (period === 'week') {
        // За неделю
        query = `
          SELECT 
            u.id,
            u.telegram_id,
            u.username,
            u.first_name,
            COALESCE(SUM(s.commits_earned), 0) as commits_week,
            p.tier,
            p.streak_days
          FROM users u
          LEFT JOIN sessions s ON s.user_id = u.id AND s.started_at >= CURRENT_DATE - INTERVAL '7 days'
          LEFT JOIN progression p ON p.user_id = u.id
          GROUP BY u.id, u.telegram_id, u.username, u.first_name, p.tier, p.streak_days
          HAVING COALESCE(SUM(s.commits_earned), 0) > 0
          ORDER BY commits_week DESC
          LIMIT $1
        `;
      } else {
        // За всё время
        query = `
          SELECT 
            u.id,
            u.telegram_id,
            u.username,
            u.first_name,
            p.tier,
            p.commits_total,
            p.streak_days
          FROM users u
          JOIN progression p ON p.user_id = u.id
          ORDER BY p.commits_total DESC
          LIMIT $1
        `;
      }

      const result = await client.query(query, params);

      res.json({
        period,
        limit,
        count: result.rows.length,
        players: result.rows.map((row, index) => ({
          rank: index + 1,
          userId: row.id,
          telegramId: row.telegram_id,
          username: row.username,
          firstName: row.first_name,
          tier: row.tier,
          tierName: getTierName(row.tier),
          commits: parseInt(row.commits_total || row.commits_today || row.commits_week || 0),
          streakDays: row.streak_days || 0
        }))
      });

    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

function getTierName(tier) {
  const names = {
    1: 'Junior',
    2: 'Middle',
    3: 'Senior',
    4: 'Lead',
    5: 'CTO'
  };
  return names[tier] || 'Unknown';
}

export default router;
