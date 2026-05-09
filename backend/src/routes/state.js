import { Router } from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../index.js';
import { recoverProgression } from '../utils/progression.js';
import { ensureDailyQuests, ensurePlayerLevel, getDailyQuestSummary, markLoginQuestComplete } from '../utils/vnext.js';
import { getActiveEvent, getEventContribution } from '../utils/events.js';
import { getContextOffer, recordOfferImpression } from '../utils/offers.js';
import { getPassStatus } from '../utils/pass.js';
import { getProductById } from '../utils/shopCatalog.js';
import { getMyTeam } from '../utils/teams.js';
import { processLoginReward } from '../utils/loginReward.js';
import { updateDailyQuestProgress } from '../utils/vnext.js';
import {
  getTeamBattleStatus,
  getUserSkins,
  getUserAchievements,
  getActiveCrunchTime,
  getReferralChain,
  getDeathState
} from '../utils/phase2State.js';

const router = Router();

import { createHash } from 'crypto';

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || null;
}

function hashDevice(req) {
  try {
    const initData = req.telegramUser?.raw || '';
    const ua = req.headers['user-agent'] || '';
    const platform = req.headers['sec-ch-ua-platform'] || '';
    const data = `${initData}:${ua}:${platform}`;
    return createHash('sha256').update(data).digest('hex').slice(0, 32);
  } catch (_e) {
    return null;
  }
}

async function ensureReferralFromStartParam(client, referredUserId, referredTelegramId, startParam, clientIp) {
  if (!startParam || !startParam.startsWith('ref_')) {
    return;
  }

  const referrerTelegramId = Number(startParam.slice(4));
  if (!Number.isFinite(referrerTelegramId) || referrerTelegramId === referredTelegramId) {
    return;
  }

  const referrerResult = await client.query(
    `SELECT id FROM users WHERE telegram_id = $1`,
    [referrerTelegramId]
  );

  if (referrerResult.rows.length === 0) {
    return;
  }

  const referrerId = referrerResult.rows[0].id;
  if (referrerId === referredUserId) {
    return;
  }

  // A-6: Enhanced antifraud
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

  // Device fingerprint: hash of initData + user-agent
  const deviceFingerprint = hashDevice(req);
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
      [referrerId, JSON.stringify({ referredId: referredUserId, reason: rejectReason, bindIp: clientIp })]
    );
    return; // silently reject
  }

  const insertResult = await client.query(
    `INSERT INTO referrals (referrer_id, referred_id, status, bind_ip, device_hash)
     VALUES ($1, $2, 'pending', $3::inet, $4)
     ON CONFLICT (referrer_id, referred_id) DO NOTHING
     RETURNING id`,
    [referrerId, referredUserId, clientIp || null, deviceFingerprint]
  );

  // Only log antifraud audit on actual new bindings, not on duplicate state checks
  if (fraudFlag && insertResult.rows.length > 0) {
    await client.query(
      `INSERT INTO audit_logs (user_id, action, context)
       VALUES ($1, 'referral_bind_flagged', $2::jsonb)`,
      [referrerId, JSON.stringify({ referredId: referredUserId, flag: fraudFlag, bindIp: clientIp })]
    );
  }

  // Update invite_friend daily quest for the referrer on actual new binding
  if (insertResult.rows.length > 0) {
    await ensureDailyQuests(client, referrerId);
    await updateDailyQuestProgress(client, referrerId, { tapDelta: 0, commitDelta: 0, energyDelta: 0 });
    // Manually mark invite_friend as completed since updateDailyQuestProgress only handles tap/commit/energy
    await client.query(
      `UPDATE daily_quests
       SET progress_value = LEAST(target_value, progress_value + 1),
           completed = (progress_value + 1) >= target_value,
           completed_at = CASE
             WHEN completed THEN completed_at
             WHEN (progress_value + 1) >= target_value THEN NOW()
             ELSE completed_at
           END
       WHERE user_id = $1
         AND quest_date = CURRENT_DATE
         AND quest_type = 'invite_friend'`,
      [referrerId]
    );
  }
}

