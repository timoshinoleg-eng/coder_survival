import { Router } from "express";
import { randomUUID, createHash } from "crypto";
import { pool } from "../index.js";
import { STAGE4, TAP_MECHANICS, PRESTIGE } from "../config/balance.js";
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
import { markLoginQuestCompleteInState, getQuestDateString } from "../utils/dailyQuests.js";
import { parseTimezoneOffset } from "../utils/timezone.js";
import { getPassStatus, getActivePass } from "../utils/pass.js";
import { logPassXp } from "../utils/passXpLog.js";
import { getProductById } from "../utils/shopCatalog.js";
import { buildGeneratorStatus } from '../utils/generatorState.js';
import { recoverPassiveLoc } from '../utils/generatorEconomy.js';
import { getBanScoreTier, normalizeAntiCheatState } from '../utils/anticheat.js';
import { getGeneratorCostMultiplierFromEventState } from '../utils/randomEventState.js';
import { getMyTeam } from "../utils/teams.js";
import { getDailyFarmSummary } from '../utils/farmLog.js';
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
import { getUserActiveLanguage, getLanguageEffectMultipliers } from '../utils/languages.js';
import { expireRandomEvents, spawnRandomEvent } from "../utils/randomEventEngine.js";

const router = Router();

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || null;
}

