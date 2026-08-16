import { Router } from 'express';
import { pool } from '../index.js';
import { applyReward } from '../utils/rewards.js';
import { ensurePlayerLevel } from '../utils/vnext.js';
import { checkAchievement } from '../utils/achievements.js';

const router = Router();
const COFFEE_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours
const COFFEE_ENERGY = 30;
const COIN_COFFEE_ENERGY = 15;

/**
 * POST /api/coffee/coins — spend one earned Coffee Coin for a small emergency recovery.
 * This is intentionally convenience, not a leaderboard advantage.
 */
router.post('/coins', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'No user in initData' });

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const userResult = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramUser.id]);
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = userResult.rows[0].id;
    const level = await ensurePlayerLevel(client, userId);
    const maxEnergy = level.resolved.maxEnergy;
    const progressResult = await client.query(
      `SELECT energy, inventory FROM progression WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    const progression = progressResult.rows[0];
    const coins = Number(progression?.inventory?.coffee_coins || 0);
    if (coins < 1) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Недостаточно Coffee Coins' });
    }
    const restored = Math.min(COIN_COFFEE_ENERGY, maxEnergy - Number(progression.energy || 0));
    if (restored <= 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Энергия уже полная' });
    }
    await client.query(
      `UPDATE progression
       SET inventory = jsonb_set(COALESCE(inventory, '{}'::jsonb), '{coffee_coins}', to_jsonb($2::int), TRUE)
       WHERE user_id = $1`,
      [userId, coins - 1],
    );
    await applyReward(client, userId, { energy: restored, depressionRelief: 3 });
    await client.query('COMMIT');
    return res.json({ success: true, restored, energy: Number(progression.energy || 0) + restored, coffeeCoins: coins - 1 });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

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
      await checkAchievement(client, userId, 'use_item', { itemId: 'coffee' });

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
