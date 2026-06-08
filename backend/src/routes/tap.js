import { Router } from 'express';
import { pool } from '../index.js';
import { TAP_MECHANICS, STRESS_V2 } from '../config/balance.js';
import { checkTapRateLimit } from '../middleware/rateLimit.js';
import { analyzeAndRecordTap } from '../middleware/antiCheat.js';
import { getEffectiveRecoveryIntervalSeconds, recoverProgression } from '../utils/progression.js';
import {
  addTapXp,
  computeTapXp,
  ensureDailyQuests,
  ensurePlayerLevel,
  getRankMeta,
  updateDailyQuestProgress
} from '../utils/vnext.js';
import { recordEventContribution } from '../utils/events.js';
import { addPassXp, applyPassXpSourceMultiplier, getActivePass } from '../utils/pass.js';
import { logPassXp } from '../utils/passXpLog.js';
import { getContextOffer, recordOfferImpression } from '../utils/offers.js';
import { updateTeamProgress } from '../utils/teams.js';
import { checkAchievementsForUser } from '../utils/achievementsEngine.js';
import { addEffect, getActiveEffects } from '../utils/activeEffects.js';
import { calculateTapDelta, calculateDepressionDelta } from '../utils/tap.js';
import { applyBanScoreIncrement, applyLocPenalty, normalizeAntiCheatState } from '../utils/anticheat.js';
import { applyHeartAttackReset } from '../utils/heartAttack.js';
import { logDailyFarm } from '../utils/farmLog.js';
import { getRandomEventTapMultiplier } from '../utils/randomEventState.js';
import { getActiveCrunchTime } from '../utils/phase2State.js';
import { applyQuestUpdates, checkQuestProgress } from '../utils/dailyQuests.js';
import { addHackathonContribution, calculateHackathonTarget, getWeekId } from '../utils/teamHackathon.js';
import { updateWeeklySprintState } from '../utils/weeklySprint.js';
import { checkReferralMilestones } from '../utils/referral.js';
import validateModule from '../middleware/validate.js';
import schemasModule from '../validation/schemas.js';

const { validate } = validateModule;
const { tapSchema } = schemasModule;

const router = Router();

