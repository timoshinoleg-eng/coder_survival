import { Router } from 'express';
import { pool } from '../index.js';
import { buildGeneratorStatus } from '../utils/generatorState.js';
import { purchaseGenerator, recoverPassiveLoc } from '../utils/generatorEconomy.js';
import { getUserActiveLanguage, getLanguageEffectMultipliers } from '../utils/languages.js';
import { updateDailyQuestStateForEvent } from '../utils/dailyQuests.js';
import { getGeneratorCostMultiplierFromEventState } from '../utils/randomEventState.js';

const router = Router();

async function getUserAndProgression(client, telegramUser) {
  const userResult = await client.query(
    `SELECT u.id, u.created_at, p.*
     FROM users u
     JOIN progression p ON p.user_id = u.id
     WHERE u.telegram_id = $1
     FOR UPDATE`,
    [telegramUser.id]
  );
  return userResult.rows[0] || null;
}

router.get('/', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = await getUserAndProgression(client, telegramUser);
      if (!row) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }
      const accountAgeMinutes = Math.max(0, Math.floor((Date.now() - new Date(row.created_at).getTime()) / 60000));
      const activeLanguage = await getUserActiveLanguage(client, row.id);
      const langEffects = getLanguageEffectMultipliers(activeLanguage);
      const progression = await recoverPassiveLoc(client, row, { accountAgeMinutes, passiveMultiplier: langEffects.passiveLocMult });
      await client.query('COMMIT');
      return res.json({
        commitsTotal: Number(progression.commits_total || 0),
        commitsCurrent: Number(progression.commits_current || 0),
        generatorState: buildGeneratorStatus(progression.generator_state || {}, accountAgeMinutes, {
          costMultiplier: getGeneratorCostMultiplierFromEventState(progression.event_state || {})
        }),
        passiveLocRecovery: progression._passiveLocRecovery || null,
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

router.post('/buy', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });
  const tierId = req.body?.tierId;
  if (typeof tierId !== 'string' || !tierId) return res.status(400).json({ error: 'tierId is required' });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = await getUserAndProgression(client, telegramUser);
      if (!row) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }
      const accountAgeMinutes = Math.max(0, Math.floor((Date.now() - new Date(row.created_at).getTime()) / 60000));
      const activeLanguage = await getUserActiveLanguage(client, row.id);
      const langEffects = getLanguageEffectMultipliers(activeLanguage);
      const progression = await recoverPassiveLoc(client, row, { accountAgeMinutes, passiveMultiplier: langEffects.passiveLocMult });
      const result = await purchaseGenerator(client, progression, tierId, { accountAgeMinutes });
      if (result.error) {
        await client.query('ROLLBACK');
        return res.status(result.status).json(result);
      }
      await updateDailyQuestStateForEvent(client, row.id, 'buy_generator', 1).catch(() => null);
      await client.query('COMMIT');
      return res.json(result);
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
