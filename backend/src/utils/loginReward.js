import { LOGIN_STREAK_BONUS } from '../config/balance.js';
import { applyReward } from './rewards.js';

/**
 * Process automatic daily login reward.
 * Called on every /api/state load. If the user hasn't claimed today,
 * increments streak (or resets if broken), applies reward, and returns
 * the reward info for frontend toast.
 */
export async function processLoginReward(client, userId) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const claimResult = await client.query(
    `SELECT last_claimed_date, streak_days
     FROM daily_login_claims
     WHERE user_id = $1
     FOR UPDATE`,
    [userId]
  );

  let record = claimResult.rows[0];

  if (!record) {
    // First time — create record
    await client.query(
      `INSERT INTO daily_login_claims (user_id, last_claimed_date, streak_days)
       VALUES ($1, $2, 1)`,
      [userId, today]
    );
    record = { last_claimed_date: today, streak_days: 1 };
  }

  const lastClaimed = record.last_claimed_date ? new Date(record.last_claimed_date) : null;
  if (lastClaimed) {
    lastClaimed.setUTCHours(0, 0, 0, 0);
  }

  if (lastClaimed && lastClaimed.getTime() === today.getTime()) {
    // Already claimed today — return current streak without reward
    return {
      claimed: false,
      streak: record.streak_days,
      reward: null
    };
  }

  // Calculate new streak
  let streak = 1;
  if (lastClaimed) {
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    if (lastClaimed.getTime() === yesterday.getTime()) {
      streak = Math.min((record.streak_days || 0) + 1, 7);
    }
  }

  const bonus = LOGIN_STREAK_BONUS[streak] || {};
  const baseReward = { energy: 10 };
  const reward = { ...baseReward };
  for (const [key, value] of Object.entries(bonus)) {
    reward[key] = (reward[key] || 0) + value;
  }

  // Apply reward and update tracking
  await applyReward(client, userId, reward);

  await client.query(
    `UPDATE daily_login_claims
     SET last_claimed_date = $2,
         streak_days = $3,
         updated_at = NOW()
     WHERE user_id = $1`,
    [userId, today, streak]
  );

  // Also update progression.streak_days so UI is consistent
  await client.query(
    `UPDATE progression
     SET streak_days = $2,
         updated_at = NOW()
     WHERE user_id = $1`,
    [userId, streak]
  );

  return {
    claimed: true,
    streak,
    reward
  };
}
