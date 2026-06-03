import { Router } from 'express';
import { pool } from '../index.js';
import { getRankXpBounds } from '../utils/vnext.js';

const router = Router();

/**
 * GET /api/leaderboard — топ игроков
 * Query: ?limit=50&period=all|week|today&rank=1|2|3|4|5&aroundMe=1
 */
router.get('/', async (req, res, next) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const period = req.query.period || 'all';
  const rankFilter = req.query.rank ? parseInt(req.query.rank, 10) : null;
  const aroundMe = req.query.aroundMe === '1';
  const telegramUser = req.telegramUser?.user;

  try {
    const client = await pool.connect();
    try {
      let query;
      let params = [limit];
      let paramIndex = 1; // $1 is already used for limit

      // Build rank filter using parameterized queries (not template literals)
      let rankWhereClause = '';
      if (rankFilter) {
        const bounds = getRankXpBounds(rankFilter);
        if (bounds) {
          paramIndex += 1;
          params.push(bounds.min);
          rankWhereClause = ` AND pl.xp_total >= $${paramIndex}`;
          if (bounds.max !== null) {
            paramIndex += 1;
            params.push(bounds.max);
            rankWhereClause += ` AND pl.xp_total < $${paramIndex}`;
          }
        }
      }

      const rankJoin = rankFilter
        ? `JOIN player_levels pl ON pl.user_id = u.id${rankWhereClause}`
        : '';

      const antiCheatWhere = `COALESCE((p.anti_cheat_state->>'banScore')::int, 0) < 50`;

      if (period === 'today') {
        query = `
          SELECT 
            u.id,
            u.telegram_id,
            u.username,
            u.first_name,
            COALESCE(SUM(s.commits_earned), 0) as commits_today,
            COALESCE(SUM(s.taps_count), 0) as taps_today,
            p.tier,
            p.streak_days
          FROM users u
          LEFT JOIN sessions s ON s.user_id = u.id AND s.started_at >= CURRENT_DATE
          LEFT JOIN progression p ON p.user_id = u.id
          ${rankJoin}
          WHERE ${antiCheatWhere}
          GROUP BY u.id, u.telegram_id, u.username, u.first_name, p.tier, p.streak_days
          HAVING COALESCE(SUM(s.commits_earned), 0) > 0
          ORDER BY commits_today DESC
          LIMIT $1
        `;
      } else if (period === 'week') {
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
          ${rankJoin}
          WHERE ${antiCheatWhere}
          GROUP BY u.id, u.telegram_id, u.username, u.first_name, p.tier, p.streak_days
          HAVING COALESCE(SUM(s.commits_earned), 0) > 0
          ORDER BY commits_week DESC
          LIMIT $1
        `;
      } else {
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
          ${rankJoin}
          WHERE ${antiCheatWhere}
          ORDER BY p.commits_total DESC
          LIMIT $1
        `;
      }

      const result = await client.query(query, params);

      const players = result.rows.map((row, index) => ({
        rank: index + 1,
        userId: row.id,
        telegramId: row.telegram_id,
        username: row.username,
        firstName: row.first_name,
        tier: row.tier,
        tierName: getTierName(row.tier),
        commits: parseInt(row.commits_total || row.commits_today || row.commits_week || 0),
        streakDays: row.streak_days || 0
      }));

      let myPosition = null;
      if (aroundMe && telegramUser) {
        const userResult = await client.query(
          `SELECT id FROM users WHERE telegram_id = $1`,
          [telegramUser.id]
        );
        if (userResult.rows.length > 0) {
          const myUserId = userResult.rows[0].id;
          // Find player's rank in the same query context
          const allQuery = query.replace('LIMIT $1', '');
          const allResult = await client.query(allQuery, params);
          const allPlayers = allResult.rows.map((row, index) => ({
            rank: index + 1,
            userId: row.id,
            telegramId: row.telegram_id,
            username: row.username,
            firstName: row.first_name,
            tier: row.tier,
            tierName: getTierName(row.tier),
            commits: parseInt(row.commits_total || row.commits_today || row.commits_week || 0),
            streakDays: row.streak_days || 0
          }));
          const idx = allPlayers.findIndex(p => p.userId === myUserId);
          if (idx >= 0) {
            const around = 2;
            const start = Math.max(0, idx - around);
            const end = Math.min(allPlayers.length, idx + around + 1);
            myPosition = {
              rank: allPlayers[idx].rank,
              players: allPlayers.slice(start, end)
            };
          }
        }
      }

      res.json({
        period,
        limit,
        count: players.length,
        players,
        myPosition
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
