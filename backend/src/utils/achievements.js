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
 * @param {string} triggerType — 'tap', 'commit_total', 'rank_up', 'night_session', 'burnout', 'use_item', 'meme_share', 'referral', 'random_event'
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

      // bug_hunter: 100 crit taps
      if (payload.isCrit) {
        const bugResult = await client.query(
          `UPDATE user_achievements
           SET progress_value = progress_value + 1,
               completed = (progress_value + 1) >= (
                 SELECT target_value FROM achievements WHERE achievement_id = 'bug_hunter'
               ),
               completed_at = CASE
                 WHEN completed THEN completed_at
                 WHEN (progress_value + 1) >= (SELECT target_value FROM achievements WHERE achievement_id = 'bug_hunter')
                 THEN NOW()
                 ELSE completed_at
               END
           WHERE user_id = $1 AND achievement_id = 'bug_hunter' AND completed = FALSE
           RETURNING completed, completed_at`,
          [userId]
        );
        if (bugResult.rows[0]?.completed && bugResult.rows[0]?.completed_at) {
          completedAchievements.push('bug_hunter');
        }
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

    case 'burnout': {
      // burnout_first: reach Heart Attack threshold once.
      const burnoutResult = await client.query(
        `UPDATE user_achievements
         SET progress_value = 1,
             completed = TRUE,
             completed_at = COALESCE(completed_at, NOW())
         WHERE user_id = $1 AND achievement_id = 'burnout_first' AND completed = FALSE
         RETURNING completed, completed_at`,
        [userId]
      );
      if (burnoutResult.rows[0]?.completed) {
        completedAchievements.push('burnout_first');
      }
      break;
    }

    case 'use_item': {
      // coffee_addict: drink coffee 50 times
      if (payload.itemId === 'coffee') {
        const coffeeResult = await client.query(
          `UPDATE user_achievements
           SET progress_value = progress_value + 1,
               completed = (progress_value + 1) >= (
                 SELECT target_value FROM achievements WHERE achievement_id = 'coffee_addict'
               ),
               completed_at = CASE
                 WHEN completed THEN completed_at
                 WHEN (progress_value + 1) >= (SELECT target_value FROM achievements WHERE achievement_id = 'coffee_addict')
                 THEN NOW()
                 ELSE completed_at
               END
           WHERE user_id = $1 AND achievement_id = 'coffee_addict' AND completed = FALSE
           RETURNING completed, completed_at`,
          [userId]
        );
        if (coffeeResult.rows[0]?.completed && coffeeResult.rows[0]?.completed_at) {
          completedAchievements.push('coffee_addict');
        }
      }
      break;
    }

    case 'meme_share': {
      // meme_lord: share meme 10 times
      const memeResult = await client.query(
        `UPDATE user_achievements
         SET progress_value = progress_value + 1,
             completed = (progress_value + 1) >= (
               SELECT target_value FROM achievements WHERE achievement_id = 'meme_lord'
             ),
             completed_at = CASE
               WHEN completed THEN completed_at
               WHEN (progress_value + 1) >= (SELECT target_value FROM achievements WHERE achievement_id = 'meme_lord')
               THEN NOW()
               ELSE completed_at
             END
         WHERE user_id = $1 AND achievement_id = 'meme_lord' AND completed = FALSE
         RETURNING completed, completed_at`,
        [userId]
      );
      if (memeResult.rows[0]?.completed && memeResult.rows[0]?.completed_at) {
        completedAchievements.push('meme_lord');
      }
      break;
    }

    case 'referral': {
      // referral_god: refer 5 active users
      const referralResult = await client.query(
        `UPDATE user_achievements
         SET progress_value = (
           SELECT COUNT(*)::int FROM referrals WHERE referrer_id = $1
         ),
             completed = (
               SELECT COUNT(*)::int FROM referrals WHERE referrer_id = $1
             ) >= (SELECT target_value FROM achievements WHERE achievement_id = 'referral_god'),
             completed_at = CASE
               WHEN completed THEN completed_at
               WHEN (
                 SELECT COUNT(*)::int FROM referrals WHERE referrer_id = $1
               ) >= (SELECT target_value FROM achievements WHERE achievement_id = 'referral_god')
               THEN NOW()
               ELSE completed_at
             END
         WHERE user_id = $1 AND achievement_id = 'referral_god' AND completed = FALSE
         RETURNING completed, completed_at`,
        [userId]
      );
      if (referralResult.rows[0]?.completed && referralResult.rows[0]?.completed_at) {
        completedAchievements.push('referral_god');
      }
      break;
    }

    case 'random_event': {
      // prod_survivor: prod_down event 10 times
      if (payload.eventId === 'prod_down') {
        const prodResult = await client.query(
          `UPDATE user_achievements
           SET progress_value = progress_value + 1,
               completed = (progress_value + 1) >= (
                 SELECT target_value FROM achievements WHERE achievement_id = 'prod_survivor'
               ),
               completed_at = CASE
                 WHEN completed THEN completed_at
                 WHEN (progress_value + 1) >= (SELECT target_value FROM achievements WHERE achievement_id = 'prod_survivor')
                 THEN NOW()
                 ELSE completed_at
               END
           WHERE user_id = $1 AND achievement_id = 'prod_survivor' AND completed = FALSE
           RETURNING completed, completed_at`,
          [userId]
        );
        if (prodResult.rows[0]?.completed && prodResult.rows[0]?.completed_at) {
          completedAchievements.push('prod_survivor');
        }
      }
      break;
    }

    case 'minigame_success': {
      const gameType = payload?.gameType;
      if (!gameType) break;
      const mgResult = await client.query(
        `UPDATE user_achievements
         SET progress_value = progress_value + 1,
             completed = (progress_value + 1) >= (
               SELECT target_value FROM achievements WHERE achievement_id = 'architect_winner'
             ),
             completed_at = CASE
               WHEN completed THEN completed_at
               WHEN (progress_value + 1) >= (SELECT target_value FROM achievements WHERE achievement_id = 'architect_winner')
               THEN NOW()
               ELSE completed_at
             END
         WHERE user_id = $1 AND achievement_id = 'architect_winner' AND completed = FALSE
           AND condition->>'gameType' = $2
         RETURNING completed, completed_at`,
        [userId, gameType]
      );
      if (mgResult.rows[0]?.completed && mgResult.rows[0]?.completed_at) {
        completedAchievements.push('architect_winner');
      }
      break;
    }

    case 'minigame_failure': {
      const gameType = payload?.gameType;
      // rubber_duck_unlock: 3 mini-game failures in a day
      const failResult = await client.query(
        `UPDATE user_achievements
         SET progress_value = progress_value + 1,
             completed = (progress_value + 1) >= (
               SELECT target_value FROM achievements WHERE achievement_id = 'rubber_duck_unlock'
             ),
             completed_at = CASE
               WHEN completed THEN completed_at
               WHEN (progress_value + 1) >= (SELECT target_value FROM achievements WHERE achievement_id = 'rubber_duck_unlock')
               THEN NOW()
               ELSE completed_at
             END
         WHERE user_id = $1 AND achievement_id = 'rubber_duck_unlock' AND completed = FALSE
         RETURNING completed, completed_at`,
        [userId]
      );
      if (failResult.rows[0]?.completed && failResult.rows[0]?.completed_at) {
        completedAchievements.push('rubber_duck_unlock');
      }
      break;
    }
  }

  // Unlock rewards for completed achievements
  for (const achievementId of completedAchievements) {
    const rewardResult = await client.query(
      `SELECT reward_payload FROM achievements WHERE achievement_id = $1`,
      [achievementId]
    );
    const reward = rewardResult.rows[0]?.reward_payload || {};

    if (reward.skinId || reward.skin) {
      await client.query(
        `INSERT INTO user_skins (user_id, skin_id, equipped, unlocked_at)
         VALUES ($1, $2, false, NOW())
         ON CONFLICT (user_id, skin_id) DO NOTHING`,
        [userId, reward.skinId || reward.skin]
      );
    }

    if (reward.title) {
      await client.query(
        `UPDATE progression
         SET inventory = COALESCE(inventory, '{}'::jsonb) || jsonb_build_object('title_' || $2, 1)
         WHERE user_id = $1`,
        [userId, reward.title]
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
