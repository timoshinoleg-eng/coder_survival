import { Router } from 'express';
import { pool } from '../index.js';
import { getBanScoreTier, normalizeAntiCheatState } from '../utils/anticheat.js';

const router = Router();

async function getAppealUser(client, telegramUser) {
  const result = await client.query(
    `SELECT u.id, p.anti_cheat_state
     FROM users u
     LEFT JOIN progression p ON p.user_id = u.id
     WHERE u.telegram_id = $1`,
    [telegramUser.id]
  );
  return result.rows[0] || null;
}

router.get('/', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const client = await pool.connect();
    try {
      const user = await getAppealUser(client, telegramUser);
      if (!user?.id) return res.status(404).json({ error: 'User not found' });
      const latest = await client.query(
        `SELECT id, ban_score_snapshot, sanction_tier, message, status, created_at
         FROM appeal_requests
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [user.id]
      );
      return res.json({ requests: latest.rows, hasOpen: latest.rows.some((row) => row.status === 'open') });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (message.length < 10) return res.status(400).json({ error: 'Опиши ситуацию подробнее (минимум 10 символов).' });

  try {
    const client = await pool.connect();
    try {
      const user = await getAppealUser(client, telegramUser);
      if (!user?.id) return res.status(404).json({ error: 'User not found' });
      const existingOpen = await client.query(
        `SELECT 1 FROM appeal_requests WHERE user_id = $1 AND status = 'open' LIMIT 1`,
        [user.id]
      );
      if (existingOpen.rows.length > 0) {
        return res.status(409).json({ error: 'У тебя уже есть открытая апелляция.' });
      }
      const antiCheatState = normalizeAntiCheatState(user.anti_cheat_state || {});
      const tier = getBanScoreTier(antiCheatState.banScore);
      const result = await client.query(
        `INSERT INTO appeal_requests (user_id, ban_score_snapshot, sanction_tier, message)
         VALUES ($1, $2, $3, $4)
         RETURNING id, status, created_at`,
        [user.id, antiCheatState.banScore, tier.id, message.slice(0, 2000)]
      );
      await client.query(
        `INSERT INTO audit_logs (user_id, action, context)
         VALUES ($1, 'appeal_submitted', $2::jsonb)`,
        [user.id, JSON.stringify({ appealId: result.rows[0].id, banScore: antiCheatState.banScore, tier: tier.id })]
      );
      return res.json({ success: true, appeal: result.rows[0] });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
