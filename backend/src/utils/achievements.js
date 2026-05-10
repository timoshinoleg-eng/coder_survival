/**
 * Achievement engine — auto-tracks player progress on key actions.
 * Call checkAchievement() after significant events.
 */

export async function ensureAchievementRows(client, userId) {
  await client.query(
    `INSERT INTO user_achievements (user_id, achievement_id)
     SELECT $1, achievement_id
     FROM achievements
     ON CONFLICT (user_id, achievement_id) DO NOTHING`,
    [userId],
  );
}

/**
 * Update achievement progress and return newly completed ones.
 *
 * @param {pg.Client} client
 * @param {number} userId
 * @param {string} triggerType — 'tap', 'commit_total', 'rank_up', 'night_session'
 * @param {object} payload — context data
 * @returns {Promise<Array>} — list of newly completed achievement IDs
 */
export async function checkAchievement(client, userId, triggerType, payload = {}) {
  const completedAchievements = [];

  switch (triggerType) {
    case 'tap': {
      // tap_master: 1000 taps
      const tapResult = await client.query(
        `UPDATE user_achievements
         SET progress_value = progress_value + 1,
             completed = (progress_value + 1) >= (
               SELECT target_value FROM achievements WHERE achievement_id = 'tap_master'
             ),
             completed_at = CASE
               WHEN completed THEN completed_at
               WHEN (progress_value + 1) >= (SELECT target_value FROM achievements WHERE achievement_id = 'tap_master')
               THEN NOW()
               ELSE completed_at
             END
         WHERE user_id = $1 AND achievement_id = 'tap_master' AND completed = FALSE
         RETURNING completed, completed_at`,
        [userId]
      );
      if (tapResult.rows[0]?.completed && tapResult.rows[0]?.completed_at) {
        completedAchievements.push('tap_master');
      }
      break;
    }

    case 'commit_total': {
      // commit_king: 10000 total commits
      const commitResult = await client.query(
        `SELECT commits_total FROM progression WHERE user_id = $1`,
        [userId]
      );
      const total = parseInt(commitResult.rows[0]?.commits_total || 0, 10);

      const kingResult = await client.query(
        `UPDATE user_achievements
         SET progress_value = $2,
             completed = $2 >= (
               SELECT target_value FROM achievements WHERE achievement_id = 'commit_king'
             ),
             completed_at = CASE
               WHEN completed THEN completed_at
               WHEN $2 >= (SELECT target_value FROM achievements WHERE achievement_id = 'commit_king')
               THEN NOW()
               ELSE completed_at
             END
         WHERE user_id = $1 AND achievement_id = 'commit_king' AND completed = FALSE
         RETURNING completed, completed_at`,
        [userId, total]
      );
      if (kingResult.rows[0]?.completed && kingResult.rows[0]?.completed_at) {
        completedAchievements.push('commit_king');
      }
      break;
    }

    case 'rank_up': {
      // legacy_zone: reach rank 3 (Senior)
      const rank = payload?.rank || 1;
      if (rank >= 3) {
        const zoneResult = await client.query(
          `UPDATE user_achievements
           SET progress_value = 1,
               completed = TRUE,
               completed_at = COALESCE(completed_at, NOW())
           WHERE user_id = $1 AND achievement_id = 'legacy_zone' AND completed = FALSE
           RETURNING completed, completed_at`,
          [userId]
        );
        if (zoneResult.rows[0]?.completed) {
          completedAchievements.push('legacy_zone');
        }
      }
      break;
    }

    case 'night_session': {
      // night_shift_30: 30 distinct sessions started during night hours
      if (!isNightSessionAt(payload?.sessionStartedAt)) {
        break;
      }

      const nightResult = await client.query(
        `UPDATE user_achievements
         SET progress_value = progress_value + 1,
             completed = (progress_value + 1) >= (
               SELECT target_value FROM achievements WHERE achievement_id = 'night_shift_30'
             ),
             completed_at = CASE
               WHEN completed THEN completed_at
               WHEN (progress_value + 1) >= (SELECT target_value FROM achievements WHERE achievement_id = 'night_shift_30')
               THEN NOW()
               ELSE completed_at
             END
         WHERE user_id = $1 AND achievement_id = 'night_shift_30' AND completed = FALSE
         RETURNING completed, completed_at`,
        [userId]
      );
      if (nightResult.rows[0]?.completed && nightResult.rows[0]?.completed_at) {
        completedAchievements.push('night_shift_30');
      }
      break;
    }
  }

  // Unlock skins for completed achievements
  for (const achievementId of completedAchievements) {
    const skinResult = await client.query(
      `SELECT reward_payload->>'skinId' as skin_id
       FROM achievements
       WHERE achievement_id = $1`,
      [achievementId]
    );
    const skinId = skinResult.rows[0]?.skin_id;
    if (skinId) {
      await client.query(
        `INSERT INTO user_skins (user_id, skin_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, skin_id) DO NOTHING`,
        [userId, skinId]
      );
    }
  }

  return completedAchievements;
}

/**
 * Check if a session start time falls into night hours (22:00-05:59).
 */
export function isNightSessionAt(dateLike) {
  if (!dateLike) {
    return false;
  }
  const hour = new Date(dateLike).getHours();
  return hour >= 22 || hour < 6;
}