/**
 * GET /api/state — текущее состояние игрока
 * Returns: { user, progression, activeSession? }
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
        `INSERT INTO users (telegram_id, username, first_name, last_name, photo_url, feature_flags)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (telegram_id) DO UPDATE SET
           username = COALESCE(EXCLUDED.username, users.username),
           first_name = COALESCE(EXCLUDED.first_name, users.first_name),
           last_name = COALESCE(EXCLUDED.last_name, users.last_name),
           photo_url = COALESCE(EXCLUDED.photo_url, users.photo_url),
           last_active = NOW()
         RETURNING id, telegram_id, username, first_name, last_name, photo_url, created_at, last_active, feature_flags`,
        [
          telegramUser.id,
          telegramUser.username || null,
          telegramUser.first_name || null,
          telegramUser.last_name || null,
          telegramUser.photo_url || null,
          JSON.stringify({ stress_v2: (telegramUser.id % 100) < 50 })
        ]
      );

      let user = userResult.rows[0];

      // Backfill A/B cohort for existing users who don't have feature_flags yet
      if (!user.feature_flags || Object.keys(user.feature_flags).length === 0) {
        const computedFlags = { stress_v2: (user.telegram_id % 100) < 50 };
        const updateResult = await client.query(
          `UPDATE users
           SET feature_flags = $1::jsonb
           WHERE id = $2
           RETURNING feature_flags`,
          [JSON.stringify(computedFlags), user.id]
        );
        user.feature_flags = updateResult.rows[0]?.feature_flags || computedFlags;
      }

      await ensureReferralFromStartParam(
        client,
        user.id,
        user.telegram_id,
        req.telegramUser?.startParam,
        getClientIp(req)
      );

      const progressInsertResult = await client.query(
        `INSERT INTO progression (user_id)
         VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING
         RETURNING *`,
        [user.id]
      );

      const progressRow = progressInsertResult.rows[0] || (
        await client.query(
          `SELECT * FROM progression WHERE user_id = $1`,
          [user.id]
        )
      ).rows[0];

      const level = await ensurePlayerLevel(client, user.id);
      const rankMeta = level.resolved;
      const userFeatureFlags = user.feature_flags || {};
      const progression = await recoverProgression(client, progressRow, rankMeta.maxEnergy, userFeatureFlags);

      const sessionResult = await client.query(
        `INSERT INTO sessions (session_id, user_id, ip_address)
         SELECT $1, $2, NULL
         WHERE NOT EXISTS (
           SELECT 1 FROM sessions
            WHERE user_id = $2
              AND ended_at IS NULL
              AND started_at > NOW() - INTERVAL '30 minutes'
         )
         RETURNING *`,
        [randomUUID(), user.id]
      );

      let activeSession = sessionResult.rows[0] || null;
      if (!activeSession) {
        const activeResult = await client.query(
          `SELECT * FROM sessions
           WHERE user_id = $1 AND ended_at IS NULL
           ORDER BY started_at DESC
           LIMIT 1`,
          [user.id]
        );
        activeSession = activeResult.rows[0] || null;
      }

      // Статистика за сегодня
      const todayStats = await client.query(
        `SELECT COALESCE(SUM(taps_count), 0) as taps_today,
                COALESCE(SUM(commits_earned), 0) as commits_today
         FROM sessions 
         WHERE user_id = $1 AND started_at >= CURRENT_DATE`,
        [user.id]
      );

      await ensureDailyQuests(client, user.id);
      await markLoginQuestComplete(client, user.id);
      const loginReward = await processLoginReward(client, user.id);
      const daily = await getDailyQuestSummary(client, user.id);

      const event = await getActiveEvent(client);
      const eventContribution = event ? await getEventContribution(client, user.id, event.id) : null;
      const passStatus = await getPassStatus(client, user.id);
      const myTeam = await getMyTeam(client, user.id);
      const contextOffer = await getContextOffer(client, user.id, {
        energy: progression.energy,
        maxEnergy: rankMeta.maxEnergy,
        depression: progression.depression_level,
        xpProgress: level.resolved.progressInLevel,
        xpRequiredForNext: level.resolved.requiredForNextLevel,
        featureFlags: userFeatureFlags
      });
      if (contextOffer?.type) {
        await recordOfferImpression(client, user.id, contextOffer.type, 'state');
      }

      // Phase 2 state extensions
      const teamBattle = await getTeamBattleStatus(client, user.id, myTeam?.id);
      const skins = await getUserSkins(client, user.id);
      const achievements = await getUserAchievements(client, user.id);
      const crunchTime = await getActiveCrunchTime(client);
      const referralChain = await getReferralChain(client, user.id);
      const { isDead, death } = getDeathState(progression);

      res.json({
        user: {
          id: user.id,
          telegramId: user.telegram_id,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          photoUrl: user.photo_url,
          createdAt: user.created_at,
          lastActive: user.last_active
        },
        featureFlags: userFeatureFlags,
        stressCohort: userFeatureFlags?.stress_v2 ? 'test' : 'control',
        progression: progression ? {
          tier: progression.tier,
          tierName: getTierName(progression.tier),
          commitsTotal: parseInt(progression.commits_total),
          commitsCurrent: parseInt(progression.commits_current),
          energy: progression.energy,
          depressionLevel: progression.depression_level,
          streakDays: progression.streak_days,
          updatedAt: progression.updated_at
        } : null,
        game: {
          tier: progression.tier,
          commits_total: parseInt(progression.commits_total),
          commits_current: parseInt(progression.commits_current),
          energy: progression.energy,
          depression_level: progression.depression_level,
          streak_days: progression.streak_days,
          updated_at: progression.updated_at
        },
        progressionUpdatedAt: progression?.updated_at ?? null,
        serverNow: new Date().toISOString(),
        level: level.resolved,
        maxEnergy: rankMeta.maxEnergy,
        recoveryIntervalSeconds: parseInt(process.env.ENERGY_RECOVERY_INTERVAL_SECONDS || '60', 10),
        daily,
        loginReward,
        activeSession: activeSession ? {
          sessionId: activeSession.session_id,
          startedAt: activeSession.started_at,
          tapsCount: activeSession.taps_count,
          commitsEarned: activeSession.commits_earned
        } : null,
        today: {
          taps: parseInt(todayStats.rows[0].taps_today),
          commits: parseInt(todayStats.rows[0].commits_today)
        },
        event: event ? {
          id: event.id,
          type: event.event_type,
          title: event.title,
          description: event.description,
          startDate: event.start_date,
          endDate: event.end_date,
          targetCommits: event.target_commits,
          rewardPayload: event.reward_payload,
          myContribution: eventContribution ? {
            commitsContributed: eventContribution.commits_contributed,
            claimed: eventContribution.claimed,
            progressPercent: Math.min(100, Math.round((eventContribution.commits_contributed / event.target_commits) * 100))
          } : null
        } : null,
        pass: passStatus ? {
          ...passStatus,
          premiumPassProduct: getProductById('premium_pass')
        } : null,
        team: myTeam,
        contextOffer,
        teamBattle,
        skins,
        achievements,
        crunchTime,
        referralChain,
        isDead,
        death
      });

    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

function getTierName(tier) {
  const names = {
    1: 'Junior',
    2: 'Middle',
    3: 'Senior',
    4: 'Lead',
    5: 'CTO'
  };
  return names[tier] || 'Unknown';
}

export default router;
