import { Router } from 'express';
import { pool } from '../index.js';

const router = Router();

router.post('/complete', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const userResult = await client.query(
      `SELECT id FROM users WHERE telegram_id = $1`,
      [telegramUser.id]
    );

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
    }

    const userId = userResult.rows[0].id;
    const progressionResult = await client.query(
      `SELECT *
       FROM progression
       WHERE user_id = $1
       FOR UPDATE`,
      [userId]
    );

    if (progressionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Прогресс ещё не создан. Откройте игру заново.' });
    }

    const progression = progressionResult.rows[0];
    if (progression.onboarding_completed === true) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'already_completed' });
    }

    const updatedResult = await client.query(
      `UPDATE progression
       SET onboarding_completed = TRUE,
           energy = LEAST(100, energy + 20),
           inventory = jsonb_set(
             CASE
               WHEN jsonb_typeof(inventory) = 'object' THEN inventory
               ELSE '{}'::jsonb
             END,
             '{coffee_cups}',
             to_jsonb(
               CASE
                 WHEN inventory->>'coffee_cups' ~ '^(?:0|[1-9][0-9]{0,8})$'
                   THEN (inventory->>'coffee_cups')::int
                 ELSE 0
               END + 1
             ),
             TRUE
           )
       WHERE user_id = $1
       RETURNING *`,
      [userId]
    );

    await client.query('COMMIT');
    console.log('onboarding_completed', { userId });

    const updated = updatedResult.rows[0];
    return res.json({
      progression: {
        tier: updated.tier,
        commitsTotal: Number(updated.commits_total ?? 0),
        commitsCurrent: Number(updated.commits_current ?? 0),
        energy: Number(updated.energy ?? 0),
        depressionLevel: Number(updated.depression_level ?? 0),
        streakDays: Number(updated.streak_days ?? 0),
        onboardingCompleted: updated.onboarding_completed === true,
        inventory: updated.inventory || {},
        isBurnout: updated.is_burnout === true
      },
      game: {
        tier: updated.tier,
        commits_total: Number(updated.commits_total ?? 0),
        commits_current: Number(updated.commits_current ?? 0),
        energy: Number(updated.energy ?? 0),
        depression_level: Number(updated.depression_level ?? 0),
        streak_days: Number(updated.streak_days ?? 0),
        onboarding_completed: updated.onboarding_completed === true,
        inventory: updated.inventory || {},
        is_burnout: updated.is_burnout === true
      },
      serverNow: new Date().toISOString()
    });
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (_rollbackErr) {
        // Ignore rollback failure and return the original server error.
      }
    }
    console.error('[Onboarding] completion failed', err);
    return res.status(500).json({ error: 'Технический сбой. Мы уже чиним.' });
  } finally {
    if (client) client.release();
  }
});

export default router;
