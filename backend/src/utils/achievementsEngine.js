import { pool } from '../index.js';

/**
 * Check achievements for a user based on trigger types and current context.
 * @param {number} userId
 * @param {string[]} triggerTypes
 * @param {object} context
 * @returns {Promise<{newlyEarned: string[], progressUpdated: string[]}>}
 */
export async function checkAchievementsForUser(userId, triggerTypes, context) {
  const client = await pool.connect();
  try {
    const achievementsResult = await client.query(
      `SELECT * FROM achievements
       WHERE trigger_type = ANY($1)
         AND is_active = TRUE
       ORDER BY sort_order ASC, id ASC`,
      [triggerTypes]
    );

    const newlyEarned = [];
    const progressUpdated = [];

    for (const achievement of achievementsResult.rows) {
      const criteria = achievement.criteria || {};
      let currentValue = 0;
      let shouldEvaluate = true;

      switch (achievement.trigger_type) {
        case 'tap_count':
          currentValue = context.currentTaps || 0;
          break;
        case 'coins_balance':
          currentValue = context.currentCoins || 0;
          break;
        case 'xp_total':
          currentValue = context.currentXp || 0;
          break;
        case 'skins_count':
          currentValue = context.currentSkins || 0;
          break;
        case 'battle_count':
          currentValue = context.currentBattles || 0;
          break;
        case 'time_pattern': {
          const hour = context.serverHour;
          const day = context.serverDay;
          if (criteria.after_hour !== undefined && criteria.before_hour !== undefined) {
            // Night owl style: taps during specific hours
            if (hour >= criteria.after_hour && hour < criteria.before_hour) {
              currentValue = context.currentTaps || 0;
            } else {
              shouldEvaluate = false;
            }
          } else if (criteria.days && Array.isArray(criteria.days)) {
            // Weekend warrior style: taps on specific days
            if (criteria.days.includes(day)) {
              currentValue = context.currentTaps || 0;
            } else {
              shouldEvaluate = false;
            }
          } else {
            shouldEvaluate = false;
          }
          break;
        }
        case 'special': {
          if (criteria.prelaunch_user) {
            // Query user's created_at for founder achievement
            const userResult = await client.query(
              `SELECT created_at < '2026-06-01' as is_prelaunch FROM users WHERE id = $1`,
              [userId]
            );
            if (userResult.rows[0]?.is_prelaunch) {
              currentValue = 1;
            } else {
              shouldEvaluate = false;
            }
          } else {
            shouldEvaluate = false;
          }
          break;
        }
        default:
          shouldEvaluate = false;
      }

      if (!shouldEvaluate) {
        continue;
      }

      if (achievement.is_progressive) {
        const targetValue = criteria.tap_target || criteria.target || 0;
        const percent = Math.min(100, Math.floor((currentValue / targetValue) * 100));

        await client.query(
          `INSERT INTO achievement_progress (user_id, achievement_id, current_value, target_value, percent, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (user_id, achievement_id) DO UPDATE SET
             current_value = EXCLUDED.current_value,
             target_value = EXCLUDED.target_value,
             percent = EXCLUDED.percent,
             updated_at = NOW()`,
          [userId, achievement.id, currentValue, targetValue, percent]
        );
        progressUpdated.push(achievement.slug);

        if (percent >= 100) {
          const granted = await grantAchievement(userId, achievement.slug, 'runtime');
          if (granted.wasNew) {
            newlyEarned.push(achievement.slug);
          }
        }
      } else {
        const targetValue = criteria.target || 0;
        if (currentValue >= targetValue) {
          const granted = await grantAchievement(userId, achievement.slug, 'runtime');
          if (granted.wasNew) {
            newlyEarned.push(achievement.slug);
          }
        }
      }
    }

    return { newlyEarned, progressUpdated };
  } finally {
    client.release();
  }
}

/**
 * Grant an achievement to a user.
 * @param {number} userId
 * @param {string} slug
 * @param {string} source
 * @returns {Promise<{success: boolean, wasNew: boolean}>}
 */
export async function grantAchievement(userId, slug, source = 'runtime') {
  const client = await pool.connect();
  try {
    const achievementResult = await client.query(
      `SELECT id FROM achievements WHERE slug = $1`,
      [slug]
    );
    if (achievementResult.rows.length === 0) {
      return { success: false, wasNew: false };
    }
    const achievementId = achievementResult.rows[0].id;

    const result = await client.query(
      `INSERT INTO user_achievements (user_id, achievement_id, source, earned_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, achievement_id) DO NOTHING
       RETURNING id`,
      [userId, achievementId, source]
    );

    return { success: true, wasNew: result.rows.length > 0 };
  } finally {
    client.release();
  }
}