// Resolve the timezone offset used to compute the local quest day, so /api/state
// lands on the same calendar day as /api/quests (which falls back to +180).
// Precedence: explicit request value, persisted progression.timezone_offset, 180.
function resolveStateTimezoneOffset(req, progression, fallback = 180) {
  const raw =
    req.query?.timezoneOffset ??
    req.headers["x-timezone-offset"] ??
    progression?.timezone_offset;
  return parseTimezoneOffset(raw, fallback);
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
      const levelRecord = level.record || level;
      const rankMeta = level.resolved;
      const userFeatureFlags = user.feature_flags || {};
      const skinResult = await client.query(
        `SELECT 1 FROM user_skins WHERE user_id = $1 AND skin_id = 'senior_pajamas' AND equipped = true`,
        [user.id]
      );
      const skinRecoveryMult = skinResult.rows.length > 0 ? 1.05 : 1;

      const officeCatResult = await client.query(
        `SELECT 1 FROM user_skins WHERE user_id = $1 AND skin_id = 'office_cat' AND equipped = true`,
        [user.id]
      );
      const officeCatEquipped = officeCatResult.rows.length > 0;
      const prestigeRecoveryMult = rankMeta.energyRecoveryMult || 1;
      const myTeam = await getMyTeam(client, user.id);

      const progression = await recoverProgression(
        client,
        progressRow,
        rankMeta.maxEnergy,
        skinRecoveryMult,
        officeCatEquipped,
        prestigeRecoveryMult,
      );
      const accountAgeMinutes = user?.created_at
        ? Math.max(0, Math.floor((Date.now() - new Date(user.created_at).getTime()) / 60000))
        : 61;

      // Random Events Engine: on-demand spawn during active session
      await expireRandomEvents(client);
      await spawnRandomEvent(client, user.id, accountAgeMinutes);

      const activeLanguage = await getUserActiveLanguage(client, user.id);
      const langEffects = getLanguageEffectMultipliers(activeLanguage);

      const passiveProgression = await recoverPassiveLoc(client, progression, {
        accountAgeMinutes,
        passiveMultiplier: Number(myTeam?.passiveLocMultiplier || 1) * langEffects.passiveLocMult
      });

      // Phase 6: prune expired active effects
      const prunedEffects = pruneExpiredEffects(passiveProgression.active_effects || {});
      if (JSON.stringify(prunedEffects) !== JSON.stringify(passiveProgression.active_effects || {})) {
        await client.query(
          `UPDATE progression SET active_effects = $2 WHERE user_id = $1`,
          [user.id, JSON.stringify(prunedEffects)]
        );
      }
      passiveProgression.active_effects = prunedEffects;
      const activeEffects = getActiveEffects(prunedEffects);

      const idleRecovery = passiveProgression?._idleRecovery || null;
      const careerStory = await ensureCareerStoryUnlocked(
        client,
        user.id,
        passiveProgression?.career_story || progressRow?.career_story || {},
        Number(level.resolved?.rank || passiveProgression?.tier || 1),
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
      // SQL `daily_quests` is the analytics mirror; flip the login row there...
      await markLoginQuestComplete(client, user.id);
      // ...and, critically, in the JSONB SSOT that every player-facing endpoint
      // reads (/api/state daily block, /api/quests, /api/quests/daily). Without
      // this the two stores desync: SQL shows login done while the JSONB keeps
      // q_login incomplete. The helper flips only q_login.completed via an
      // atomic single-statement UPDATE; it never touches `claimed`, so a
      // concurrent /api/quests/daily claim cannot be lost or double-rewarded.
      const loginQuestTimezoneOffset = resolveStateTimezoneOffset(req, passiveProgression);
      const loginQuestToday = getQuestDateString(loginQuestTimezoneOffset);
      await markLoginQuestCompleteInState(client, user.id, loginQuestToday);
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
      const contextOffer = await getContextOffer(client, user.id, {
        energy: passiveProgression.energy,
        maxEnergy: rankMeta.maxEnergy,
        depression: passiveProgression.depression_level,
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
      const depressionLevel = Number(passiveProgression.depression_level ?? 0);
      const isAfflicted = depressionLevel >= TAP_MECHANICS.afflictionDepression;
      const isBurnout = depressionLevel >= TAP_MECHANICS.maxDepression;
      const burnoutAffliction = passiveProgression.burnout_affliction === true || isAfflicted;
      const forcedBreakUntil = passiveProgression.forced_break_until || null;
      const isForcedBreak = forcedBreakUntil && new Date(forcedBreakUntil) > new Date();
      if (isBurnout) {
        await checkAchievement(client, user.id, 'burnout');
      }

      // Phase 5: Auto-grant invited referral reward when anti-farm threshold reached
      const referralState = passiveProgression.referral_state || {};
      if (referralState.invitedBy && !referralState.invitedRewardGranted) {
        if (isReferralActive(passiveProgression)) {
          const invitedReward = STAGE3.REFERRAL.MILESTONE_REWARDS[1]?.invited || {};
          await client.query(
            `UPDATE progression
             SET commits_total = commits_total + $2,
                 lifetime_loc = lifetime_loc + $2,
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

      const recoveryIntervalSeconds = getEffectiveRecoveryIntervalSeconds(passiveProgression, new Date(), skinRecoveryMult);
      const recoveryEtaSeconds = getRecoveryEtaSeconds(
        passiveProgression,
        rankMeta.maxEnergy,
        new Date(),
        skinRecoveryMult,
        prestigeRecoveryMult,
      );
      const generatorState = buildGeneratorStatus(passiveProgression?.generator_state || {}, accountAgeMinutes, {
        costMultiplier: getGeneratorCostMultiplierFromEventState(passiveProgression?.event_state || {})
      });
      const antiCheatState = normalizeAntiCheatState(passiveProgression?.anti_cheat_state || {});
      const antiCheatTier = getBanScoreTier(antiCheatState.banScore);
      const dailyFarm = await getDailyFarmSummary(client, user.id);

      res.json({
        user: {
          id: user.id,
          telegramId: Number(user.telegram_id),
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          photoUrl: user.photo_url,
          createdAt: user.created_at,
          lastActive: user.last_active,
        },
        featureFlags: userFeatureFlags,
        stressCohort: userFeatureFlags?.stress_v2 ? "test" : "control",
        progression: passiveProgression
          ? {
              tier: passiveProgression.tier,
              tierName: getTierName(passiveProgression.tier),
              commitsTotal: parseInt(passiveProgression.commits_total),
              commitsCurrent: parseInt(passiveProgression.commits_current),
              energy: Number(passiveProgression.energy),
              depressionLevel: Number(passiveProgression.depression_level ?? 0),
              streakDays: Number(passiveProgression.streak_days ?? 0),
              updatedAt: passiveProgression.updated_at,
              onboardingCompleted: passiveProgression.onboarding_completed === true,
              inventory: passiveProgression.inventory || {},
              isAfflicted,
              isBurnout,
              burnoutAffliction,
              forcedBreakUntil,
            }
          : null,
        game: {
          tier: passiveProgression.tier,
          commits_total: parseInt(passiveProgression.commits_total),
          commits_current: parseInt(passiveProgression.commits_current),
          energy: passiveProgression.energy,
          depression_level: Number(passiveProgression.depression_level ?? 0),
          streak_days: passiveProgression.streak_days,
          updated_at: passiveProgression.updated_at,
          onboarding_completed: passiveProgression.onboarding_completed === true,
          inventory: passiveProgression.inventory || {},
          is_afflicted: isAfflicted,
          is_burnout: isBurnout,
          burnout_affliction: burnoutAffliction,
          forced_break_until: forcedBreakUntil,
        },
        progressionUpdatedAt: passiveProgression?.updated_at ?? null,
        serverNow: new Date().toISOString(),
        level: level.resolved,
        prestige: {
          level: rankMeta.prestigeLevel || 0,
          currency: Number(levelRecord.prestige_currency ?? 0),
          shopPurchases: levelRecord.prestige_shop_purchases?.items || [],
          available: (levelRecord.xp_total ?? 0) >= PRESTIGE.THRESHOLD_XP,
          requiredXp: PRESTIGE.THRESHOLD_XP,
          bonuses: {
            commitsPerTap: rankMeta.commitsPerTap,
            energyRecoveryMult: rankMeta.energyRecoveryMult || 1,
            critChanceAdd: rankMeta.critChanceAdd || 0,
            maxEnergy: rankMeta.maxEnergy,
            depressionResistanceMult: rankMeta.depressionResistanceMult || 1,
            passiveLocMult: rankMeta.passiveLocMult || 1,
            clickPowerMult: 1 + 0.005 * (rankMeta.muCurrency || 0),
          },
          lifetimeLoc: Number(passiveProgression.lifetime_loc ?? passiveProgression.commits_total ?? 0),
          prestigeCount: Number(passiveProgression.prestige_count ?? 0),
          muCurrency: Number(passiveProgression.mu_currency ?? 0),
          muAvailable: Number(passiveProgression.lifetime_loc ?? passiveProgression.commits_total ?? 0) >= 1_000_000,
        },
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
        generatorState,
        randomEventState: passiveProgression?.event_state?.randomEventState || null,
        dailyFarm,
        antiCheat: {
          banScore: antiCheatState.banScore,
          leaderboardHidden: antiCheatState.leaderboardHidden,
          lastViolationAt: antiCheatState.lastViolationAt,
          sanctionTier: antiCheatTier.id,
          sanctionAction: antiCheatTier.action,
          sanctionEffects: antiCheatTier.effects,
          appealAvailable: antiCheatState.banScore >= 50,
          appealLocation: 'Settings -> Account -> Appeal Ban',
        },
        isAfflicted,
        isBurnout,
        burnoutAffliction,
        forcedBreakUntil,
        isForcedBreak,
        idleRecovery,
        passiveLocRecovery: passiveProgression?._passiveLocRecovery || null,
        activeLanguage: activeLanguage
          ? {
              slug: activeLanguage.slug,
              name: activeLanguage.display_name || activeLanguage.name,
              icon: activeLanguage.icon,
              themeColor: activeLanguage.theme_color,
              effectType: activeLanguage.effect_type,
              effectValue: Number(activeLanguage.effect_value || 0),
            }
          : null,
      });
    } catch (err) {
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
