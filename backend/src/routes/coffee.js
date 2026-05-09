import { Router } from 'express';
import { pool } from '../index.js';
import { applyReward } from '../utils/rewards.js';
import { ensurePlayerLevel } from '../utils/vnext.js';

const router = Router();
const COFFEE_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours
const COFFEE_ENERGY = 30;

/**
 * POST /api/coffee — drink coffee to restore energy
 * Cooldown: 4 hours
 * Reward: +30 energy (capped to maxEnergy)
 */
router.post('/', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        `SELECT id FROM users WHERE telegram_id = $1`,
        [telegramUser.id]
      );
      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }
      const userId = userResult.rows[0].id;

      // Check cooldown via progression updated_at (coffee is an activity)
      // More robust: track coffee_last_used in progression
      const progResult = await client.query(
        `SELECT energy, coffee_last_used
         FROM progression
         WHERE user_id = $1
         FOR UPDATE`,
        [userId]
      );
      const prog = progResult.rows[0];

      const now = Date.now();
      const lastUsed = prog.coffee_last_used ? new Date(prog.coffee_last_used).getTime() : 0;
      if (now - lastUsed < COFFEE_COOLDOWN_MS) {
        const remainingMs = COFFEE_COOLDOWN_MS - (now - lastUsed);
        const remainingMin = Math.ceil(remainingMs / 60000);
        await client.query('ROLLBACK');
        return res.status(429).json({
          error: 'Coffee cooldown active',
          remainingMinutes: remainingMin
        });
      }

      const level = await ensurePlayerLevel(client, userId);
      const maxEnergy = level.resolved.maxEnergy;
      const restored = Math.min(COFFEE_ENERGY, maxEnergy - prog.energy);

      if (restored <= 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Energy is already full' });
      }

      await applyReward(client, userId, { energy: restored });

      await client.query(
        `UPDATE progression
         SET coffee_last_used = NOW()
         WHERE user_id = $1`,
        [userId]
      );

      const updatedProgressResult = await client.query(
        `SELECT energy
         FROM progression
         WHERE user_id = $1`,
        [userId]
      );
      const updatedEnergy = updatedProgressResult.rows[0]?.energy ?? prog.energy;

      await client.query('COMMIT');

      res.json({
        success: true,
        restored,
        energy: updatedEnergy,
        maxEnergy
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
