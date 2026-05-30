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
import { checkAchievement } from '../utils/achievements.js';
import { logDailyFarm } from '../utils/farmLog.js';
import { updateWeeklySprintState } from '../utils/weeklySprint.js';

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
      let success = score >= (config.minSuccessScore ?? config.maxScore);

      // Query equipped skins for rubber duck check
      const equippedSkinsResult = await client.query(
        `SELECT skin_id FROM user_skins WHERE user_id = $1 AND equipped = true`,
        [userId]
      );
      const equippedSkins = new Set(equippedSkinsResult.rows.map(r => r.skin_id));

      // Rubber Duck skin: 20% chance to save a failed mini-game
      let duckSaved = false;
      if (!success && equippedSkins.has('rubber_duck')) {
        if (Math.random() < 0.20) {
          success = true;
          duckSaved = true;
        }
      }

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
          tapBoostDurationMinutes: reward.tapBoostDurationMinutes || null,
          skinFragment: reward.skinFragment || null
        };

        const inventoryUpdate = reward.skinFragment
          ? `inventory = COALESCE(inventory, '{}') || jsonb_build_object($6, COALESCE((inventory->>$6)::int, 0) + 1),`
          : '';
        const inventoryParam = reward.skinFragment ? [`fragment_${reward.skinFragment}`] : [];

        await client.query(
          `UPDATE progression
           SET commits_total = commits_total + $2,
               commits_current = commits_current + $2,
               depression_level = GREATEST(0, depression_level - $3),
               minigame_state = $4,
               active_effects = $5
               ${inventoryUpdate ? `, ${inventoryUpdate}` : ''}
           WHERE user_id = $1`,
          [
            userId,
            reward.commits || 0,
            reward.depressionRelief || 0,
            JSON.stringify(updateMinigameState(prog.minigame_state || {}, gameType)),
            JSON.stringify(activeEffects),
            ...inventoryParam
          ]
        );
        if (Number(reward.commits || 0) > 0) {
          await logDailyFarm(client, userId, Number(reward.commits || 0));
        }
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

      // Grant skin reward if present (e.g., IPO -> cto_cape)
      if (success && reward?.skin) {
        await client.query(
          `INSERT INTO user_skins (user_id, skin_id, equipped, unlocked_at)
           VALUES ($1, $2, false, NOW())
           ON CONFLICT (user_id, skin_id) DO NOTHING`,
          [userId, reward.skin]
        );
      }

      // Update weekly sprint progress
      try {
        const sprintIncs = { minigamesCompleted: 1 };
        if (success && reward?.commits) {
          sprintIncs.commitsEarned = reward.commits;
        }
        await updateWeeklySprintState(client, userId, sprintIncs);
      } catch (sprintErr) {
        console.error('Weekly sprint update failed:', sprintErr);
      }

      // Achievement triggers
      if (success) {
        try {
          await checkAchievement(client, userId, 'minigame_success', { gameType });
        } catch (achErr) {
          console.error('Achievement check error:', achErr);
        }
      } else {
        // Track failure for secret achievement and GIF trigger
        try {
          await checkAchievement(client, userId, 'minigame_failure', { gameType });

          // Increment daily failure counter
          await client.query(
            `UPDATE progression
             SET inventory = COALESCE(inventory, '{}') || jsonb_build_object(
               'minigame_failures_today', COALESCE((inventory->>'minigame_failures_today')::int, 0) + 1,
               '${gameType}_failures', COALESCE((inventory->>'${gameType}_failures')::int, 0) + 1
             )
             WHERE user_id = $1`,
            [userId]
          );

          // Auto-send debug GIF after 10 failed code_review attempts
          if (gameType === 'code_review') {
            const failResult = await client.query(
              `SELECT COALESCE((inventory->>'code_review_failures')::int, 0) AS cnt
               FROM progression WHERE user_id = $1`,
              [userId]
            );
            const totalFailures = parseInt(failResult.rows[0]?.cnt || 0, 10);
            if (totalFailures === 10) {
              try {
                const { generateDebugStagesGif } = await import('../utils/gifRenderer.js');
                const gifBuffer = await generateDebugStagesGif();
                const { sendAnimationToChat } = await import('../utils/telegram.js');
                const chatResult = await client.query(
                  `SELECT work_chat_id FROM progression WHERE user_id = $1`,
                  [userId]
                );
                const chatId = chatResult.rows[0]?.work_chat_id;
                if (chatId) {
                  await sendAnimationToChat(chatId, gifBuffer, '10 провалов в охоте на багов. Это искусство.');
                }
              } catch (gifErr) {
                console.error('[minigame] Failed to send debug GIF:', gifErr.message);
              }
            }
          }
        } catch (failErr) {
          console.error('Failure tracking error:', failErr);
        }
      }

      await client.query('COMMIT');

      return res.json({
        success,
        score,
        maxScore: config.maxScore,
        reward: appliedReward,
        activeEffects,
        duckSaved
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