router.post('/', validate(tapSchema), async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  const { session_id, tapCount } = req.body;
  const requestedTapCount = tapCount;
  const telegramId = telegramUser.id;
  const username = telegramUser.username || null;
  const firstName = telegramUser.first_name || null;
  const lastName = telegramUser.last_name || null;

  let client;
  let contextOffer = null;
  let contextOfferInput = null;
  let offerUserId = null;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (telegram_id, username, first_name, last_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (telegram_id) DO UPDATE SET
         username = COALESCE(EXCLUDED.username, users.username),
         first_name = COALESCE(EXCLUDED.first_name, users.first_name),
         last_name = COALESCE(EXCLUDED.last_name, users.last_name),
         last_active = NOW()
       RETURNING id, (xmax = 0) AS inserted`,
      [telegramId, username, firstName, lastName]
    );
    const userId = userResult.rows[0].id;
    const insertedUser = userResult.rows[0].inserted === true;

    const levelBefore = await ensurePlayerLevel(client, userId);
    const rankMeta = getRankMeta(levelBefore.resolved.rank);

    const rateLimit = await checkTapRateLimit(
      client,
      userId,
      req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      requestedTapCount
    );
    if (!rateLimit.allowed) {
      await client.query('ROLLBACK');
      return res.status(rateLimit.status).json(rateLimit.payload);
    }

    const antiCheat = analyzeAndRecordTap(userId);
    if (!antiCheat.allowed) {
      await client.query(
        `INSERT INTO audit_logs (user_id, action, context, created_at)
         VALUES ($1, 'anticheat_pattern_ban', $2::jsonb, NOW())`,
        [userId, JSON.stringify(antiCheat.metrics || {})]
      );
      await client.query('ROLLBACK');
      return res.status(429).json({
        error: 'Подозрительная активность. Попробуйте позже.',
        retryAfter: antiCheat.retryAfter,
        type: 'pattern_ban'
      });
    }
    if (antiCheat.suspicious) {
      await client.query(
        `INSERT INTO audit_logs (user_id, action, context, created_at)
         VALUES ($1, 'anticheat_pattern_flag', $2::jsonb, NOW())`,
        [userId, JSON.stringify(antiCheat.metrics)]
      );
    }

    const progressInsertResult = await client.query(
      `INSERT INTO progression (user_id, tier, commits_total, commits_current, energy, depression_level, streak_days)
       VALUES ($1, 1, 0, 0, $2, 0, 0)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING *`,
      [userId, rankMeta.maxEnergy]
    );

    const progress = progressInsertResult.rows[0] || (
      await client.query(
        `SELECT * FROM progression WHERE user_id = $1 FOR UPDATE`,
        [userId]
      )
    ).rows[0];
    let antiCheatState = normalizeAntiCheatState(progress.anti_cheat_state || {});
    if (antiCheat.incrementReason) {
      antiCheatState = applyBanScoreIncrement(antiCheatState, antiCheat.incrementReason);
      await client.query(
        `UPDATE progression SET anti_cheat_state = $2 WHERE user_id = $1`,
        [userId, JSON.stringify(antiCheatState)]
      );
    }

    const skinResult = await client.query(
      `SELECT 1 FROM user_skins WHERE user_id = $1 AND skin_id = 'senior_pajamas' AND equipped = true`,
      [userId]
    );
    const skinRecoveryMult = skinResult.rows.length > 0 ? 1.05 : 1;

    const prestigeRecoveryMult = levelBefore.resolved.energyRecoveryMult || 1;
    let recoveredProgress = await recoverProgression(client, progress, levelBefore.resolved.maxEnergy, skinRecoveryMult, false, prestigeRecoveryMult);
    const currentEnergy = Number(recoveredProgress.energy ?? 0);
    const actualTapCount = Math.max(0, Math.min(requestedTapCount, Math.floor(currentEnergy)));
    const currentDepression = Number(recoveredProgress.depression_level ?? 0);
    const currentCommitsTotal = Number(recoveredProgress.commits_total ?? 0);

    if (currentEnergy <= 0) {
      await client.query('COMMIT');
      return res.json({
        energy: 0,
        depression: currentDepression,
        commitsDelta: 0,
        totalCommits: currentCommitsTotal,
        isBurnout: currentDepression >= TAP_MECHANICS.maxDepression,
        isCrit: false,
        critTier: null,
        rank: levelBefore.resolved.rankName
      });
    }

    const crunchTime = await getActiveCrunchTime(client);
    const activeEffects = getActiveEffects(recoveredProgress.active_effects || {});
    const tapBoostPercent = activeEffects.tapBoost?.percent || 0;
    const prestigeCritAdd = levelBefore.resolved.critChanceAdd || 0;
    const prestigeDepressionResist = levelBefore.resolved.depressionResistanceMult || 1;
    let tapResult = calculateTapDelta(
      levelBefore.resolved.commitsPerTap,
      currentEnergy,
      currentDepression,
      Number(recoveredProgress.streak_days ?? 0),
      Number(crunchTime?.commitMultiplier ?? 1) * getRandomEventTapMultiplier(recoveredProgress.event_state || {}, new Date()),
      tapBoostPercent,
      prestigeCritAdd
    );

    // Query equipped skins for bonus application
    const equippedSkinsResult = await client.query(
      `SELECT skin_id FROM user_skins WHERE user_id = $1 AND equipped = true`,
      [userId]
    );
    const equippedSkins = new Set(equippedSkinsResult.rows.map(r => r.skin_id));

    // Legacy Archaeologist: +20% commits when rank >= 3
    const currentRank = Number(levelBefore.resolved.rank || 1);
    if (equippedSkins.has('legacy_archaeologist') && currentRank >= 3) {
      tapResult = {
        ...tapResult,
        commitsDelta: Math.round(tapResult.commitsDelta * 1.2)
      };
    }
    tapResult = {
      ...tapResult,
      commitsDelta: applyLocPenalty(tapResult.commitsDelta, antiCheatState.banScore)
    };
    tapResult = {
      ...tapResult,
      commitsDelta: tapResult.commitsDelta * actualTapCount
    };
    const depressionDelta = calculateDepressionDelta(
      currentEnergy,
      Number(crunchTime?.depressionMultiplier ?? 1)
    ) * actualTapCount * prestigeDepressionResist;

    // Random bug encounter on low-energy tap (+5–15 depression)
    let bugEncounterDelta = 0;
    if (currentEnergy < 20 && Math.random() < 0.15) {
      bugEncounterDelta = 5 + Math.floor(Math.random() * 11);
    }

    let newDepression = Math.min(
      TAP_MECHANICS.maxDepression,
      Math.max(0, currentDepression + depressionDelta + bugEncounterDelta)
    );

    // Successful commit relief (-5 depression on crit)
    if (tapResult.isCrit) {
      newDepression = Math.max(0, newDepression - 5);
    }

    const isBurnout = newDepression >= TAP_MECHANICS.maxDepression;
    const isAfflicted = newDepression >= TAP_MECHANICS.afflictionDepression;
    const isForcedBreakTriggered = newDepression >= 180 && currentDepression < 180;
    const forcedBreakUntil = isForcedBreakTriggered
      ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
      : null;
    let heartAttackReset = null;

    if (isBurnout && currentDepression < TAP_MECHANICS.maxDepression) {
      console.log('burnout_entered', { userId, depression: newDepression });
      // Track burnout count for Heroically Fired skin unlock
      await client.query(
        `UPDATE progression
         SET inventory = COALESCE(inventory, '{}') || jsonb_build_object('burnout_count', COALESCE((inventory->>'burnout_count')::int, 0) + 1)
         WHERE user_id = $1`,
        [userId]
      );
      const burnoutCountResult = await client.query(
        `SELECT COALESCE((inventory->>'burnout_count')::int, 0) AS cnt FROM progression WHERE user_id = $1`,
        [userId]
      );
      if (parseInt(burnoutCountResult.rows[0]?.cnt || 0, 10) >= 10) {
        await client.query(
          `INSERT INTO user_skins (user_id, skin_id, equipped, unlocked_at)
           VALUES ($1, 'heroically_fired', false, NOW())
           ON CONFLICT (user_id, skin_id) DO NOTHING`,
          [userId]
        );
      }
    }
    const progressionTier = Number(recoveredProgress.tier ?? 1);
    const newTier = Math.max(progressionTier, Math.min(Number(levelBefore.resolved.rank || progressionTier), 5));
    const commitsCurrent = Number(recoveredProgress.commits_current ?? 0);
    const newCommitsCurrent = newTier > progressionTier ? 0 : commitsCurrent + tapResult.commitsDelta;
    const newEnergy = Math.max(0, currentEnergy - actualTapCount);

    const updatedProgressResult = await client.query(
      `UPDATE progression
       SET commits_total = commits_total + $2,
           lifetime_loc = lifetime_loc + $2,
           commits_current = $3,
           energy = $4,
           depression_level = $5,
           tier = $6,
           is_burnout = $7,
           burnout_affliction = $8,
           forced_break_until = COALESCE($9::timestamptz, forced_break_until),
           updated_at = GREATEST(NOW(), updated_at + INTERVAL '1 millisecond'),
           last_energy_activity_at = NOW(),
           energy_recovery_checkpoint_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [
        userId,
        tapResult.commitsDelta,
        newCommitsCurrent,
        newEnergy,
        newDepression,
        newTier,
        isBurnout,
        isAfflicted,
        forcedBreakUntil
      ]
    );
    recoveredProgress = updatedProgressResult.rows[0];

    if (isBurnout && currentDepression < TAP_MECHANICS.maxDepression) {
      heartAttackReset = await applyHeartAttackReset(client, userId, { sessionId: session_id || null });
      recoveredProgress = heartAttackReset.progression || recoveredProgress;
    }

    const xpDelta = computeTapXp(levelBefore.resolved.levelInRank) * actualTapCount;
    const levelAfter = await addTapXp(client, userId, levelBefore.resolved.levelInRank, 1, actualTapCount);
    await ensureDailyQuests(client, userId);
    const dailyQuestRows = await updateDailyQuestProgress(client, userId, {
      tapDelta: actualTapCount,
      commitDelta: tapResult.commitsDelta,
      energyDelta: -actualTapCount
    });
    const daily = {
      total: dailyQuestRows.length,
      completed: dailyQuestRows.filter((quest) => quest.completed).length,
      claimed: dailyQuestRows.filter((quest) => quest.claimed).length,
      claimable: dailyQuestRows.filter((quest) => quest.completed && !quest.claimed).length,
      quests: dailyQuestRows,
    };
    await logDailyFarm(client, userId, tapResult.commitsDelta);

    const eventResult = await recordEventContribution(client, userId, tapResult.commitsDelta);
    const passXpAmount = applyPassXpSourceMultiplier(levelAfter.xpDelta ?? xpDelta, 'tap_xp', new Date());
    const passResult = await addPassXp(client, userId, passXpAmount);

    const activePass = await getActivePass(client);
    if (activePass && passResult?.playerPass) {
      const tapPassXp = passXpAmount;
      await logPassXp(client, userId, activePass.id, 'tap', tapPassXp, { commitsDelta: tapResult.commitsDelta });
    }

    await updateTeamProgress(client, userId, tapResult.commitsDelta);

    if (levelAfter.record.resolved.rank > levelBefore.resolved.rank) {
      const newRank = levelAfter.record.resolved.rank;
      // Auto-unlock rank-based skins
      if (newRank >= 3) {
        await client.query(
          `INSERT INTO user_skins (user_id, skin_id, equipped, unlocked_at)
           VALUES ($1, 'legacy_archaeologist', false, NOW())
           ON CONFLICT (user_id, skin_id) DO NOTHING`,
          [userId]
        );
      }
      if (newRank >= 5) {
        await client.query(
          `INSERT INTO user_skins (user_id, skin_id, equipped, unlocked_at)
           VALUES ($1, 'senior_pajamas', false, NOW())
           ON CONFLICT (user_id, skin_id) DO NOTHING`,
          [userId]
        );
      }
      // Heroically Fired skin bonus: +10% tap boost for 24h after rank-up
      if (equippedSkins.has('heroically_fired')) {
        const currentEffects = recoveredProgress.active_effects || {};
        const updatedEffects = addEffect(currentEffects, 'tapBoost', { percent: 10 }, 24 * 60);
        await client.query(
          `UPDATE progression SET active_effects = $2 WHERE user_id = $1`,
          [userId, JSON.stringify(updatedEffects)]
        );
        recoveredProgress.active_effects = updatedEffects;
      }
    }
    offerUserId = userId;
    contextOfferInput = {
      energy: recoveredProgress.energy,
      maxEnergy: rankMeta.maxEnergy,
      depression: recoveredProgress.depression_level,
      xpProgress: levelAfter.record.resolved.progressInLevel,
      xpRequiredForNext: levelAfter.record.resolved.requiredForNextLevel,
      featureFlags: { stress_v2: true }
    };

    try {
      const questResult = await client.query(
        `SELECT daily_quests_state, timezone_offset
         FROM progression
         WHERE user_id = $1`,
        [userId]
      );
      const questState = questResult.rows[0]?.daily_quests_state || {};
      const timezoneOffset = Number(questResult.rows[0]?.timezone_offset ?? 180);
      const today = getLocalDateString(timezoneOffset);

      if (questState.lastDate === today && Array.isArray(questState.quests)) {
        let quests = questState.quests;
        let changed = false;

        const tapUpdates = checkQuestProgress(quests, 'tap_count', actualTapCount);
        const tapApplied = applyQuestUpdates(quests, tapUpdates);
        quests = tapApplied.quests;
        changed = changed || tapApplied.changed;

        if (tapResult.isCrit) {
          const critUpdates = checkQuestProgress(quests, 'crit_count', { isCrit: true });
          const critApplied = applyQuestUpdates(quests, critUpdates);
          quests = critApplied.quests;
          changed = changed || critApplied.changed;
        }

        const commitUpdates = checkQuestProgress(
          quests,
          'commit_total',
          Number(recoveredProgress.commits_total ?? 0)
        );
        const commitApplied = applyQuestUpdates(quests, commitUpdates);
        quests = commitApplied.quests;
        changed = changed || commitApplied.changed;

        if (changed) {
          await client.query(
            `UPDATE progression
             SET daily_quests_state = $2
             WHERE user_id = $1`,
            [
              userId,
              JSON.stringify({
                ...questState,
                quests
              })
            ]
          );
        }
      }
    } catch (questErr) {
      console.error('Quest progress update failed:', questErr);
    }

    // ═══════════════════════════════════════════════════════════════
    // STAGE 3 INTEGRATION: Social Progress
    // ═══════════════════════════════════════════════════════════════

    try {
      const socialProgressResult = await client.query(
        `SELECT team_hackathon_state, referral_state, timezone_offset, commits_total
         FROM progression
         WHERE user_id = $1`,
        [userId]
      );
      const socialProgress = socialProgressResult.rows[0] || {};
      const timezoneOffset = Number(socialProgress.timezone_offset ?? 0);

      const teamResult = await client.query(
        'SELECT team_id FROM team_members WHERE user_id = $1',
        [userId]
      );
      const teamId = teamResult.rows[0]?.team_id;

      if (teamId && tapResult.commitsDelta > 0) {
        const activeResult = await client.query(
          `SELECT COUNT(*)::int AS active_count
           FROM team_members
           WHERE team_id = $1
             AND last_active_at >= NOW() - INTERVAL '7 days'`,
          [teamId]
        );
        const weekId = getWeekId(new Date(), timezoneOffset);
        let hackathonState = socialProgress.team_hackathon_state || {};

        if (hackathonState.weekId !== weekId) {
          hackathonState = {
            weekId,
            target: calculateHackathonTarget(Number(activeResult.rows[0]?.active_count || 0)),
            progress: 0,
            contributions: {},
            currentTier: null,
            tierClaimed: null
          };
        }

        hackathonState = addHackathonContribution(hackathonState, String(userId), tapResult.commitsDelta);
        await client.query(
          'UPDATE progression SET team_hackathon_state = $2, updated_at = NOW() WHERE user_id = $1',
          [userId, JSON.stringify(hackathonState)]
        );
      }

      const referralState = socialProgress.referral_state || {};
      const referralCheck = checkReferralMilestones(
        referralState,
        Number(socialProgress.commits_total || recoveredProgress.commits_total || 0)
      );
      if (referralCheck.newlyUnlocked.length > 0) {
        await client.query(
          'UPDATE progression SET referral_state = $2, updated_at = NOW() WHERE user_id = $1',
          [userId, JSON.stringify(referralCheck.state)]
        );
      }
    } catch (socialErr) {
      console.error('Social progress update failed:', socialErr);
    }

    // Update weekly sprint progress
    try {
      await updateWeeklySprintState(client, userId, { commitsEarned: tapResult.commitsDelta });
    } catch (sprintErr) {
      console.error('Weekly sprint update failed:', sprintErr);
    }

    if (session_id) {
      await client.query(
        `UPDATE sessions
         SET taps_count = taps_count + $4,
             commits_earned = commits_earned + $2
         WHERE session_id = $1 AND user_id = $3`,
        [session_id, tapResult.commitsDelta, userId, actualTapCount]
      );
    }

    await client.query('COMMIT');

    if (contextOfferInput && offerUserId) {
      try {
        contextOffer = await getContextOffer(client, offerUserId, contextOfferInput);
        if (contextOffer?.type) {
          await recordOfferImpression(client, offerUserId, contextOffer.type, 'tap');
        }
      } catch (offerErr) {
        console.error('Context offer update failed:', offerErr);
      }
    }

    // Check achievements
    let achievementsEarned = [];
    try {
      const { newlyEarned } = await checkAchievementsForUser(
        userId,
        ['tap_count', 'coins_balance', 'xp_total', 'time_pattern'],
        {
          currentTaps: Number(recoveredProgress.commits_total ?? 0),
          currentCoins: Number(recoveredProgress.commits_total ?? 0),
          currentXp: levelAfter.record.xp_total || 0,
          currentSkins: null,
          currentBattles: null,
          serverHour: new Date().getUTCHours(),
          serverDay: ['sun','mon','tue','wed','thu','fri','sat'][new Date().getUTCDay()]
        }
      );
      achievementsEarned = newlyEarned;
    } catch (achErr) {
      console.error('[Tap] Achievement check failed:', achErr);
    }

    return res.json({
      success: true,
      delta: {
        commits: tapResult.commitsDelta,
        energy: -actualTapCount,
        depression: depressionDelta
      },
      state: {
        userId,
        telegramId,
        tier: recoveredProgress.tier,
        commitsTotal: Number(recoveredProgress.commits_total ?? 0),
        commitsCurrent: Number(recoveredProgress.commits_current ?? 0),
        energy: Number(recoveredProgress.energy ?? 0),
        depressionLevel: Number(recoveredProgress.depression_level ?? 0),
        streakDays: Number(recoveredProgress.streak_days ?? 0),
        updatedAt: recoveredProgress.updated_at,
        isBurnout,
        isAfflicted,
        forcedBreakUntil
      },
      game: {
        tier: recoveredProgress.tier,
        commits_total: Number(recoveredProgress.commits_total ?? 0),
        commits_current: Number(recoveredProgress.commits_current ?? 0),
        energy: Number(recoveredProgress.energy ?? 0),
        depression_level: Number(recoveredProgress.depression_level ?? 0),
        streak_days: Number(recoveredProgress.streak_days ?? 0),
        updated_at: recoveredProgress.updated_at,
        is_burnout: isBurnout,
        burnout_affliction: isAfflicted,
        forced_break_until: forcedBreakUntil
      },
      progressionUpdatedAt: recoveredProgress.updated_at,
      serverNow: new Date().toISOString(),
      level: levelAfter.record.resolved,
      xpDelta: levelAfter.xpDelta ?? xpDelta,
      recoveryIntervalSeconds: getEffectiveRecoveryIntervalSeconds(recoveredProgress),
      daily,
      event: eventResult ? {
        eventId: eventResult.event.id,
        contributed: eventResult.contribution.commits_contributed,
        target: eventResult.event.target_commits,
        claimed: eventResult.contribution.claimed
      } : null,
      pass: passResult ? {
        seasonNumber: passResult.pass.season_number,
        currentLevel: passResult.playerPass.current_level,
        currentXp: passResult.playerPass.current_xp,
        isPremium: passResult.playerPass.is_premium,
        leveledUp: passResult.leveledUp
      } : null,
      crunchTime,
      contextOffer,
      rateLimit: rateLimit.info || null,
      tapCount: actualTapCount,
      energy: Number(recoveredProgress.energy ?? 0),
      depression: Number(recoveredProgress.depression_level ?? 0),
      activeEffects,
      activeEffects,
      heartAttackReset,
      commitsDelta: tapResult.commitsDelta,
      totalCommits: Number(recoveredProgress.commits_total ?? 0),
      isBurnout,
      isAfflicted,
      forcedBreakUntil,
      isCrit: tapResult.isCrit,
      critTier: tapResult.critTier,
      rank: levelAfter.record.resolved.rankName,
      achievements_earned: achievementsEarned
    });
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (_rollbackErr) {
        // Ignore rollback failure and return the original server error.
      }
    }
    console.error('[Tap] failed', err);
    return res.status(500).json({ error: 'Технический сбой. Мы уже чиним.' });
  } finally {
    if (client) client.release();
  }
});

function getLocalDateString(timezoneOffset = 180, now = new Date()) {
  const local = new Date(now.getTime() + timezoneOffset * 60000);
  return local.toISOString().slice(0, 10);
}



export default router;
