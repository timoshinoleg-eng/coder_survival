import { Router } from 'express';
import { pool } from '../index.js';

const router = Router();

/**
 * POST /api/buy — покупка предмета за Stars (mock)
 * Body: { item_type: string, stars_amount: number }
 * item_type: 'energy_refill', 'depression_cure', 'tier_boost', 'streak_protect'
 */
router.post('/', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  const { item_type, stars_amount } = req.body || {};

  // Валидация
  const validItems = ['energy_refill', 'depression_cure', 'tier_boost', 'streak_protect'];
  if (!validItems.includes(item_type)) {
    return res.status(400).json({ error: 'Invalid item_type', validItems });
  }

  if (!stars_amount || stars_amount < 1) {
    return res.status(400).json({ error: 'Invalid stars_amount' });
  }

  try {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Получаем пользователя
      const userResult = await client.query(
        `SELECT id FROM users WHERE telegram_id = $1`,
        [telegramUser.id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userId = userResult.rows[0].id;

      // Создаём запись о покупке (mock — статус pending)
      const purchaseResult = await client.query(
        `INSERT INTO purchases (user_id, item_type, stars_amount, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING *`,
        [userId, item_type, stars_amount]
      );
      const purchase = purchaseResult.rows[0];

      // TODO: Реальная интеграция с Telegram Payments API
      // Пока auto-complete для dev
      const mockSuccess = true;

      if (mockSuccess) {
        await client.query(
          `UPDATE purchases SET status = 'completed' WHERE id = $1`,
          [purchase.id]
        );

        // Применяем эффект предмета
        const effect = await applyItemEffect(client, userId, item_type);

        await client.query('COMMIT');

        res.json({
          success: true,
          purchase: {
            id: purchase.id,
            itemType: purchase.item_type,
            starsAmount: purchase.stars_amount,
            status: 'completed',
            effect
          },
          message: 'Purchase completed (mock payment)'
        });
      } else {
        await client.query(
          `UPDATE purchases SET status = 'failed' WHERE id = $1`,
          [purchase.id]
        );
        await client.query('COMMIT');

        res.status(402).json({
          success: false,
          purchase: {
            id: purchase.id,
            status: 'failed'
          },
          error: 'Payment failed (mock)'
        });
      }

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

/**
 * Применяет эффект предмета к прогрессу
 */
async function applyItemEffect(client, userId, itemType) {
  switch (itemType) {
    case 'energy_refill':
      await client.query(
        `UPDATE progression SET energy = 100 WHERE user_id = $1`,
        [userId]
      );
      return { energy: 100 };

    case 'depression_cure':
      await client.query(
        `UPDATE progression SET depression_level = GREATEST(0, depression_level - 50) WHERE user_id = $1`,
        [userId]
      );
      return { depressionDelta: -50 };

    case 'tier_boost':
      // Даёт 100 коммитов к текущему уровню
      await client.query(
        `UPDATE progression SET commits_current = commits_current + 100 WHERE user_id = $1`,
        [userId]
      );
      return { commitsDelta: 100 };

    case 'streak_protect':
      // TODO: логика защиты стрика
      return { streakProtected: true };

    default:
      return {};
  }
}

export default router;
