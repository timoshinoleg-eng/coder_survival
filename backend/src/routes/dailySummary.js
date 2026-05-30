import { Router } from 'express';
import { pool } from '../index.js';
import { distributeDailySummaryRewards, buildChatMessage } from '../utils/dailySummary.js';

const router = Router();
const BOT_BACKEND_SECRET = process.env.BOT_BACKEND_SECRET;

async function getUserId(client, telegramUser) {
  const result = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramUser.id]);
  return result.rows[0]?.id || null;
}

/**
 * GET /api/daily-summary/today
 * Returns today's daily summary results (top 10), current user's result, and time until next battle.
 */
router.get('/today', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const client = await pool.connect();
    try {
      const userId = await getUserId(client, telegramUser);
      if (!userId) return res.status(404).json({ error: 'User not found' });

      const todayStr = new Date().toISOString().split('T')[0];

      // Top 10 results for today
      const topResult = await client.query(
        `SELECT
           dsr.user_id,
           dsr.rank,
           dsr.score_total,
           dsr.score_productivity,
           dsr.score_depression,
           dsr.score_social,
           dsr.score_referral,
           dsr.status,
           dsr.reward_payload,
           u.username,
           u.first_name
         FROM daily_summary_results dsr
         JOIN users u ON u.id = dsr.user_id
         WHERE dsr.summary_date = $1
         ORDER BY dsr.rank ASC
         LIMIT 10`,
        [todayStr]
      );

      const topPlayers = topResult.rows.map(row => ({
        userId: row.user_id,
        rank: row.rank,
        username: row.username,
        firstName: row.first_name,
        scoreTotal: parseFloat(row.score_total),
        scoreProductivity: parseFloat(row.score_productivity),
        scoreDepression: parseFloat(row.score_depression),
        scoreSocial: parseFloat(row.score_social),
        scoreReferral: parseFloat(row.score_referral),
        status: row.status,
        reward: row.reward_payload
      }));

      // Current user's result
      const myResult = await client.query(
        `SELECT
           rank,
           score_total,
           score_productivity,
           score_depression,
           score_social,
           score_referral,
           status,
           reward_payload
         FROM daily_summary_results
         WHERE summary_date = $1 AND user_id = $2`,
        [todayStr, userId]
      );

      let mySummary = null;
      if (myResult.rows.length > 0) {
        const row = myResult.rows[0];
        mySummary = {
          rank: row.rank,
          scoreTotal: parseFloat(row.score_total),
          scoreProductivity: parseFloat(row.score_productivity),
          scoreDepression: parseFloat(row.score_depression),
          scoreSocial: parseFloat(row.score_social),
          scoreReferral: parseFloat(row.score_referral),
          status: row.status,
          reward: row.reward_payload
        };
      }

      // Time until next battle (18:00 UTC next day, or today if before 18:00)
      const now = new Date();
      const nextBattle = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 18, 0, 0));
      if (now.getTime() >= nextBattle.getTime()) {
        nextBattle.setUTCDate(nextBattle.getUTCDate() + 1);
      }
      const timeUntilBattle = Math.max(0, nextBattle.getTime() - now.getTime());

      res.json({
        success: true,
        date: todayStr,
        topPlayers,
        mySummary,
        timeUntilBattle
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/daily-summary/history
 * Returns last 7 days of daily summary results for the current user.
 */
router.get('/history', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const client = await pool.connect();
    try {
      const userId = await getUserId(client, telegramUser);
      if (!userId) return res.status(404).json({ error: 'User not found' });

      const result = await client.query(
        `SELECT
           summary_date,
           rank,
           score_total,
           score_productivity,
           score_depression,
           score_social,
           score_referral,
           status,
           reward_payload
         FROM daily_summary_results
         WHERE user_id = $1
         ORDER BY summary_date DESC
         LIMIT 7`,
        [userId]
      );

      const history = result.rows.map(row => ({
        date: row.summary_date,
        rank: row.rank,
        scoreTotal: parseFloat(row.score_total),
        scoreProductivity: parseFloat(row.score_productivity),
        scoreDepression: parseFloat(row.score_depression),
        scoreSocial: parseFloat(row.score_social),
        scoreReferral: parseFloat(row.score_referral),
        status: row.status,
        reward: row.reward_payload
      }));

      res.json({ success: true, history });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/daily-summary/bind-chat
 * Stores a work chat ID for the current user (used by bot or frontend).
 * Body: { chatId: number }
 */
router.post('/bind-chat', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });

  const chatId = Number(req.body?.chatId);
  if (!Number.isInteger(chatId)) {
    return res.status(400).json({ error: 'chatId must be an integer' });
  }

  try {
    const client = await pool.connect();
    try {
      const userId = await getUserId(client, telegramUser);
      if (!userId) return res.status(404).json({ error: 'User not found' });

      await client.query(
        `UPDATE progression
         SET social_state = COALESCE(social_state, '{}') || jsonb_build_object('work_chat_id', $2)
         WHERE user_id = $1`,
        [userId, chatId]
      );

      res.json({ success: true, chatId });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/internal/daily-summary/bind-chat
 * Internal bot-only: bind a work chat for a user by telegram ID.
 * Protected by BOT_BACKEND_SECRET header.
 * Body: { telegramUserId, chatId }
 */
router.post('/internal/bind-chat', async (req, res, next) => {
  const headerSecret = req.get('X-Bot-Backend-Secret');
  if (!BOT_BACKEND_SECRET || headerSecret !== BOT_BACKEND_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const telegramUserId = Number(req.body?.telegramUserId);
  const chatId = Number(req.body?.chatId);
  if (!Number.isInteger(telegramUserId) || !Number.isInteger(chatId)) {
    return res.status(400).json({ error: 'telegramUserId and chatId must be integers' });
  }

  try {
    const client = await pool.connect();
    try {
      const userResult = await client.query(
        'SELECT id FROM users WHERE telegram_id = $1',
        [telegramUserId]
      );
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      const userId = userResult.rows[0].id;

      await client.query(
        `UPDATE progression
         SET social_state = COALESCE(social_state, '{}') || jsonb_build_object('work_chat_id', $2)
         WHERE user_id = $1`,
        [userId, chatId]
      );

      res.json({ success: true, chatId });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/daily-summary/trigger
 * Admin/cron-only: trigger daily summary distribution for a date.
 * Protected by BOT_BACKEND_SECRET header.
 * Body: { date? }
 */
router.post('/trigger', async (req, res, next) => {
  const headerSecret = req.get('X-Bot-Backend-Secret');
  if (!BOT_BACKEND_SECRET || headerSecret !== BOT_BACKEND_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { date } = req.body || {};

  try {
    const client = await pool.connect();
    try {
      const result = await distributeDailySummaryRewards(client, date ? new Date(date) : null);
      res.json({ success: true, ...result });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
