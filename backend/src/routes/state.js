import { Router } from "express";
import { randomUUID, createHash } from "crypto";
import { pool } from "../index.js";
import { STAGE4 } from "../config/balance.js";
import {
  getEffectiveRecoveryIntervalSeconds,
  getRecoveryEtaSeconds,
  recoverProgression,
} from "../utils/progression.js";
import {
  ensureDailyQuests,
  ensurePlayerLevel,
  markLoginQuestComplete,
  updateDailyQuestProgress,
} from "../utils/vnext.js";
import { getActiveEvent, getEventContribution } from "../utils/events.js";
import { getContextOffer, recordOfferImpression } from "../utils/offers.js";
import { getPassStatus, getActivePass } from "../utils/pass.js";
import { logPassXp } from "../utils/passXpLog.js";
import { getProductById } from "../utils/shopCatalog.js";
import { getMyTeam } from "../utils/teams.js";
import { processLoginReward } from "../utils/loginReward.js";
import {
  getTeamBattleStatus,
  getUserSkins,
  getUserAchievements,
  getActiveCrunchTime,
  getReferralChain,
} from "../utils/phase2State.js";
import { checkAchievement, ensureAchievementRows } from "../utils/achievements.js";
import { isReferralActive } from "../utils/referral.js";
import { STAGE3 } from "../config/balance.js";
import { pruneExpiredEffects, getActiveEffects } from "../utils/activeEffects.js";

const router = Router();

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || null;
}

function hashDevice(req) {
  try {
    const initData = req.telegramUser?.raw || "";
    const ua = req.headers["user-agent"] || "";
    const platform = req.headers["sec-ch-ua-platform"] || "";
    const data = `${initData}:${ua}:${platform}`;
    return createHash("sha256").update(data).digest("hex").slice(0, 32);
  } catch (_e) {
    return null;
  }
}

async function ensureReferralFromStartParam(
  client,
  referredUserId,
  referredTelegramId,
  startParam,
  clientIp,
  deviceFingerprint,
) {
  if (!startParam || !startParam.startsWith("ref_")) {
    return;
  }

  const referrerTelegramId = Number(startParam.slice(4));
  if (
    !Number.isFinite(referrerTelegramId) ||
    referrerTelegramId === referredTelegramId
  ) {
    return;
  }

  const referrerResult = await client.query(
    `SELECT id FROM users WHERE telegram_id = $1`,
    [referrerTelegramId],
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
      [clientIp],
    );
    const ipCount = parseInt(ipCountResult.rows[0].cnt, 10);
    if (ipCount >= 5) {
      hardReject = true;
      rejectReason = "ip_hard_limit";
    } else if (ipCount >= 3) {
      fraudFlag = "high_ip_volume";
    }
  }

  // Device fingerprint: hash of initData + user-agent
  if (deviceFingerprint && !hardReject) {
    const deviceResult = await client.query(
      `SELECT referrer_id, COUNT(*) as cnt
       FROM referrals
       WHERE device_hash = $1
         AND created_at > NOW() - INTERVAL '7 days'
       GROUP BY referrer_id`,
      [deviceFingerprint],
    );
    const uniqueReferrers = deviceResult.rows.length;
    if (uniqueReferrers >= 3) {
      hardReject = true;
      rejectReason = "device_multi_referrer";
    } else if (uniqueReferrers >= 2) {
      fraudFlag = fraudFlag || "device_shared";
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
          bindIp: clientIp,
        }),
      ],
    );
    return; // silently reject
  }

  const insertResult = await client.query(
    `INSERT INTO referrals (referrer_id, referred_id, status, bind_ip, device_hash)
     VALUES ($1, $2, 'pending', $3::inet, $4)
     ON CONFLICT (referrer_id, referred_id) DO NOTHING
     RETURNING id`,
    [referrerId, referredUserId, clientIp || null, deviceFingerprint],
  );

  // Only log antifraud audit on actual new bindings, not on duplicate state checks
  if (fraudFlag && insertResult.rows.length > 0) {
    await client.query(
      `INSERT INTO audit_logs (user_id, action, context)
       VALUES ($1, 'referral_bind_flagged', $2::jsonb)`,
      [
        referrerId,
        JSON.stringify({
          referredId: referredUserId,
          flag: fraudFlag,
          bindIp: clientIp,
        }),
      ],
    );
  }

  // Update invite_friend daily quest for the referrer on actual new binding
  if (insertResult.rows.length > 0) {
    await ensureDailyQuests(client, referrerId);
    await updateDailyQuestProgress(client, referrerId, {
      tapDelta: 0,
      commitDelta: 0,
      energyDelta: 0,
    });
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
      [referrerId],
    );

    const activePass = await getActivePass(client);
    if (activePass) {
      await logPassXp(client, referrerId, activePass.id, 'social', 25, { referredId: referredUserId, action: 'referral_bind' });
    }
  }
}

