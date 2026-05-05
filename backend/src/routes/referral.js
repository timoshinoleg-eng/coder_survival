import { Router } from 'express';
import { pool } from '../index.js';

const router = Router();

/**
 * POST /api/referral — отслеживание реферала
 * Body: { referred_telegram_id: number, referral_code?: string }
 * referral_code — можно использовать как "ref_{referrer_telegram_id}"
 */
router.post('/', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  const { referred_telegram_id, referral_code } = req.body || {};

  try {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Определяем referrer_id
      let referrerId = null;

      if (referral_code && referral_code.startsWith('ref_')) {
        // Из referral_code извлекаем telegram_id реферера
        const referrerTelegramId = parseInt(referral_code.replace('ref_', ''), 10);
        
        const referrerResult = await client.query(
          `SELECT id FROM users WHERE telegram_id = $1`,
          [referrerTelegramId]
        );
        
        if (referrerResult.rows.length > 0) {
          referrerId = referrerResult.rows[0].id;
        }
      }

      // Если передан referred_telegram_id — создаём связь
      if (referred_telegram_id) {
        // Получаем ID referred пользователя
        const referredResult = await client.query(
          `SELECT id FROM users WHERE telegram_id = $1`,
          [referred_telegram_id]
        );

        if (referredResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Referred user not found' });
        }

        const referredId = referredResult.rows[0].id;

        // Проверяем, не существует ли уже связи
        const existingResult = await client.query(
          `SELECT * FROM referrals WHERE referrer_id = $1 AND referred_id = $2`,
          [referrerId, referredId]
        );

        if (existingResult.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ 
            error: 'Referral already exists',
            referral: existingResult.rows[0]
          });
        }

        // Создаём реферальную связь
        const referralResult = await client.query(
          `INSERT INTO referrals (referrer_id, referred_id, status)
           VALUES ($1, $2, 'pending')
           RETURNING *`,
          [referrerId, referredId]
        );

        await client.query('COMMIT');

        res.json({
          success: true,
          referral: {
            id: referralResult.rows[0].id,
            referrerId,
            referredId,
            status: 'pending',
            rewardClaimed: false
          },
          message: 'Referral tracked successfully'
        });
      } else {
        // Просто возвращаем реферальный код текущего пользователя
        const userResult = await client.query(
          `SELECT id FROM users WHERE telegram_id = $1`,
          [telegramUser.id]
        );

        if (userResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'User not found' });
        }

        const userId = userResult.rows[0].id;
        const referralCode = `ref_${telegramUser.id}`;

        // Получаем статистику рефералов
        const statsResult = await client.query(
          `SELECT 
            COUNT(*) as total_referrals,
            COUNT(*) FILTER (WHERE status = 'rewarded') as rewarded_referrals
           FROM referrals 
           WHERE referrer_id = $1`,
          [userId]
        );

        await client.query('COMMIT');

        res.json({
          success: true,
          referralCode,
          stats: {
            total: parseInt(statsResult.rows[0].total_referrals),
            rewarded: parseInt(statsResult.rows[0].rewarded_referrals)
          }
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

export default router;
