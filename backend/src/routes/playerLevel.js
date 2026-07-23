import { Router } from 'express';
import { pool } from '../index.js';
import { ensurePlayerLevel, resolveCareerRank } from '../utils/vnext.js';

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

// SECURITY: The former client-writable `POST /api/player/level/xp` endpoint let
// any authenticated client mint arbitrary XP (it applied a client-supplied
// `amount` verbatim), which drives career rank, energy and skin unlocks. It was
// never called by the front-end — all legitimate XP is granted server-side
// inside the tap / quest / streak / referral / hackathon flows via
// `addPlayerXp`. The endpoint is removed; XP must only be awarded by
// server-authoritative game actions. This tombstone returns a clean JSON 410
// (instead of an HTML 404) so any lingering client gets a clear signal.
router.post('/xp', (req, res) => {
  res.status(410).json({ error: 'Endpoint removed: XP is granted server-side only.' });
});

router.get('/rank', async (req, res, next) => {
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

      const userId = userResult.rows[0].id;
      const level = await ensurePlayerLevel(client, userId);
      const career = resolveCareerRank(level.xp_total);

      res.json({
        success: true,
        rank: career.rank,
        xp: career.xpTotal,
        xpToNextRank: career.xpToNextRank,
        activeBonuses: career.bonuses
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