/**
 * GET /api/state — текущее состояние игрока
 * Returns: { user, progression, activeSession? }
 */
router.get("/", async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: "No user in initData" });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

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
          JSON.stringify({ stress_v2: true }),
        ],
      );

      let user = userResult.rows[0];

      // Backfill A/B cohort for existing users who don't have feature_flags yet
      if (!user.feature_flags || Object.keys(user.feature_flags).length === 0) {
        const computedFlags = { stress_v2: true };
        const updateResult = await client.query(
          `UPDATE users
           SET feature_flags = $1::jsonb
           WHERE id = $2
           RETURNING feature_flags`,
          [JSON.stringify(computedFlags), user.id],
        );
        user.feature_flags =
          updateResult.rows[0]?.feature_flags || computedFlags;
      }

      await ensureReferralFromStartParam(
        client,
        user.id,
        user.telegram_id,
        req.telegramUser?.startParam,
        getClientIp(req),
        hashDevice(req),
      );

      const progressInsertResult = await client.query(
        `INSERT INTO progression (user_id)
         VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING
         RETURNING *`,
        [user.id],
      );

      const progressRow =
        progressInsertResult.rows[0] ||
        (
          await client.query(`SELECT * FROM progression WHERE user_id = $1`, [
            user.id,
          ])
        ).rows[0];

      const level = await ensurePlayerLevel(client, user.id);
      await ensureAchievementRows(client, user.id);
      const rankMeta = level.resolved;
      const userFeatureFlags = user.feature_flags || {};
      const skinResult = await client.query(
        `SELECT 1 FROM user_skins WHERE user_id = $1 AND skin_id = 'senior_pajamas' AND equipped = true`,
        [user.id]
      );
      const skinRecoveryMult = skinResult.rows.length > 0 ? 1.05 : 1;

      const progression = await recoverProgression(
        client,
        progressRow,
        rankMeta.maxEnergy,
        skinRecoveryMult,
      );

      // Phase 6: prune expired active effects
      const prunedEffects = pruneExpiredEffects(progression.active_effects || {});
      if (JSON.stringify(prunedEffects) !== JSON.stringify(progression.active_effects || {})) {
        await client.query(
          `UPDATE progression SET active_effects = $2 WHERE user_id = $1`,
          [user.id, JSON.stringify(prunedEffects)]
        );
      }
      progression.active_effects = prunedEffects;
      const activeEffects = getActiveEffects(prunedEffects);

      const idleRecovery = progression?._idleRecovery || null;
      const careerStory = await ensureCareerStoryUnlocked(
        client,
        user.id,
        progression?.career_story || progressRow?.career_story || {},
        Number(level.resolved?.rank || progression?.tier || 1),
      );

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
        [randomUUID(), user.id],
      );

      const createdNewSession = sessionResult.rows.length > 0;
      let activeSession = createdNewSession ? sessionResult.rows[0] : null;
      if (!activeSession) {
        const activeResult = await client.query(
          `SELECT * FROM sessions
           WHERE user_id = $1 AND ended_at IS NULL
           ORDER BY started_at DESC
           LIMIT 1`,
          [user.id],
        );
        activeSession = activeResult.rows[0] || null;
      }

      if (createdNewSession && activeSession?.started_at) {
        await checkAchievement(client, user.id, "night_session", {
          sessionStartedAt: activeSession.started_at,
        });
      }

      // Статистика за сегодня
      const todayStats = await client.query(
        `SELECT COALESCE(SUM(taps_count), 0) as taps_today,
                COALESCE(SUM(commits_earned), 0) as commits_today
         FROM sessions
         WHERE user_id = $1 AND started_at >= CURRENT_DATE`,
        [user.id],
      );

      await ensureDailyQuests(client, user.id);
      await markLoginQuestComplete(client, user.id);
      const loginReward = await processLoginReward(client, user.id);

      const dailyQuestStateResult = await client.query(
        `SELECT daily_quests_state FROM progression WHERE user_id = $1`,
        [user.id]
      );
      const dailyQuestState = dailyQuestStateResult.rows[0]?.daily_quests_state || {};
      const daily = {
        total: Array.isArray(dailyQuestState.quests) ? dailyQuestState.quests.length : 0,
        completed: Array.isArray(dailyQuestState.quests) ? dailyQuestState.quests.filter((q) => q.completed).length : 0,
        claimed: Array.isArray(dailyQuestState.quests) ? dailyQuestState.quests.filter((q) => q.claimed).length : 0,
        claimable: Array.isArray(dailyQuestState.quests) ? dailyQuestState.quests.filter((q) => q.completed && !q.claimed).length : 0,
        quests: Array.isArray(dailyQuestState.quests) ? dailyQuestState.quests : [],
        fullClearAvailable: Array.isArray(dailyQuestState.quests) && dailyQuestState.quests.length === 4 && dailyQuestState.quests.every((q) => q.completed) && !dailyQuestState.fullClearClaimed,
        fullClearClaimed: dailyQuestState.fullClearClaimed === true,
      };

      const event = await getActiveEvent(client);
      const eventContribution = event
        ? await getEventContribution(client, user.id, event.id)
        : null;
      const passStatus = await getPassStatus(client, user.id);
      const myTeam = await getMyTeam(client, user.id);
      const contextOffer = await getContextOffer(client, user.id, {
        energy: progression.energy,
        maxEnergy: rankMeta.maxEnergy,
        depression: progression.depression_level,
        xpProgress: level.resolved.progressInLevel,
        xpRequiredForNext: level.resolved.requiredForNextLevel,
        featureFlags: userFeatureFlags,
      });
      if (contextOffer?.type) {
        await recordOfferImpression(
          client,
          user.id,
          contextOffer.type,
          "state",
        );
      }

      // Phase 2 state extensions
      const teamBattle = await getTeamBattleStatus(
        client,
        user.id,
        myTeam?.team?.id,
      );
      const skins = await getUserSkins(client, user.id);
      const achievements = await getUserAchievements(client, user.id);
      const crunchTime = await getActiveCrunchTime(client);
      const referralChain = await getReferralChain(client, user.id);
      const isBurnout = Number(progression.depression_level ?? 0) >= 100;
      if (isBurnout) {
        await checkAchievement(client, user.id, 'burnout');
      }

      // Phase 5: Auto-grant invited referral reward when anti-farm threshold reached
      const referralState = progression.referral_state || {};
      if (referralState.invitedBy && !referralState.invitedRewardGranted) {
        if (isReferralActive(progression)) {
          const invitedReward = STAGE3.REFERRAL.MILESTONE_REWARDS[1]?.invited || {};
          await client.query(
            `UPDATE progression
             SET commits_total = commits_total + $2,
                 inventory = COALESCE(inventory, '{}'::jsonb) || $3::jsonb,
                 referral_state = COALESCE(referral_state, '{}'::jsonb) || '{"invitedRewardGranted": true}'::jsonb
             WHERE user_id = $1`,
            [
              user.id,
              invitedReward.commits || 0,
              JSON.stringify(invitedReward.inventory || {})
            ]
          );
        }
      }

      const recoveryIntervalSeconds = getEffectiveRecoveryIntervalSeconds(progression, new Date(), skinRecoveryMult);
      const recoveryEtaSeconds = getRecoveryEtaSeconds(
        progression,
        rankMeta.maxEnergy,
        new Date(),
        skinRecoveryMult,
      );

      await client.query("COMMIT");

      res.json({
        user: {
          id: user.id,
          telegramId: user.telegram_id,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          photoUrl: user.photo_url,
          createdAt: user.created_at,
          lastActive: user.last_active,
        },
        featureFlags: userFeatureFlags,
        stressCohort: userFeatureFlags?.stress_v2 ? "test" : "control",
        progression: progression
          ? {
              tier: progression.tier,
              tierName: getTierName(progression.tier),
              commitsTotal: parseInt(progression.commits_total),
              commitsCurrent: parseInt(progression.commits_current),
              energy: progression.energy,
              depressionLevel: progression.depression_level,
              streakDays: progression.streak_days,
              updatedAt: progression.updated_at,
              onboardingCompleted: progression.onboarding_completed === true,
              inventory: progression.inventory || {},
              isBurnout,
            }
          : null,
        game: {
          tier: progression.tier,
          commits_total: parseInt(progression.commits_total),
          commits_current: parseInt(progression.commits_current),
          energy: progression.energy,
          depression_level: progression.depression_level,
          streak_days: progression.streak_days,
          updated_at: progression.updated_at,
          onboarding_completed: progression.onboarding_completed === true,
          inventory: progression.inventory || {},
          is_burnout: isBurnout,
        },
        progressionUpdatedAt: progression?.updated_at ?? null,
        serverNow: new Date().toISOString(),
        level: level.resolved,
        maxEnergy: rankMeta.maxEnergy,
        recoveryIntervalSeconds,
        recoveryEtaSeconds,
        daily,
        loginReward,
        activeSession: activeSession
          ? {
              sessionId: activeSession.session_id,
              startedAt: activeSession.started_at,
              tapsCount: activeSession.taps_count,
              commitsEarned: activeSession.commits_earned,
            }
          : null,
        today: {
          taps: parseInt(todayStats.rows[0].taps_today),
          commits: parseInt(todayStats.rows[0].commits_today),
        },
        event: event
          ? {
              id: event.id,
              type: event.event_type,
              title: event.title,
              description: event.description,
              startDate: event.start_date,
              endDate: event.end_date,
              targetCommits: event.target_commits,
              rewardPayload: event.reward_payload,
              myContribution: eventContribution
                ? {
                    commitsContributed: eventContribution.commits_contributed,
                    claimed: eventContribution.claimed,
                    progressPercent: Math.min(
                      100,
                      Math.round(
                        (eventContribution.commits_contributed /
                          event.target_commits) *
                          100,
                      ),
                    ),
                  }
                : null,
            }
          : null,
        pass: passStatus
          ? {
              ...passStatus,
              premiumPassProduct: getProductById("premium_pass"),
            }
          : null,
        team: myTeam,
        contextOffer,
        teamBattle,
        skins,
        achievements,
        activeEffects,
        crunchTime,
        referralChain,
        careerStory,
        isBurnout,
        idleRecovery,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

function getTierName(tier) {
  const names = {
    1: "Junior",
    2: "Middle",
    3: "Senior",
    4: "Lead",
    5: "CTO",
  };
  return names[tier] || "Unknown";
}

async function ensureCareerStoryUnlocked(client, userId, careerStory = {}, currentRank = 1) {
  const unlocked = new Set((careerStory.unlockedBeats || []).map(Number));
  const newlyUnlocked = Object.entries(STAGE4.CAREER_STORY.BEATS)
    .filter(([id]) => Number(id) <= currentRank && !unlocked.has(Number(id)))
    .map(([id]) => Number(id));

  if (newlyUnlocked.length === 0) return careerStory;

  for (const beatId of newlyUnlocked) unlocked.add(beatId);
  const nextStory = {
    ...careerStory,
    unlockedBeats: Array.from(unlocked).sort((left, right) => left - right),
    lastPromptedAt: newlyUnlocked[newlyUnlocked.length - 1]
  };

  await client.query(
    `UPDATE progression
     SET career_story = $2
     WHERE user_id = $1`,
    [userId, JSON.stringify(nextStory)]
  );

  return nextStory;
}

export default router;
