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
  getDailyQuestSummary,
  getRankMeta,
  updateDailyQuestProgress
} from '../utils/vnext.js';
import { recordEventContribution } from '../utils/events.js';
import { addPassXp, getActivePass } from '../utils/pass.js';
import { logPassXp } from '../utils/passXpLog.js';
import { getContextOffer, recordOfferImpression } from '../utils/offers.js';
import { updateTeamProgress } from '../utils/teams.js';
import { checkAchievement, ensureAchievementRows } from '../utils/achievements.js';
import { getActiveCrunchTime } from '../utils/phase2State.js';
import { applyQuestUpdates, checkQuestProgress } from '../utils/dailyQuests.js';
import { addHackathonContribution, calculateHackathonTarget, getWeekId } from '../utils/teamHackathon.js';
import { checkReferralMilestones } from '../utils/referral.js';

const router = Router();

router.post('/', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  const { session_id } = req.body || {};
  const telegramId = telegramUser.id;
  const username = telegramUser.username || null;
  const firstName = telegramUser.first_name || null;
  const lastName = telegramUser.last_name || null;

  let client;
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

    if (insertedUser) {
      await ensureAchievementRows(client, userId);
    }

    const levelBefore = await ensurePlayerLevel(client, userId);
    const rankMeta = getRankMeta(levelBefore.resolved.rank);

    const rateLimit = await checkTapRateLimit(
      client,
      userId,
      req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress
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
      client.query(
        `INSERT INTO audit_logs (user_id, action, context, created_at)
         VALUES ($1, 'anticheat_pattern_flag', $2::jsonb, NOW())`,
        [userId, JSON.stringify(antiCheat.metrics)]
      ).catch(() => {});
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

    let recoveredProgress = await recoverProgression(client, progress, rankMeta.maxEnergy);
    const currentEnergy = Number(recoveredProgress.energy ?? 0);
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
    const tapResult = calculateTapDelta(
      rankMeta.commitsPerTap,
      currentEnergy,
      currentDepression,
      Number(recoveredProgress.streak_days ?? 0),
      Number(crunchTime?.commitMultiplier ?? 1)
    );
    const depressionDelta = calculateDepressionDelta(
      currentEnergy,
      Number(crunchTime?.depressionMultiplier ?? 1)
    );
    const newDepression = Math.min(
      TAP_MECHANICS.maxDepression,
      Math.max(0, currentDepression + depressionDelta)
    );
    const isBurnout = newDepression >= TAP_MECHANICS.maxDepression;

    if (isBurnout && currentDepression < TAP_MECHANICS.maxDepression) {
      console.log('burnout_entered', { userId, depression: newDepression });
    }
    if (tapResult.critTier === 'gold') {
      console.log('tap_crit_gold', { userId, commitsDelta: tapResult.commitsDelta });
    } else if (tapResult.critTier === 'silver') {
      console.log('tap_crit_silver', { userId, commitsDelta: tapResult.commitsDelta });
    }

    const progressionTier = Number(recoveredProgress.tier ?? 1);
    const newTier = Math.max(progressionTier, Math.min(Number(levelBefore.resolved.rank || progressionTier), 5));
    const commitsCurrent = Number(recoveredProgress.commits_current ?? 0);
    const newCommitsCurrent = newTier > progressionTier ? 0 : commitsCurrent + tapResult.commitsDelta;
    const newEnergy = Math.max(0, currentEnergy - 1);

    const updatedProgressResult = await client.query(
      `UPDATE progression
       SET commits_total = commits_total + $2,
           commits_current = $3,
           energy = $4,
           depression_level = $5,
           tier = $6,
           is_burnout = $7,
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
        isBurnout
      ]
    );
    recoveredProgress = updatedProgressResult.rows[0];

    const xpDelta = computeTapXp(levelBefore.resolved.levelInRank);
    const levelAfter = await addTapXp(client, userId, levelBefore.resolved.levelInRank);
    await ensureDailyQuests(client, userId);
    await updateDailyQuestProgress(client, userId, {
      tapDelta: 1,
      commitDelta: tapResult.commitsDelta,
      energyDelta: -1
    });
    const daily = await getDailyQuestSummary(client, userId);

    const eventResult = await recordEventContribution(client, userId, tapResult.commitsDelta);
    const passResult = await addPassXp(client, userId, levelAfter.xpDelta ?? xpDelta);

    const activePass = await getActivePass(client);
    if (activePass && passResult?.playerPass) {
      const tapPassXp = 1; // 1 passXp per tap for attribution tracking
      await logPassXp(client, userId, activePass.id, 'tap', tapPassXp, { commitsDelta: tapResult.commitsDelta });
    }

    await updateTeamProgress(client, userId, tapResult.commitsDelta);

    await checkAchievement(client, userId, 'tap', { isCrit: tapResult.isCrit });
    await checkAchievement(client, userId, 'commit_total');
    if (levelAfter.record.resolved.rank > levelBefore.resolved.rank) {
      await checkAchievement(client, userId, 'rank_up', { rank: levelAfter.record.resolved.rank });
    }
    const contextOffer = await getContextOffer(client, userId, {
      energy: recoveredProgress.energy,
      maxEnergy: rankMeta.maxEnergy,
      depression: recoveredProgress.depression_level,
      xpProgress: levelAfter.record.resolved.progressInLevel,
      xpRequiredForNext: levelAfter.record.resolved.requiredForNextLevel,
      featureFlags: { stress_v2: true }
    });
    if (contextOffer?.type) {
      await recordOfferImpression(client, userId, contextOffer.type, 'tap');
    }

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

        const tapUpdates = checkQuestProgress(quests, 'tap_count', 1);
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

    if (session_id) {
      await client.query(
        `UPDATE sessions
         SET taps_count = taps_count + 1,
             commits_earned = commits_earned + $2
         WHERE session_id = $1 AND user_id = $3`,
        [session_id, tapResult.commitsDelta, userId]
      );
    }

    await client.query('COMMIT');

    return res.json({
      success: true,
      delta: {
        commits: tapResult.commitsDelta,
        energy: -1,
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
        isBurnout
      },
      game: {
        tier: recoveredProgress.tier,
        commits_total: Number(recoveredProgress.commits_total ?? 0),
        commits_current: Number(recoveredProgress.commits_current ?? 0),
        energy: Number(recoveredProgress.energy ?? 0),
        depression_level: Number(recoveredProgress.depression_level ?? 0),
        streak_days: Number(recoveredProgress.streak_days ?? 0),
        updated_at: recoveredProgress.updated_at,
        is_burnout: isBurnout
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
      energy: Number(recoveredProgress.energy ?? 0),
      depression: Number(recoveredProgress.depression_level ?? 0),
      commitsDelta: tapResult.commitsDelta,
      totalCommits: Number(recoveredProgress.commits_total ?? 0),
      isBurnout,
      isCrit: tapResult.isCrit,
      critTier: tapResult.critTier,
      rank: levelAfter.record.resolved.rankName
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

export function calculateTapDelta(baseCommits, energy, depression, streak, commitMultiplier = 1) {
  const energyMultiplier = energy / 100;
  const depressionPenalty = depression / 100;
  const streakBonus = Math.min(
    streak * TAP_MECHANICS.streakBonusPerDay,
    TAP_MECHANICS.streakBonusCap
  );

  let base = Math.round(
    baseCommits
    * energyMultiplier
    * (1 - depressionPenalty * TAP_MECHANICS.depressionPenaltyMultiplier)
    * (1 + streakBonus)
    * commitMultiplier
  );
  if (base < 1) base = 1;

  const roll = Math.random();
  let multiplier = 1;
  let tier = null;

  if (roll < TAP_MECHANICS.critGoldChance) {
    multiplier = 3;
    tier = 'gold';
  } else if (roll < TAP_MECHANICS.critGoldChance + TAP_MECHANICS.critSilverChance) {
    multiplier = 2;
    tier = 'silver';
  }

  let commitsDelta = Math.round(base * multiplier);
  const isBurnout = depression >= TAP_MECHANICS.maxDepression;

  if (isBurnout) {
    commitsDelta = Math.max(
      1,
      Math.floor(commitsDelta * TAP_MECHANICS.burnoutCommitMultiplier)
    );
  }

  return {
    commitsDelta,
    isCrit: multiplier > 1,
    critTier: tier,
    isBurnout
  };
}

export function calculateDepressionDelta(energy, depressionMultiplier = 1) {
  let delta = TAP_MECHANICS.depressionGainPerTap;
  if (energy < 30) delta += TAP_MECHANICS.depressionGainLowEnergy;
  if (energy < 10) delta += TAP_MECHANICS.depressionGainCriticalEnergy;
  return delta * depressionMultiplier;
}

export default router;
