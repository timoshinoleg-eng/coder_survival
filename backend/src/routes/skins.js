import { Router } from 'express';
import { pool } from '../index.js';
import { getUserSkins } from '../utils/phase2State.js';
import { validate } from '../middleware/validate.js';
import { skinEquipSchema } from '../validation/schemas.js';




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

      const skins = await getUserSkins(client, userResult.rows[0].id);
      res.json({ skins });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/skins/equip
 * Body: { skinId: string }
 */
router.post('/equip', validate(skinEquipSchema), async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  const { skinId } = req.body;

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

      const skinResult = await client.query(
        `SELECT skin_id, unlock_type
         FROM skin_definitions
         WHERE skin_id = $1`,
        [skinId]
      );
      if (skinResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Skin not found' });
      }

      const skin = skinResult.rows[0];

      const ownedResult = await client.query(
        `SELECT 1
         FROM user_skins
         WHERE user_id = $1 AND skin_id = $2
         FOR UPDATE`,
        [userId, skinId]
      );

      if (ownedResult.rows.length === 0) {
        if (skin.unlock_type !== 'default') {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Skin is not owned' });
        }

        await client.query(
          `INSERT INTO user_skins (user_id, skin_id, equipped)
           VALUES ($1, $2, FALSE)
           ON CONFLICT (user_id, skin_id) DO NOTHING`,
          [userId, skinId]
        );
      }

      await client.query(
        `UPDATE user_skins
         SET equipped = FALSE
         WHERE user_id = $1 AND equipped = TRUE`,
        [userId]
      );

      const equipResult = await client.query(
        `UPDATE user_skins
         SET equipped = TRUE
         WHERE user_id = $1 AND skin_id = $2
         RETURNING skin_id`,
        [userId, skinId]
      );
      const skins = await getUserSkins(client, userId);

      await client.query('COMMIT');

      res.json({
        success: true,
        skinId: equipResult.rows[0].skin_id,
        skins
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
