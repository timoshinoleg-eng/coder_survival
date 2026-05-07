import { Router } from 'express';
import { pool } from '../index.js';
import { REFERRAL_ACTIVE_THRESHOLD_COMMITS, REFERRAL_MILESTONE_REWARDS } from '../config/balance.js';
import { ensurePlayerLevel } from '../utils/vnext.js';

const router = Router();
const REFERRAL_MILESTONES = Object.keys(REFERRAL_MILESTONE_REWARDS).map(Number).sort((a, b) => a - b);

function getBotUsername() {
  return process.env.BOT_USERNAME || 'coder_survival_bot';
}

async function ensureUserAndCode(client, telegramUser) {
  const userResult = await client.query(
    `SELECT id FROM users WHERE telegram_id = $1`,
    [telegramUser.id]
  );
  if (userResult.rows.length === 0) {
    return { error: 'User not found', status: 404 };
  }
  const userId = userResult.rows[0].id;
  const code = `ref_${telegramUser.id}`;
  await client.query(
    `INSERT INTO referral_codes (user_id, code) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
    [userId, code]
  );
  return { userId, code };
}

/**
 * GET /api/referral/stats
 */
router.get('/stats', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  try {
    const client = await pool.connect();
    try {
      const ensured = await ensureUserAndCode(client, telegramUser);
      if (ensured.error) {
        return res.status(ensured.status).json({ error: ensured.error });
      }

      const statsResult = await client.query(
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (
            WHERE COALESCE(p.commits_total, 0) >= $2
          ) as active
         FROM referrals r
         LEFT JOIN progression p ON p.user_id = r.referred_id
         WHERE r.referrer_id = $1`,
        [ensured.userId, REFERRAL_ACTIVE_THRESHOLD_COMMITS]
      );

      const total = parseInt(statsResult.rows[0].total);
      const active = parseInt(statsResult.rows[0].active);
      const nextMilestone = REFERRAL_MILESTONES.find((m) => active < m) || null;

      const claimedResult = await client.query(
        `SELECT milestone FROM referral_milestone_claims WHERE user_id = $1`,
        [ensured.userId]
      );
      const claimedMilestones = claimedResult.rows.map(r => r.milestone);

      const milestones = REFERRAL_MILESTONES.map((target) => ({
        target,
        reward: REFERRAL_MILESTONE_REWARDS[target] || {},
        reached: active >= target,
        claimed: claimedMilestones.includes(target)
      }));

      res.json({
        success: true,
        referralCode: ensured.code,
        stats: {
          total,
          active,
          activeThresholdCommits: REFERRAL_ACTIVE_THRESHOLD_COMMITS,
          nextMilestone,
          milestones,
          claimedMilestones
        }
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/referral/link
 */
router.get('/link', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  try {
    const client = await pool.connect();
    try {
      const ensured = await ensureUserAndCode(client, telegramUser);
      if (ensured.error) {
        return res.status(ensured.status).json({ error: ensured.error });
      }

      res.json({
        success: true,
        referralCode: ensured.code,
        referralLink: `https://t.me/${getBotUsername()}?startapp=${ensured.code}`
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

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
      let referrerTelegramId = null;

      if (referral_code && referral_code.startsWith('ref_')) {
        // Из referral_code извлекаем telegram_id реферера
        referrerTelegramId = parseInt(referral_code.replace('ref_', ''), 10);
        
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
        if (referred_telegram_id !== telegramUser.id) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'referred_telegram_id mismatch' });
        }

        if (!referrerId) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Valid referral_code is required' });
        }

        if (referrerTelegramId === referred_telegram_id) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Self-referral is not allowed' });
        }

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

        if (referrerId === referredId) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Self-referral is not allowed' });
        }

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

/**
 * POST /api/referral/claim-milestone
 * Body: { milestone: 1|3|5 }
 */
router.post('/claim-milestone', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { milestone } = req.body || {};
  if (!REFERRAL_MILESTONES.includes(milestone)) {
    return res.status(400).json({ error: 'Invalid milestone' });
  }

  const rewardEnergy = REFERRAL_MILESTONE_REWARDS[milestone]?.energy;

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

      const activeResult = await client.query(
        `SELECT COUNT(*) as active
         FROM referrals r
         LEFT JOIN progression p ON p.user_id = r.referred_id
         WHERE r.referrer_id = $1 AND COALESCE(p.commits_total, 0) >= $2`,
        [userId, REFERRAL_ACTIVE_THRESHOLD_COMMITS]
      );
      const active = parseInt(activeResult.rows[0].active);
      if (active < milestone) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Milestone not reached' });
      }

      const claimedResult = await client.query(
        `SELECT id FROM referral_milestone_claims WHERE user_id = $1 AND milestone = $2`,
        [userId, milestone]
      );
      if (claimedResult.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Already claimed' });
      }

      const progResult = await client.query(
        `SELECT energy FROM progression WHERE user_id = $1`,
        [userId]
      );
      let newEnergy = rewardEnergy;
      if (progResult.rows.length > 0) {
        const { energy } = progResult.rows[0];
        const level = await ensurePlayerLevel(client, userId);
        const maxEnergy = level.resolved?.maxEnergy || 100;
        newEnergy = Math.min(maxEnergy, Number(energy) + rewardEnergy);
      }

      await client.query(
        `UPDATE progression SET energy = $1 WHERE user_id = $2`,
        [newEnergy, userId]
      );

      await client.query(
        `INSERT INTO referral_milestone_claims (user_id, milestone, reward_energy)
         VALUES ($1, $2, $3)`,
        [userId, milestone, rewardEnergy]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        milestone,
        reward: { energy: rewardEnergy },
        newEnergy
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
