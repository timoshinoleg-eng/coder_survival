import { Router } from 'express';
import { pool } from '../index.js';
import { DEFAULTS } from '../config/balance.js';
import { ensurePlayerLevel } from '../utils/vnext.js';

const router = Router();

const COMPLETION_REWARD = DEFAULTS.FTUE.ONBOARDING.COMPLETION_REWARD;

function isOnboardingFinished(status) {
  return status === 'completed' || status === 'skipped';
}

function addInventoryReward(currentInventory, rewardInventory) {
  const current = currentInventory || {};
  const reward = rewardInventory || {};
  const result = { ...current };
  for (const [key, value] of Object.entries(reward)) {
    result[key] = (Number(result[key]) || 0) + Number(value);
  }
  return result;
}

function buildOnboardingResponse(progressionRow) {
  const row = progressionRow;
  const onboardingCompleted = isOnboardingFinished(row.onboarding_status);
  return {
    progression: {
      tier: row.tier,
      commitsTotal: Number(row.commits_total ?? 0),
      commitsCurrent: Number(row.commits_current ?? 0),
      energy: Number(row.energy ?? 0),
      depressionLevel: Number(row.depression_level ?? 0),
      streakDays: Number(row.streak_days ?? 0),
      onboardingCompleted,
      onboardingStatus: row.onboarding_status,
      onboardingCompletedAt: row.onboarding_completed_at ? new Date(row.onboarding_completed_at).toISOString() : null,
      onboardingSkippedAt: row.onboarding_skipped_at ? new Date(row.onboarding_skipped_at).toISOString() : null,
      inventory: row.inventory || {},
      isBurnout: row.is_burnout === true
    },
    game: {
      tier: row.tier,
      commits_total: Number(row.commits_total ?? 0),
      commits_current: Number(row.commits_current ?? 0),
      energy: Number(row.energy ?? 0),
      depression_level: Number(row.depression_level ?? 0),
      streak_days: Number(row.streak_days ?? 0),
      onboarding_completed: onboardingCompleted,
      onboardingStatus: row.onboarding_status,
      onboardingCompletedAt: row.onboarding_completed_at ? new Date(row.onboarding_completed_at).toISOString() : null,
      onboardingSkippedAt: row.onboarding_skipped_at ? new Date(row.onboarding_skipped_at).toISOString() : null,
      inventory: row.inventory || {},
      is_burnout: row.is_burnout === true
    },
    serverNow: new Date().toISOString()
  };
}

async function resolveUserId(client, telegramUser) {
  const userResult = await client.query(
    `SELECT id FROM users WHERE telegram_id = $1`,
    [telegramUser.id]
  );

  if (userResult.rows.length === 0) {
    return null;
  }

  return userResult.rows[0].id;
}

router.post('/complete', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const userId = await resolveUserId(client, telegramUser);
    if (!userId) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
    }

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

    // Idempotent: already finished — return current state without extra rewards.
    if (isOnboardingFinished(progression.onboarding_status)) {
      await client.query('ROLLBACK');
      return res.json(buildOnboardingResponse(progression));
    }

    const level = await ensurePlayerLevel(client, userId);
    const maxEnergy = level?.resolved?.maxEnergy || 100;
    const rewardEnergy = Number(COMPLETION_REWARD.energy ?? 0);
    const rewardInventory = COMPLETION_REWARD.inventory || {};
    const newInventory = addInventoryReward(progression.inventory, rewardInventory);

    const updatedResult = await client.query(
      `UPDATE progression
       SET onboarding_status = 'completed',
           onboarding_completed_at = NOW(),
           energy = LEAST($4, energy + $2),
           inventory = $3::jsonb
       WHERE user_id = $1
       RETURNING *`,
      [userId, rewardEnergy, JSON.stringify(newInventory), maxEnergy]
    );

    await client.query('COMMIT');
    console.log('onboarding_completed', { userId });

    return res.json(buildOnboardingResponse(updatedResult.rows[0]));
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

router.post('/skip', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const userId = await resolveUserId(client, telegramUser);
    if (!userId) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
    }

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

    if (isOnboardingFinished(progression.onboarding_status)) {
      await client.query('ROLLBACK');
      return res.json(buildOnboardingResponse(progression));
    }

    const updatedResult = await client.query(
      `UPDATE progression
       SET onboarding_status = 'skipped',
           onboarding_skipped_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [userId]
    );

    await client.query('COMMIT');
    console.log('onboarding_skipped', { userId });

    return res.json(buildOnboardingResponse(updatedResult.rows[0]));
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (_rollbackErr) {
        // Ignore rollback failure and return the original server error.
      }
    }
    console.error('[Onboarding] skip failed', err);
    return res.status(500).json({ error: 'Технический сбой. Мы уже чиним.' });
  } finally {
    if (client) client.release();
  }
});

export default router;
