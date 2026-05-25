import { Router } from 'express';
import { pool } from '../index.js';
import { ensurePlayerLevel } from '../utils/vnext.js';
import { ensurePlayerPass, getActivePass, unlockPremiumPass } from '../utils/pass.js';
import { applyReward } from '../utils/rewards.js';
import { getProductById } from '../utils/shopCatalog.js';
import { SHOP_ITEM_EFFECTS } from '../config/balance.js';
import { armStreakSaver } from '../utils/streak.js';

const router = Router();

/**
 * POST /api/buy — регистрация намерения покупки.
 * Реальная выдача предмета должна идти только после Telegram successful_payment.
 * Body: { item_type: string }
 * item_type: 'energy_refill', 'depression_cure', 'tier_boost', 'streak_protect', 'streak_saver'
 */
router.post('/', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  const { item_type } = req.body || {};

  const item = getProductById(item_type);
  if (!item) {
    return res.status(400).json({ error: 'Invalid item_type' });
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
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }

      const userId = userResult.rows[0].id;

      if (item_type === 'premium_pass') {
        const activePass = await getActivePass(client);
        if (!activePass) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'No active sprint pass' });
        }

        const playerPass = await ensurePlayerPass(client, userId, activePass.id);
        if (playerPass.is_premium) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Premium pass already unlocked' });
        }
      }

      const purchaseResult = await client.query(
        `INSERT INTO purchases (user_id, item_type, stars_amount, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING *`,
        [userId, item_type, item.stars]
      );
      const purchase = purchaseResult.rows[0];

      await client.query(
        `INSERT INTO audit_logs (user_id, action, context)
         VALUES ($1, 'purchase_intent', $2::jsonb)`,
        [userId, JSON.stringify({ purchaseId: purchase.id, itemType: item_type, starsAmount: item.stars })]
      );

      await client.query('COMMIT');

      res.status(202).json({
        success: true,
        purchase: {
          id: purchase.id,
          itemType: purchase.item_type,
          starsAmount: purchase.stars_amount,
          status: purchase.status
        },
        payment: {
          required: true,
          currency: 'XTR',
          payload: `purchase:${purchase.id}:${item_type}`
        }
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

/**
 * Применяет эффект предмета к прогрессу
 */
export async function applyItemEffect(client, userId, itemType) {
  switch (itemType) {
    case 'energy_refill': {
      const level = await ensurePlayerLevel(client, userId);
      const maxEnergy = level.resolved.maxEnergy;
      await client.query(
        `UPDATE progression SET energy = $2, updated_at = NOW() WHERE user_id = $1`,
        [userId, maxEnergy]
      );
      return { energy: maxEnergy };
    }

    case 'coffee_break': {
      await applyReward(client, userId, SHOP_ITEM_EFFECTS.coffee_break);
      return {
        energyDelta: SHOP_ITEM_EFFECTS.coffee_break.energy,
        depressionDelta: -SHOP_ITEM_EFFECTS.coffee_break.depressionRelief
      };
    }

    case 'depression_cure': {
      await applyReward(client, userId, SHOP_ITEM_EFFECTS.depression_cure);
      return { depressionDelta: -SHOP_ITEM_EFFECTS.depression_cure.depressionRelief };
    }

    case 'tier_boost': {
      await applyReward(client, userId, SHOP_ITEM_EFFECTS.tier_boost);
      return {
        commitsDelta: SHOP_ITEM_EFFECTS.tier_boost.commitsCurrent,
        xpDelta: SHOP_ITEM_EFFECTS.tier_boost.xpTotal
      };
    }

    case 'premium_pass': {
      const result = await unlockPremiumPass(client, userId);
      if (result.error) {
        throw new Error(result.error);
      }
      return {
        premiumPass: true,
        alreadyOwned: result.alreadyOwned || false,
        seasonNumber: result.pass?.season_number || null
      };
    }

    case 'streak_protect':
      // TODO: логика защиты стрика
      return { streakProtected: true };

    case 'streak_saver': {
      const streakResult = await client.query(
        `SELECT streak_state FROM progression WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );
      const streakState = streakResult.rows[0]?.streak_state || {};
      const todayDate = new Date().toISOString().slice(0, 10);
      const nextState = armStreakSaver(streakState, todayDate, new Date());
      await client.query(
        `UPDATE progression SET streak_state = $2, updated_at = NOW() WHERE user_id = $1`,
        [userId, JSON.stringify(nextState)]
      );
      return { streakSaverArmed: true, saverArmedForDate: nextState.saverArmedForDate };
    }

    case 'office_cat': {
      await client.query(
        `INSERT INTO user_skins (user_id, skin_id, equipped, unlocked_at)
         VALUES ($1, 'office_cat', false, NOW())
         ON CONFLICT (user_id, skin_id) DO NOTHING`,
        [userId]
      );
      return { skinGranted: 'office_cat' };
    }

    default:
      return {};
  }
}

export default router;
