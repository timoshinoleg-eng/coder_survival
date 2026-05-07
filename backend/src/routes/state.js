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

const router = Router();

async function ensureReferralFromStartParam(client, referredUserId, referredTelegramId, startParam) {
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

  await client.query(
    `INSERT INTO referrals (referrer_id, referred_id, status)
     SELECT $1, $2, 'pending'
     WHERE NOT EXISTS (
       SELECT 1
       FROM referrals
       WHERE referrer_id = $1 AND referred_id = $2
     )`,
    [referrerId, referredUserId]
  );
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
        `INSERT INTO users (telegram_id, username, first_name, last_name, photo_url)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (telegram_id) DO UPDATE SET
           username = COALESCE(EXCLUDED.username, users.username),
           first_name = COALESCE(EXCLUDED.first_name, users.first_name),
           last_name = COALESCE(EXCLUDED.last_name, users.last_name),
           photo_url = COALESCE(EXCLUDED.photo_url, users.photo_url),
           last_active = NOW()
         RETURNING id, telegram_id, username, first_name, last_name, photo_url, created_at, last_active`,
        [
          telegramUser.id,
          telegramUser.username || null,
          telegramUser.first_name || null,
          telegramUser.last_name || null,
          telegramUser.photo_url || null
        ]
      );

      const user = userResult.rows[0];
      await ensureReferralFromStartParam(
        client,
        user.id,
        user.telegram_id,
        req.telegramUser?.startParam
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
      const progression = await recoverProgression(client, progressRow, rankMeta.maxEnergy);

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
        xpRequiredForNext: level.resolved.requiredForNextLevel
      });
      if (contextOffer?.type) {
        await recordOfferImpression(client, user.id, contextOffer.type, 'state');
      }

      res.json({
        user: {
          id: user.id,
          telegramId: user.telegram_id,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          createdAt: user.created_at,
          lastActive: user.last_active
        },
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
        contextOffer
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
