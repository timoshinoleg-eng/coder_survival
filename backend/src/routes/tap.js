import { Router } from 'express';
import { pool } from '../index.js';

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
         RETURNING id`,
        [telegramId, username, firstName, lastName]
      );
      const userId = userResult.rows[0].id;

      // 2. Получаем или создаём прогресс
      const progressResult = await client.query(
        `INSERT INTO progression (user_id, tier, commits_total, commits_current, energy, depression_level, streak_days)
         VALUES ($1, 1, 0, 0, 100, 0, 0)
         ON CONFLICT (user_id) DO UPDATE SET
           updated_at = NOW()
         RETURNING *`,
        [userId]
      );
      let progress = progressResult.rows[0];

      // 3. Логика тапа
      const tapResult = calculateTapDelta(progress);
      
      // 4. Обновляем прогресс
      const updatedProgress = await client.query(
        `UPDATE progression SET
           commits_total = commits_total + $2,
           commits_current = commits_current + $2,
           energy = GREATEST(0, LEAST(100, energy + $3)),
           depression_level = GREATEST(0, LEAST(100, depression_level + $4)),
           tier = $5,
           streak_days = $6
         WHERE user_id = $1
         RETURNING *`,
        [
          userId,
          tapResult.commitsDelta,
          tapResult.energyDelta,
          tapResult.depressionDelta,
          tapResult.newTier,
          tapResult.newStreak
        ]
      );
      progress = updatedProgress.rows[0];

      // 5. Обновляем сессию (если передана)
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
          tier: progress.tier,
          commitsTotal: parseInt(progress.commits_total),
          commitsCurrent: parseInt(progress.commits_current),
          energy: progress.energy,
          depressionLevel: progress.depression_level,
          streakDays: progress.streak_days
        },
        rateLimit: req.rateLimit || null
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
function calculateTapDelta(progress) {
  const tier = progress.tier;
  const energy = progress.energy;
  const depression = progress.depression_level;
  const streak = progress.streak_days;

  // Базовый доход коммитов зависит от tier
  const baseCommits = tier; // Junior=1, Middle=2, etc.
  
  // Энергия влияет на эффективность
  const energyMultiplier = energy / 100;
  
  // Депрессия снижает доход
  const depressionPenalty = depression / 100;
  
  // Стрик даёт бонус
  const streakBonus = Math.min(streak * 0.05, 0.5); // max 50% bonus

  let commitsDelta = Math.round(baseCommits * energyMultiplier * (1 - depressionPenalty * 0.5) * (1 + streakBonus));
  if (commitsDelta < 1) commitsDelta = 1;

  // Энергия тратится на каждый тап
  const energyDelta = -1;
  
  // Депрессия растёт если энергия низкая
  let depressionDelta = 0;
  if (energy < 20) depressionDelta = 1;
  if (energy < 10) depressionDelta = 2;

  // Проверка повышения tier
  const tierThresholds = (process.env.TIER_THRESHOLDS || '100,500,2000,10000')
    .split(',').map(Number);
  
  let newTier = tier;
  for (let i = 0; i < tierThresholds.length; i++) {
    if (progress.commits_current >= tierThresholds[i]) {
      newTier = i + 2; // +2 потому что tier 1 = Junior, а thresholds начинаются с перехода на Middle
    }
  }

  // Сброс commits_current при повышении tier
  let newCommitsCurrent = progress.commits_current + commitsDelta;
  if (newTier > tier) {
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
