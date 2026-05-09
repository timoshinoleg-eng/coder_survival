/**
 * Achievement engine — auto-tracks player progress on key actions.
 * Call checkAchievement() after significant events.
 */

const ACHIEVEMENT_TRIGGERS = {
  'tap': 'tap_master',
  'commit_total': 'commit_king',
  'rank_up': 'legacy_zone',
  'night_session': 'night_shift_30',
  'referral': null, // handled separately
};

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

  // Ensure rows exist
  await client.query(
    `INSERT INTO user_achievements (user_id, achievement_id)
     SELECT $1, achievement_id
     FROM achievements
     ON CONFLICT (user_id, achievement_id) DO NOTHING`,
    [userId]
  );

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
         WHERE user_id = $1 AND achievement_id = 'tap_master'
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
         WHERE user_id = $1 AND achievement_id = 'commit_king'
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
           WHERE user_id = $1 AND achievement_id = 'legacy_zone'
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
      // night_shift_30: 30 sessions after 22:00
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
         WHERE user_id = $1 AND achievement_id = 'night_shift_30'
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
      `SELECT unlock_payload->>'skinId' as skin_id
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
 * Check if current session is a "night session" (after 22:00 local time)
 * Called from state.js or tap.js
 */
export function isNightSession() {
  const hour = new Date().getHours();
  return hour >= 22 || hour < 6;
}
