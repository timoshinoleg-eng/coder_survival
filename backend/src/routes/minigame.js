import { Router } from 'express';
import { pool } from '../index.js';
import { STAGE2 } from '../config/balance.js';
import { ensurePlayerLevel } from '../utils/vnext.js';
import {
  canPlay,
  validateScore,
  buildReward,
  updateMinigameState
} from '../utils/minigame.js';
import { addEffect, pruneExpiredEffects } from '../utils/activeEffects.js';

const router = Router();
const { MINIGAMES } = STAGE2;

router.post('/start', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  const gameType = req.body?.gameType;
  if (!MINIGAMES[gameType]) {
    return res.status(400).json({ error: 'Unknown mini-game' });
  }

  try {
    const client = await pool.connect();
    try {
      const userResult = await client.query(
        `SELECT id FROM users WHERE telegram_id = $1`,
        [telegramUser.id]
      );
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      const userId = userResult.rows[0].id;
      const level = await ensurePlayerLevel(client, userId);
      const playerLevel = level.resolved.levelInRank || 1;

      const progResult = await client.query(
        `SELECT minigame_state FROM progression WHERE user_id = $1`,
        [userId]
      );
      const minigameState = progResult.rows[0]?.minigame_state || {};
      const check = canPlay(minigameState, gameType, playerLevel);

      if (!check.canPlay) {
        return res.status(403).json({
          canPlay: false,
          reason: check.reason,
          requiredLevel: check.requiredLevel || null,
          remainingMs: check.remainingMs || 0
        });
      }

      const config = MINIGAMES[gameType];
      return res.json({
        canPlay: true,
        config: {
          timeLimitSeconds: config.timeLimitSeconds,
          maxScore: config.maxScore
        }
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/complete', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  const gameType = req.body?.gameType;
  const score = Number(req.body?.score ?? -1);

  if (!MINIGAMES[gameType]) {
    return res.status(400).json({ error: 'Unknown mini-game' });
  }
  if (!validateScore(gameType, score)) {
    return res.status(400).json({ error: 'Invalid score' });
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

      const progResult = await client.query(
        `SELECT minigame_state, active_effects, energy, depression_level, commits_total
         FROM progression
         WHERE user_id = $1
         FOR UPDATE`,
        [userId]
      );
      const prog = progResult.rows[0] || {};
      const level = await ensurePlayerLevel(client, userId);
      const playerLevel = level.resolved.levelInRank || 1;

      const check = canPlay(prog.minigame_state || {}, gameType, playerLevel);
      if (!check.canPlay) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          canPlay: false,
          reason: check.reason,
          remainingMs: check.remainingMs || 0
        });
      }

      const reward = buildReward(gameType);
      const config = MINIGAMES[gameType];
      const success = score >= config.maxScore;

      let activeEffects = pruneExpiredEffects(prog.active_effects || {});
      let appliedReward = null;

      if (success && reward) {
        // Apply tap boost effect if present
        if (reward.tapBoostPercent && reward.tapBoostDurationMinutes) {
          activeEffects = addEffect(
            activeEffects,
            'tapBoost',
            { percent: reward.tapBoostPercent },
            reward.tapBoostDurationMinutes
          );
        }

        appliedReward = {
          commits: reward.commits || 0,
          depressionRelief: reward.depressionRelief || 0,
          tapBoostPercent: reward.tapBoostPercent || null,
          tapBoostDurationMinutes: reward.tapBoostDurationMinutes || null
        };

        await client.query(
          `UPDATE progression
           SET commits_total = commits_total + $2,
               depression_level = GREATEST(0, depression_level - $3),
               minigame_state = $4,
               active_effects = $5
           WHERE user_id = $1`,
          [
            userId,
            reward.commits || 0,
            reward.depressionRelief || 0,
            JSON.stringify(updateMinigameState(prog.minigame_state || {}, gameType)),
            JSON.stringify(activeEffects)
          ]
        );
      } else {
        // Even on failure, update lastPlayed to enforce cooldown
        await client.query(
          `UPDATE progression
           SET minigame_state = $2
           WHERE user_id = $1`,
          [
            userId,
            JSON.stringify(updateMinigameState(prog.minigame_state || {}, gameType))
          ]
        );
      }

      await client.query('COMMIT');

      return res.json({
        success,
        score,
        maxScore: config.maxScore,
        reward: appliedReward,
        activeEffects
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
