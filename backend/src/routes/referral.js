import { Router } from 'express';
import { pool } from '../index.js';
import { STAGE3 } from '../config/balance.js';
import { logDailyFarm } from '../utils/farmLog.js';
import { ensurePlayerLevel, addPlayerXp } from '../utils/vnext.js';
import { buildReferralClaimReward, getUnlockedReferralMilestones, parseReferralCode, trackReferral } from '../utils/referral.js';
import { checkAchievement } from '../utils/achievements.js';

const router = Router();
const REFERRAL_MILESTONES = Object.keys(STAGE3.REFERRAL.MILESTONE_REWARDS).map(Number).sort((a, b) => a - b);
const STAGE3_REFERRAL_MILESTONES = Object.keys(STAGE3.REFERRAL.MILESTONE_REWARDS).map(Number).sort((a, b) => a - b);

function getBotUsername() {
  return process.env.BOT_USERNAME || 'coder_survival_bot';
}

function getMilestoneReward(milestone) {
  return STAGE3.REFERRAL.MILESTONE_REWARDS[milestone]?.inviter || {};
}

async function getReferralProgress(client, userId) {
  const activeResult = await client.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (
         WHERE COALESCE(p.commits_total, 0) >= $2
           AND p.first_active_at IS NOT NULL
           AND p.first_active_at <= NOW() - ($3::int * INTERVAL '1 day')
       )::int AS active,
       COUNT(*) FILTER (
         WHERE COALESCE(p.commits_total, 0) >= $2
           AND p.first_active_at IS NOT NULL
           AND p.first_active_at <= NOW() - ($3::int * INTERVAL '1 day')
           AND r.is_referred_premium = TRUE
       )::int AS premium_active
     FROM referrals r
     LEFT JOIN progression p ON p.user_id = r.referred_id
     WHERE r.referrer_id = $1`,
    [userId, STAGE3.REFERRAL.ACTIVE_THRESHOLD_COMMITS, STAGE3.REFERRAL.ANTI_FARM_DAYS]
  );

  return {
    total: Number(activeResult.rows[0]?.total || 0),
    active: Number(activeResult.rows[0]?.active || 0),
    premiumActive: Number(activeResult.rows[0]?.premium_active || 0)
  };
}

async function applyReferralReward(client, userId, reward) {
  const level = await ensurePlayerLevel(client, userId);
  const maxEnergy = level.resolved?.maxEnergy || 100;
  const energyAdd = Number(reward.energy || 0);
  const commitsAdd = Number(reward.commits || 0);

  let inventoryUpdate = '';
  const inventoryParams = [];
  let paramIdx = 5;

  if (reward.stars) {
    inventoryUpdate += `inventory = COALESCE(inventory, '{}'::jsonb) || jsonb_build_object($${paramIdx}, COALESCE((inventory->>$${paramIdx})::int, 0) + $${paramIdx + 1}),`;
    inventoryParams.push('stars', Number(reward.stars));
    paramIdx += 2;
  }

  await client.query(
    `UPDATE progression
     SET commits_total = commits_total + $2,
         lifetime_loc = lifetime_loc + $2,
         commits_current = commits_current + $2,
         energy = LEAST($3, energy + $4)
         ${inventoryUpdate ? `, ${inventoryUpdate}` : ''}
     WHERE user_id = $1`,
    [userId, commitsAdd, maxEnergy, energyAdd, ...inventoryParams]
  );

  if (commitsAdd > 0) {
    await logDailyFarm(client, userId, commitsAdd);
  }

  if (reward.skin) {
    await client.query(
      `INSERT INTO user_skins (user_id, skin_id, equipped, unlocked_at)
       VALUES ($1, $2, false, NOW())
       ON CONFLICT (user_id, skin_id) DO NOTHING`,
      [userId, reward.skin]
    );
  }

  if (reward.xp) {
    await addPlayerXp(client, userId, Number(reward.xp));
  }
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

      const { total, active } = await getReferralProgress(client, ensured.userId);
      const nextMilestone = REFERRAL_MILESTONES.find((m) => active < m) || null;

      const claimedResult = await client.query(
        `SELECT milestone FROM referral_milestone_claims WHERE user_id = $1`,
        [ensured.userId]
      );
      const claimedMilestones = claimedResult.rows.map(r => r.milestone);

      const milestones = REFERRAL_MILESTONES.map((target) => ({
        target,
        reward: getMilestoneReward(target),
        reached: active >= target,
        claimed: claimedMilestones.includes(target)
      }));

      res.json({
        success: true,
        referralCode: ensured.code,
        stats: {
          total,
          active,
          activeThresholdCommits: STAGE3.REFERRAL.ACTIVE_THRESHOLD_COMMITS,
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

router.get('/status', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const client = await pool.connect();
    try {
      const ensured = await ensureUserAndCode(client, telegramUser);
      if (ensured.error) return res.status(ensured.status).json({ error: ensured.error });

      const progress = await getReferralProgress(client, ensured.userId);

      const referredResult = await client.query(
        `SELECT
           u.username,
           COALESCE(p.commits_total, 0)::int as commits_total,
           p.first_active_at,
           r.is_referred_premium,
           (COALESCE(p.commits_total, 0) >= $2 AND p.first_active_at IS NOT NULL AND p.first_active_at <= NOW() - ($3::int * INTERVAL '1 day')) as is_active
         FROM referrals r
         LEFT JOIN progression p ON p.user_id = r.referred_id
         LEFT JOIN users u ON u.id = r.referred_id
         WHERE r.referrer_id = $1
         ORDER BY r.created_at DESC`,
        [ensured.userId, STAGE3.REFERRAL.ACTIVE_THRESHOLD_COMMITS, STAGE3.REFERRAL.ANTI_FARM_DAYS]
      );

      const claimedResult = await client.query(
        `SELECT referral_state FROM progression WHERE user_id = $1`,
        [ensured.userId]
      );
      const referralState = claimedResult.rows[0]?.referral_state || {};
      const claimed = (referralState.milestonesReached || []).map(Number);
      const active = progress.active;
      const pendingRewards = getUnlockedReferralMilestones(active, claimed);
      const nextMilestone = STAGE3_REFERRAL_MILESTONES.find((milestone) => active < milestone) || null;

      return res.json({
        success: true,
        referralCode: ensured.code,
        referralLink: `https://t.me/${getBotUsername()}?startapp=${ensured.code}`,
        activeThresholdCommits: STAGE3.REFERRAL.ACTIVE_THRESHOLD_COMMITS,
        antiFarmDays: STAGE3.REFERRAL.ANTI_FARM_DAYS,
        total: progress.total,
        active,
        premiumActive: progress.premiumActive,
        nextMilestone,
        referred: referredResult.rows.map(r => ({
          username: r.username,
          commitsTotal: r.commits_total,
          firstActiveAt: r.first_active_at,
          isPremium: r.is_referred_premium === true,
          isActive: r.is_active,
          antiFarmStatus: `${Math.min(STAGE3.REFERRAL.ANTI_FARM_DAYS, Math.floor((Date.now() - new Date(r.first_active_at || Date.now()).getTime()) / (1000 * 60 * 60 * 24)))}/${STAGE3.REFERRAL.ANTI_FARM_DAYS} дней · ${r.commits_total}/${STAGE3.REFERRAL.ACTIVE_THRESHOLD_COMMITS} коммитов`
        })),
        milestones: STAGE3_REFERRAL_MILESTONES.map((milestone) => ({
          milestone,
          reward: getMilestoneReward(milestone),
          reached: active >= milestone,
          claimed: claimed.includes(milestone)
        })),
        pendingRewards
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/track', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });

  const refCode = req.body?.refCode || req.body?.referral_code || req.query?.startapp;
  const inviterTelegramId = parseReferralCode(refCode);
  if (!inviterTelegramId) return res.status(400).json({ error: 'Неверная реферальная ссылка' });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inviterResult = await client.query(
        `SELECT id FROM users WHERE telegram_id = $1`,
        [Number(inviterTelegramId)]
      );
      if (inviterResult.rows.length === 0 || Number(inviterTelegramId) === Number(telegramUser.id)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Неверная реферальная ссылка' });
      }
      const invitedResult = await client.query(
        `SELECT id FROM users WHERE telegram_id = $1`,
        [telegramUser.id]
      );
      if (invitedResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }

      const inviterId = inviterResult.rows[0].id;
      const invitedId = invitedResult.rows[0].id;
      if (inviterId === invitedId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Неверная реферальная ссылка' });
      }

      await client.query(
        `INSERT INTO referrals (referrer_id, referred_id, status, is_referred_premium)
         VALUES ($1, $2, 'pending', $3)
         ON CONFLICT (referrer_id, referred_id) DO NOTHING`,
        [inviterId, invitedId, telegramUser.is_premium === true]
      );

      const progressResult = await client.query(
        `SELECT referral_state FROM progression WHERE user_id = $1 FOR UPDATE`,
        [invitedId]
      );
      const tracked = trackReferral(progressResult.rows[0]?.referral_state || {}, inviterId);
      await client.query(
        `UPDATE progression SET referral_state = $2 WHERE user_id = $1`,
        [invitedId, JSON.stringify(tracked.state)]
      );

      await checkAchievement(client, inviterId, 'referral');
      await client.query('COMMIT');
      return res.json({ success: true, status: tracked.status });
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

router.post('/claim', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });

  const milestone = Number(req.body?.milestone || 1);
  if (!STAGE3_REFERRAL_MILESTONES.includes(milestone)) {
    return res.status(400).json({ error: 'Invalid milestone' });
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
      const progressResult = await client.query(
        `SELECT referral_state FROM progression WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );
      const referralState = progressResult.rows[0]?.referral_state || {};
      const claimed = (referralState.milestonesReached || []).map(Number);
      if (claimed.includes(milestone)) {
        await client.query('ROLLBACK');
        return res.json({
          success: true,
          already_claimed: true,
          milestone,
          reward: getMilestoneReward(milestone)
        });
      }

      const progress = await getReferralProgress(client, userId);
      if (progress.active < milestone) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Milestone not reached' });
      }

      const reward = buildReferralClaimReward(getMilestoneReward(milestone), progress.premiumActive >= milestone);
      const nextState = {
        ...referralState,
        milestonesReached: [...claimed, milestone].sort((a, b) => a - b),
        pendingRewards: (referralState.pendingRewards || []).filter((item) => Number(item.milestone) !== milestone)
      };

      await client.query(
        `UPDATE progression
         SET referral_state = $2
         WHERE user_id = $1`,
        [userId, JSON.stringify(nextState)]
      );
      await applyReferralReward(client, userId, reward);

      await client.query('COMMIT');
      return res.json({
        success: true,
        already_claimed: false,
        milestone,
        reward,
        premiumApplied: progress.premiumActive >= milestone
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

        // Создаём реферальную связь идемпотентно, без SELECT->INSERT race
        const referralInsertResult = await client.query(
          `INSERT INTO referrals (referrer_id, referred_id, status, is_referred_premium)
           VALUES ($1, $2, 'pending', $3)
           ON CONFLICT (referrer_id, referred_id) DO NOTHING
           RETURNING *`,
          [referrerId, referredId, telegramUser.is_premium === true]
        );

        const referralResult =
          referralInsertResult.rows[0]
            ? referralInsertResult
            : await client.query(
                `SELECT *
                 FROM referrals
                 WHERE referrer_id = $1 AND referred_id = $2`,
                [referrerId, referredId]
              );

        if (referralInsertResult.rows.length > 0) {
          await checkAchievement(client, referrerId, 'referral');
        }

        await client.query('COMMIT');

        res.json({
          success: true,
          referral: {
            id: referralResult.rows[0].id,
            referrerId,
            referredId,
            status: referralResult.rows[0].status,
            rewardClaimed: referralResult.rows[0].reward_claimed
          },
          existing: referralInsertResult.rows.length === 0,
          message:
            referralInsertResult.rows.length === 0
              ? 'Referral already tracked'
              : 'Referral tracked successfully'
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
  if (!STAGE3_REFERRAL_MILESTONES.includes(milestone)) {
    return res.status(400).json({ error: 'Invalid milestone' });
  }

  const rewardDef = STAGE3.REFERRAL.MILESTONE_REWARDS[milestone];
  if (!rewardDef) {
    return res.status(400).json({ error: 'Milestone reward not configured' });
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

      const progress = await getReferralProgress(client, userId);
      if (progress.active < milestone) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Milestone not reached' });
      }

      const claimedResult = await client.query(
        `SELECT id FROM referral_milestone_claims WHERE user_id = $1 AND milestone = $2`,
        [userId, milestone]
      );
      if (claimedResult.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.json({
          success: true,
          already_claimed: true,
          milestone,
          reward: buildReferralClaimReward(rewardDef.inviter || {}, progress.premiumActive >= milestone),
          premiumApplied: progress.premiumActive >= milestone
        });
      }

      const inviterReward = buildReferralClaimReward(rewardDef.inviter || {}, progress.premiumActive >= milestone);
      await applyReferralReward(client, userId, inviterReward);

      await client.query(
        `INSERT INTO referral_milestone_claims (user_id, milestone, reward_energy)
         VALUES ($1, $2, $3)`,
        [userId, milestone, Number(inviterReward.energy || 0)]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        already_claimed: false,
        milestone,
        reward: inviterReward,
        premiumApplied: progress.premiumActive >= milestone,
        newEnergy: Number(inviterReward.energy || 0)
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
