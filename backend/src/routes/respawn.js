import { Router } from 'express';
import { pool } from '../index.js';

const router = Router();

/**
 * POST /api/respawn — reset death state after burnout
 * Cost: 50 energy (if energy < 50, resets to 0)
 * Effect: is_dead = false, depression_level = 50, energy = max(0, energy - 50)
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

      const progResult = await client.query(
        `SELECT is_dead, energy, depression_level
         FROM progression
         WHERE user_id = $1
         FOR UPDATE`,
        [userId]
      );
      if (progResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Progression not found' });
      }

      const prog = progResult.rows[0];
      if (!prog.is_dead) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'User is not dead' });
      }

      const newEnergy = Math.max(0, prog.energy - 50);
      const newDepression = 50;

      await client.query(
        `UPDATE progression
         SET is_dead = FALSE,
             energy = $2,
             depression_level = $3,
             updated_at = NOW(),
             last_energy_activity_at = NOW()
         WHERE user_id = $1`,
        [userId, newEnergy, newDepression]
      );

      await client.query(
        `INSERT INTO audit_logs (user_id, action, context)
         VALUES ($1, 'respawn', $2::jsonb)`,
        [userId, JSON.stringify({ oldEnergy: prog.energy, newEnergy, newDepression })]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        energy: newEnergy,
        depression: newDepression,
        isDead: false
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
