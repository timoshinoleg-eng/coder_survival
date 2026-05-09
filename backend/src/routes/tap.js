import { Router } from 'express';
import { pool } from '../index.js';
import { TAP_MECHANICS, STRESS_V2 } from '../config/balance.js';
import { checkTapRateLimit } from '../middleware/rateLimit.js';
import { recoverProgression } from '../utils/progression.js';
import { addTapXp, computeTapXp, ensureDailyQuests, ensurePlayerLevel, getDailyQuestSummary, getRankMeta, updateDailyQuestProgress } from '../utils/vnext.js';
import { recordEventContribution } from '../utils/events.js';
import { getContextOffer, recordOfferImpression } from '../utils/offers.js';
import { addPassXp } from '../utils/pass.js';
import { updateTeamProgress } from '../utils/teams.js';
import { checkAchievement, ensureAchievementRows } from '../utils/achievements.js';
import { getActiveCrunchTime } from '../utils/phase2State.js';

const router = Router();

/**
 * POST /api/tap — регистрация тапа
 * Body: { session_id?: string }
 * Returns: { commits_delta, energy_delta, depression_delta, state }
 */
router.post('/', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  const { session_id } = req.body || {};
  const telegramId = telegramUser.id;
  const username = telegramUser.username || null;
  const firstName = telegramUser.first_name || null;
  const lastName = telegramUser.last_name || null;

  try {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // 1. Upsert пользователя
      const userResult = await client.query(
        `INSERT INTO users (telegram_id, username, first_name, last_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (telegram_id) DO UPDATE SET
           username = COALESCE(EXCLUDED.username, users.username),
           first_name = COALESCE(EXCLUDED.first_name, users.first_name),
           last_name = COALESCE(EXCLUDED.last_name, users.last_name),
           last_active = NOW()
         RETURNING id, feature_flags, (xmax = 0) AS inserted`,
        [telegramId, username, firstName, lastName]
      );
      const userId = userResult.rows[0].id;
      const userFeatureFlags = userResult.rows[0].feature_flags || {};
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
        console.warn('[Tap] Rate limited user:', userId, 'reason:', rateLimit.payload?.type);
        return res.status(rateLimit.status).json(rateLimit.payload);
      }

      // 2. Получаем или создаём прогресс
      const progressInsertResult = await client.query(
        `INSERT INTO progression (user_id, tier, commits_total, commits_current, energy, depression_level, streak_days)
         VALUES ($1, 1, 0, 0, 100, 0, 0)
         ON CONFLICT (user_id) DO NOTHING
         RETURNING *`,
        [userId]
      );

      const progress = progressInsertResult.rows[0] || (
        await client.query(
          `SELECT * FROM progression WHERE user_id = $1 FOR UPDATE`,
          [userId]
        )
      ).rows[0];

      let recoveredProgress = await recoverProgression(client, progress, rankMeta.maxEnergy, userFeatureFlags);

      // Death screen guard: cannot tap while dead
      if (recoveredProgress.is_dead) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'burnout',
          message: 'Вы перегорели. Нажмите «Воскреснуть», чтобы продолжить.',
          isDead: true
        });
      }

      const crunchTime = await getActiveCrunchTime(client);

      // 3. Логика тапа
      const tapResult = calculateTapDelta(
        recoveredProgress,
        rankMeta,
        levelBefore.resolved.rank,
        userFeatureFlags,
        crunchTime,
      );

      // 4. Обновляем прогресс (death check)
      const newDepression = Math.min(100, Math.max(0, recoveredProgress.depression_level + tapResult.depressionDelta));
      const newIsDead = newDepression >= 100;

      const updatedProgress = await client.query(
        `UPDATE progression SET
           commits_total = commits_total + $2,
           commits_current = $7,
           energy = GREATEST(0, LEAST($8, energy + $3)),
           depression_level = GREATEST(0, LEAST(100, depression_level + $4)),
           tier = $5,
           streak_days = $6,
           updated_at = NOW(),
           last_energy_activity_at = NOW(),
           is_dead = $9
         WHERE user_id = $1
         RETURNING *`,
        [
          userId,
          tapResult.commitsDelta,
          tapResult.energyDelta,
          tapResult.depressionDelta,
          tapResult.newTier,
          tapResult.newStreak,
          tapResult.newCommitsCurrent,
          rankMeta.maxEnergy,
          newIsDead
        ]
      );
      recoveredProgress = updatedProgress.rows[0];

      const xpDelta = computeTapXp(levelBefore.resolved.levelInRank);
      const levelAfter = await addTapXp(client, userId, levelBefore.resolved.levelInRank);
      await ensureDailyQuests(client, userId);
      await updateDailyQuestProgress(client, userId, {
        tapDelta: 1,
        commitDelta: tapResult.commitsDelta,
        energyDelta: tapResult.energyDelta
      });
      const daily = await getDailyQuestSummary(client, userId);

      // 5. Stage 4: event / pass / team progress
      const eventResult = await recordEventContribution(client, userId, tapResult.commitsDelta);
      const passResult = await addPassXp(client, userId, levelAfter.xpDelta);
      await updateTeamProgress(client, userId, tapResult.commitsDelta);

      // Achievement engine
      await checkAchievement(client, userId, 'tap');
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
        featureFlags: userFeatureFlags
      });
      if (contextOffer?.type) {
        await recordOfferImpression(client, userId, contextOffer.type, 'tap');
      }

      // 6. Обновляем сессию (если передана)
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

      res.json({
        success: true,
        delta: {
          commits: tapResult.commitsDelta,
          energy: tapResult.energyDelta,
          depression: tapResult.depressionDelta
        },
        state: {
          userId,
          telegramId,
          tier: recoveredProgress.tier,
          commitsTotal: parseInt(recoveredProgress.commits_total),
          commitsCurrent: parseInt(recoveredProgress.commits_current),
          energy: recoveredProgress.energy,
          depressionLevel: recoveredProgress.depression_level,
          streakDays: recoveredProgress.streak_days,
          updatedAt: recoveredProgress.updated_at,
          isDead: recoveredProgress.is_dead
        },
        game: {
          tier: recoveredProgress.tier,
          commits_total: parseInt(recoveredProgress.commits_total),
          commits_current: parseInt(recoveredProgress.commits_current),
          energy: recoveredProgress.energy,
          depression_level: recoveredProgress.depression_level,
          streak_days: recoveredProgress.streak_days,
          updated_at: recoveredProgress.updated_at,
          is_dead: recoveredProgress.is_dead
        },
        progressionUpdatedAt: recoveredProgress.updated_at,
        serverNow: new Date().toISOString(),
        level: levelAfter.record.resolved,
        xpDelta: levelAfter.xpDelta,
        recoveryIntervalSeconds: parseInt(process.env.ENERGY_RECOVERY_INTERVAL_SECONDS || '60', 10),
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
        rateLimit: rateLimit.info || null
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
 * Расчёт эффекта от тапа
 */
function calculateTapDelta(
  progress,
  rankMeta,
  resolvedRank,
  featureFlags = {},
  crunchTime = null,
) {
  const progressionTier = Number(progress.tier ?? 1);
  const commitsPerTap = Number(rankMeta?.commitsPerTap ?? progressionTier);
  const energy = Number(progress.energy ?? 0);
  const depression = Number(progress.depression_level ?? 0);
  const streak = Number(progress.streak_days ?? 0);
  const commitsCurrent = Number(progress.commits_current ?? 0);
  const commitMultiplier = Number(crunchTime?.commitMultiplier ?? 1);
  const depressionMultiplier = Number(crunchTime?.depressionMultiplier ?? 1);

  // Базовый доход коммитов зависит от tier
  const baseCommits = commitsPerTap; // Junior=1, Middle=2, etc.

  // Энергия влияет на эффективность
  const energyMultiplier = energy / 100;

  // Депрессия снижает доход
  const depressionPenalty = depression / 100;

  // Стрик даёт бонус
  const streakBonus = Math.min(streak * TAP_MECHANICS.streakBonusPerDay, TAP_MECHANICS.streakBonusCap);

  let commitsDelta = Math.round(
    baseCommits
    * energyMultiplier
    * (1 - depressionPenalty * TAP_MECHANICS.depressionPenaltyMultiplier)
    * (1 + streakBonus)
    * commitMultiplier
  );
  if (commitsDelta < 1) commitsDelta = 1;

  // Энергия тратится на каждый тап
  const energyDelta = -1;

  // Депрессия растёт если энергия низкая
  let depressionDelta = 0;
  const stressV2 = featureFlags?.stress_v2 === true;
  if (stressV2) {
    if (energy < STRESS_V2.DEPRESSION_INCREASE_LOW_ENERGY) {
      depressionDelta += STRESS_V2.STRESS_GAIN_PER_TAP_BELOW_50;
    }
    if (energy < STRESS_V2.DEPRESSION_CRITICAL_LOW_ENERGY) {
      depressionDelta += STRESS_V2.STRESS_GAIN_PER_TAP_BELOW_30;
    }
  } else {
    if (energy < TAP_MECHANICS.lowEnergyStressThreshold) {
      depressionDelta = TAP_MECHANICS.lowEnergyStressDelta;
    }
    if (energy < TAP_MECHANICS.criticalEnergyStressThreshold) {
      depressionDelta = TAP_MECHANICS.criticalEnergyStressDelta;
    }
  }

  depressionDelta = Math.max(
    0,
    Math.round(depressionDelta * depressionMultiplier),
  );

  // Проверка повышения tier
  const newTier = Math.max(progressionTier, Math.min(Number(resolvedRank || progressionTier), 5));

  // Сброс commits_current при повышении tier
  let newCommitsCurrent = commitsCurrent + commitsDelta;
  if (newTier > progressionTier) {
    newCommitsCurrent = 0; // Сброс для нового уровня
  }

  // Стрик: пока просто сохраняем (логика обновления streak — отдельная задача)
  const newStreak = streak;

  return {
    commitsDelta,
    energyDelta,
    depressionDelta,
    newTier,
    newStreak,
    newCommitsCurrent
  };
}

export default router;
