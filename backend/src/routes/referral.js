import { Router } from 'express';
import { pool } from '../index.js';
import { STAGE3 } from '../config/balance.js';
import { logDailyFarm } from '../utils/farmLog.js';
import { ensurePlayerLevel, addPlayerXp } from '../utils/vnext.js';
import { buildReferralClaimReward, getUnlockedReferralMilestones, parseReferralCode, trackReferral } from '../utils/referral.js';
import { checkAchievement } from '../utils/achievements.js';

const router = Router();
const internalReferralRouter = Router();
const REFERRAL_MILESTONES = Object.keys(STAGE3.REFERRAL.MILESTONE_REWARDS).map(Number).sort((a, b) => a - b);
const STAGE3_REFERRAL_MILESTONES = Object.keys(STAGE3.REFERRAL.MILESTONE_REWARDS).map(Number).sort((a, b) => a - b);

function getBotUsername() {
  return process.env.BOT_USERNAME || 'coder_survival_bot';
}

function getMilestoneReward(milestone) {
  return STAGE3.REFERRAL.MILESTONE_REWARDS[milestone]?.inviter || {};
}

function getClaimedMilestones(referralState, legacyClaimRows = []) {
  const fromState = Array.isArray(referralState?.milestonesReached)
    ? referralState.milestonesReached.map(Number)
    : [];
  const fromLegacy = legacyClaimRows.map((row) => Number(row.milestone));
  return Array.from(new Set([...fromState, ...fromLegacy])).sort((a, b) => a - b);
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
    inventoryUpdate += `inventory = COALESCE(inventory, '{}'::jsonb) || jsonb_build_object($${paramIdx}, COALESCE((inventory->>$${paramIdx})::int, 0) + $${paramIdx + 1})`;
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

async function bindReferral({
  client,
  referrerTelegramId,
  referredTelegramId,
  referredProfile = {},
  isReferredPremium = false,
  clientIp = null,
  deviceFingerprint = null
}) {
  if (
    !Number.isFinite(Number(referrerTelegramId)) ||
    !Number.isFinite(Number(referredTelegramId)) ||
    Number(referrerTelegramId) === Number(referredTelegramId)
  ) {
    return { ok: false, status: 400, error: 'Invalid referral payload' };
  }

  const referrerResult = await client.query(
    `SELECT id FROM users WHERE telegram_id = $1`,
    [Number(referrerTelegramId)]
  );
  if (referrerResult.rows.length === 0) {
    return { ok: false, status: 404, error: 'Referrer not found' };
  }

  const referrerId = referrerResult.rows[0].id;
  const referredUserResult = await client.query(
    `INSERT INTO users (telegram_id, username, first_name, last_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_id) DO UPDATE SET
       username = COALESCE(EXCLUDED.username, users.username),
       first_name = COALESCE(EXCLUDED.first_name, users.first_name),
       last_name = COALESCE(EXCLUDED.last_name, users.last_name)
     RETURNING id`,
    [
      Number(referredTelegramId),
      referredProfile.username || null,
      referredProfile.firstName || null,
      referredProfile.lastName || null
    ]
  );
  const referredUserId = referredUserResult.rows[0].id;

  if (referrerId === referredUserId) {
    return { ok: false, status: 400, error: 'Self-referral is not allowed' };
  }

  await client.query(
    `INSERT INTO progression (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [referredUserId]
  );
  const progressResult = await client.query(
    `SELECT referral_state FROM progression WHERE user_id = $1 FOR UPDATE`,
    [referredUserId]
  );
  const currentReferralState = progressResult.rows[0]?.referral_state || {};
  const existingInvitedBy = Number(currentReferralState.invitedBy || 0);
  if (existingInvitedBy && existingInvitedBy !== referrerId) {
    return { ok: true, created: false, existing: true, status: 'already_referred' };
  }

  let fraudFlag = null;
  let hardReject = false;
  let rejectReason = null;

  if (clientIp) {
    const ipCountResult = await client.query(
      `SELECT COUNT(*) as cnt
       FROM referrals
       WHERE bind_ip = $1::inet
         AND created_at > NOW() - INTERVAL '1 day'`,
      [clientIp]
    );
    const ipCount = parseInt(ipCountResult.rows[0].cnt, 10);
    if (ipCount >= 5) {
      hardReject = true;
      rejectReason = 'ip_hard_limit';
    } else if (ipCount >= 3) {
      fraudFlag = 'high_ip_volume';
    }
  }

  if (deviceFingerprint && !hardReject) {
    const deviceResult = await client.query(
      `SELECT referrer_id, COUNT(*) as cnt
       FROM referrals
       WHERE device_hash = $1
         AND created_at > NOW() - INTERVAL '7 days'
       GROUP BY referrer_id`,
      [deviceFingerprint]
    );
    const uniqueReferrers = deviceResult.rows.length;
    if (uniqueReferrers >= 3) {
      hardReject = true;
      rejectReason = 'device_multi_referrer';
    } else if (uniqueReferrers >= 2) {
      fraudFlag = fraudFlag || 'device_shared';
    }
  }

  if (hardReject) {
    await client.query(
      `INSERT INTO audit_logs (user_id, action, context)
       VALUES ($1, 'referral_bind_rejected', $2::jsonb)`,
      [
        referrerId,
        JSON.stringify({
          referredId: referredUserId,
          reason: rejectReason,
          bindIp: clientIp
        })
      ]
    );
    return { ok: true, created: false, existing: false, rejected: true, status: 'rejected' };
  }

  const insertResult = await client.query(
    `INSERT INTO referrals (referrer_id, referred_id, status, bind_ip, device_hash, is_referred_premium)
     VALUES ($1, $2, 'pending', $3::inet, $4, $5)
     ON CONFLICT (referrer_id, referred_id) DO NOTHING
     RETURNING id`,
    [referrerId, referredUserId, clientIp, deviceFingerprint, isReferredPremium]
  );

  const tracked = trackReferral(currentReferralState, referrerId);
  await client.query(
    `UPDATE progression SET referral_state = $2 WHERE user_id = $1`,
    [referredUserId, JSON.stringify(tracked.state)]
  );

  if (fraudFlag && insertResult.rows.length > 0) {
    await client.query(
      `INSERT INTO audit_logs (user_id, action, context)
       VALUES ($1, 'referral_bind_flagged', $2::jsonb)`,
      [
        referrerId,
        JSON.stringify({
          referredId: referredUserId,
          flag: fraudFlag,
          bindIp: clientIp
        })
      ]
    );
  }

  if (insertResult.rows.length > 0) {
    await checkAchievement(client, referrerId, 'referral');
  }

  return {
    ok: true,
    created: insertResult.rows.length > 0,
    existing: insertResult.rows.length === 0,
    status: tracked.status,
    referrerId,
    referredUserId
  };
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
 * GET /api/referral/social-proof
 */
router.get('/social-proof', async (req, res, next) => {
  try {
    const client = await pool.connect();
    try {
      const weeklyJoinsResult = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM users
         WHERE created_at >= NOW() - INTERVAL '7 days'`
      );

      const topReferrerResult = await client.query(
        `SELECT
           u.username,
           COUNT(*)::int AS active_count
         FROM referrals r
         JOIN users u ON u.id = r.referrer_id
         LEFT JOIN progression p ON p.user_id = r.referred_id
         WHERE r.status != 'rejected'
           AND COALESCE(p.commits_total, 0) >= $1
           AND p.first_active_at IS NOT NULL
           AND p.first_active_at <= NOW() - ($2::int * INTERVAL '1 day')
         GROUP BY r.referrer_id, u.username
         ORDER BY active_count DESC
         LIMIT 1`,
        [STAGE3.REFERRAL.ACTIVE_THRESHOLD_COMMITS, STAGE3.REFERRAL.ANTI_FARM_DAYS]
      );

      res.json({
        success: true,
        weeklyJoins: weeklyJoinsResult.rows[0]?.count || 0,
        topReferrer: topReferrerResult.rows[0]
          ? { name: topReferrerResult.rows[0].username || 'Аноним', count: topReferrerResult.rows[0].active_count }
          : null,
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/referral/activity
 */
router.get('/activity', async (req, res, next) => {
  try {
    const client = await pool.connect();
    try {
      const rows = await client.query(
        `SELECT
           al.action,
           al.context,
           al.created_at,
           u.username
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.user_id
         WHERE al.action IN ('referral_bind_flagged', 'referral_bind_rejected')
            OR al.context->>'action' IN ('referral_bind', 'referral_active')
         ORDER BY al.created_at DESC
         LIMIT 10`
      );

      const activity = rows.rows.map((r) => {
        const ctx = r.context || {};
        const referredUsername = ctx.referredUsername || null;
        const isNowActive = r.action === 'referral_bind_flagged' ? false : (ctx.action === 'referral_active');
        return {
          action: r.action,
          username: r.username,
          referredUsername,
          isNowActive,
          createdAt: r.created_at,
        };
      });

      res.json({ success: true, activity });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

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

      const [progressResult, claimedResult] = await Promise.all([
        client.query(
          `SELECT referral_state FROM progression WHERE user_id = $1`,
          [ensured.userId]
        ),
        client.query(
          `SELECT milestone FROM referral_milestone_claims WHERE user_id = $1`,
          [ensured.userId]
        )
      ]);
      const referralState = progressResult.rows[0]?.referral_state || {};
      const claimedMilestones = getClaimedMilestones(referralState, claimedResult.rows);

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
        referralLink: `https://t.me/${getBotUsername()}?start=${ensured.code}`
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
        referralLink: `https://t.me/${getBotUsername()}?start=${ensured.code}`,
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

  const refCode = req.body?.refCode || req.body?.referral_code || req.query?.start || req.query?.startapp;
  const inviterTelegramId = parseReferralCode(refCode);
  if (!inviterTelegramId) return res.status(400).json({ error: 'Неверная реферальная ссылка' });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const bindResult = await bindReferral({
        client,
        referrerTelegramId: Number(inviterTelegramId),
        referredTelegramId: Number(telegramUser.id),
        referredProfile: {
          username: telegramUser.username || null,
          firstName: telegramUser.first_name || null,
          lastName: telegramUser.last_name || null
        },
        isReferredPremium: telegramUser.is_premium === true
      });
      if (!bindResult.ok) {
        await client.query('ROLLBACK');
        return res.status(bindResult.status).json({ error: bindResult.error });
      }

      await client.query('COMMIT');
      return res.json({
        success: true,
        status: bindResult.status,
        existing: bindResult.existing === true
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

internalReferralRouter.post('/track-bot-entry', async (req, res, next) => {
  const secret = req.headers['x-bot-backend-secret'];
  if (!process.env.BOT_BACKEND_SECRET || secret !== process.env.BOT_BACKEND_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const telegramId = Number(req.body?.telegramId);
  const referrerTelegramId = Number(req.body?.referrerId);
  if (!Number.isFinite(telegramId) || !Number.isFinite(referrerTelegramId)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const bindResult = await bindReferral({
        client,
        referrerTelegramId,
        referredTelegramId: telegramId,
        referredProfile: {
          username: req.body?.username || null,
          firstName: req.body?.firstName || null,
          lastName: req.body?.lastName || null
        },
        isReferredPremium: req.body?.isPremium === true
      });
      if (!bindResult.ok) {
        await client.query('ROLLBACK');
        return res.status(bindResult.status).json({ error: bindResult.error });
      }

      await client.query('COMMIT');
      // The current referrals schema has no source column, so bot/source is audit-only for now.
      return res.json({
        ok: true,
        created: bindResult.created,
        existing: bindResult.existing,
        status: bindResult.status,
        sourcePersisted: false
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

export { internalReferralRouter };
export default router;