/**
 * Claim an achievement's rewards.
 * @param {number} userId
 * @param {string} slug
 * @returns {Promise<{success: boolean, rewards: object[]}>}
 */
export async function claimAchievement(userId, slug) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT ua.id as ua_id, ua.earned_at, ua.claimed_at, a.id as achievement_id, a.reward, a.slug
       FROM user_achievements ua
       JOIN achievements a ON a.id = ua.achievement_id
       WHERE a.slug = $1 AND ua.user_id = $2
       FOR UPDATE`,
      [slug, userId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      throw { status: 404, message: 'Achievement not found' };
    }

    const row = result.rows[0];
    if (!row.earned_at) {
      await client.query('ROLLBACK');
      throw { status: 403, message: 'Not earned yet' };
    }
    if (row.claimed_at) {
      await client.query('ROLLBACK');
      throw { status: 409, message: 'Already claimed' };
    }

    const reward = row.reward || {};
    const appliedRewards = [];

    if (reward.coins) {
      // No dedicated coins column; use progression.commits_total as proxy
      await client.query(
        `UPDATE progression SET commits_total = commits_total + $1 WHERE user_id = $2`,
        [reward.coins, userId]
      );
      appliedRewards.push({ type: 'coins', amount: reward.coins });
    }

    if (reward.xp) {
      await client.query(
        `INSERT INTO player_levels (user_id, xp_total)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET
           xp_total = player_levels.xp_total + $2,
           updated_at = NOW()`,
        [userId, reward.xp]
      );
      appliedRewards.push({ type: 'xp', amount: reward.xp });
    }

    if (reward.skin_unlock) {
      await client.query(
        `INSERT INTO user_skins (user_id, skin_id, unlocked_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id, skin_id) DO NOTHING`,
        [userId, reward.skin_unlock]
      );
      appliedRewards.push({ type: 'skin_unlock', skinId: reward.skin_unlock });
    }

    if (reward.title) {
      await client.query(
        `UPDATE progression
         SET inventory = COALESCE(inventory, '{}'::jsonb) || jsonb_build_object('title_' || $2, 1)
         WHERE user_id = $1`,
        [userId, reward.title]
      );
      appliedRewards.push({ type: 'title', title: reward.title });
    }

    if (reward.badge) {
      await client.query(
        `UPDATE progression
         SET inventory = COALESCE(inventory, '{}'::jsonb) || jsonb_build_object('badge_' || $2, 1)
         WHERE user_id = $1`,
        [userId, reward.badge]
      );
      appliedRewards.push({ type: 'badge', badge: reward.badge });
    }

    await client.query(
      `UPDATE user_achievements
       SET claimed_at = NOW(),
           reward_applied = $1::jsonb,
           notification_sent = TRUE
       WHERE id = $2`,
      [JSON.stringify(appliedRewards), row.ua_id]
    );

    await client.query('COMMIT');
    return { success: true, rewards: appliedRewards };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get all active achievements with user progress.
 * @param {number} userId
 * @returns {Promise<object[]>}
 */
export async function getAchievementsWithProgress(userId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT
         a.id,
         a.slug,
         a.name,
         a.description,
         a.category,
         a.rarity,
         a.trigger_type,
         a.is_progressive,
         a.criteria,
         a.reward,
         a.is_secret,
         a.sort_order,
         ua.earned_at,
         ua.claimed_at,
         ua.notification_sent,
         ap.current_value,
         ap.target_value,
         ap.percent
       FROM achievements a
       LEFT JOIN user_achievements ua
         ON ua.achievement_id = a.id AND ua.user_id = $1
       LEFT JOIN achievement_progress ap
         ON ap.achievement_id = a.id AND ap.user_id = $1
       WHERE a.is_active = TRUE
       ORDER BY a.sort_order ASC, a.id ASC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Mark achievement notifications as read.
 * @param {number} userId
 * @param {string[]} slugs
 * @returns {Promise<{success: boolean, marked: number}>}
 */
export async function markNotificationsRead(userId, slugs) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE user_achievements
       SET notification_sent = TRUE
       FROM achievements a
       WHERE user_achievements.achievement_id = a.id
         AND user_achievements.user_id = $1
         AND a.slug = ANY($2)
       RETURNING user_achievements.id`,
      [userId, slugs]
    );
    return { success: true, marked: result.rows.length };
  } finally {
    client.release();
  }
}
