import { Router } from 'express';
import { pool } from '../index.js';
import {
  getAllLanguages,
  getUserLanguages,
  unlockLanguageIfEligible,
  setActiveLanguage,
} from '../utils/languages.js';
import { ensurePlayerLevel } from '../utils/vnext.js';
import { validate } from '../middleware/validate.js';
import { languageEquipSchema } from '../validation/schemas.js';




const router = Router();

/**
 * GET /api/languages
 * List all languages with unlock requirements and user's unlock status.
 */
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

      const languages = await getAllLanguages(client, userResult.rows[0].id);
      res.json({ languages });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/languages/my
 * User's unlocked languages.
 */
router.get('/my', async (req, res, next) => {
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

      const languages = await getUserLanguages(client, userResult.rows[0].id);
      res.json({ languages });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/languages/equip
 * Body: { languageSlug: string }
 * Sets active language after checking unlock eligibility.
 */
router.post('/equip', validate(languageEquipSchema), async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  const { languageSlug } = req.body;

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

      const level = await ensurePlayerLevel(client, userId);
      const currentRank = Number(level.resolved?.rank || 1);

      const unlockResult = await unlockLanguageIfEligible(client, userId, languageSlug, currentRank);
      if (!unlockResult.unlocked) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Language is not unlocked', reason: unlockResult.reason });
      }

      const active = await setActiveLanguage(client, userId, languageSlug);
      const languages = await getUserLanguages(client, userId);

      await client.query('COMMIT');

      res.json({
        success: true,
        activeLanguage: active?.language_slug || languageSlug,
        languages,
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
