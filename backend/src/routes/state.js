import { Router } from 'express';
import { pool } from '../index.js';

const router = Router();

/**
 * GET /api/state — текущее состояние игрока
 * Returns: { user, progression, activeSession? }
 */
router.get('/', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  try {
    const client = await pool.connect();
    try {
      // Получаем пользователя
      const userResult = await client.query(
        `SELECT id, telegram_id, username, first_name, last_name, created_at, last_active
         FROM users WHERE telegram_id = $1`,
        [telegramUser.id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found. Tap first to create profile.' });
      }

      const user = userResult.rows[0];

      // Получаем прогресс
      const progressResult = await client.query(
        `SELECT * FROM progression WHERE user_id = $1`,
        [user.id]
      );

      const progression = progressResult.rows[0] || null;

      // Получаем активную сессию (не закрыта)
      const sessionResult = await client.query(
        `SELECT * FROM sessions 
         WHERE user_id = $1 AND ended_at IS NULL 
         ORDER BY started_at DESC 
         LIMIT 1`,
        [user.id]
      );

      const activeSession = sessionResult.rows[0] || null;

      // Статистика за сегодня
      const todayStats = await client.query(
        `SELECT COALESCE(SUM(taps_count), 0) as taps_today,
                COALESCE(SUM(commits_earned), 0) as commits_today
         FROM sessions 
         WHERE user_id = $1 AND started_at >= CURRENT_DATE`,
        [user.id]
      );

      res.json({
        user: {
          id: user.id,
          telegramId: user.telegram_id,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          createdAt: user.created_at,
          lastActive: user.last_active
        },
        progression: progression ? {
          tier: progression.tier,
          tierName: getTierName(progression.tier),
          commitsTotal: parseInt(progression.commits_total),
          commitsCurrent: parseInt(progression.commits_current),
          energy: progression.energy,
          depressionLevel: progression.depression_level,
          streakDays: progression.streak_days
        } : null,
        activeSession: activeSession ? {
          sessionId: activeSession.session_id,
          startedAt: activeSession.started_at,
          tapsCount: activeSession.taps_count,
          commitsEarned: activeSession.commits_earned
        } : null,
        today: {
          taps: parseInt(todayStats.rows[0].taps_today),
          commits: parseInt(todayStats.rows[0].commits_today)
        }
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
