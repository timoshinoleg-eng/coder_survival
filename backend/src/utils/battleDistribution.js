import { BATTLE_REWARD_PREVIEW } from '../config/balance.js';
import { applyReward } from './rewards.js';

const BATTLE_DISTRIBUTION_LOCK_NAMESPACE = 42001;

/**
 * Distribute daily battle rewards for a given date.
 * Idempotent: safe to call multiple times for the same date.
 *
 * @param {pg.Client} client
 * @param {Date} date — defaults to yesterday
 * @returns {Promise<{ distributed: number, ranks: Array<{userId, rank, reward}> }>}
 */
export async function distributeBattleRewards(client, date = null) {
  const targetDate = date || getYesterday();
  const dateStr = formatDate(targetDate);
  const rangeStart = new Date(`${dateStr}T00:00:00.000Z`);
  const rangeEnd = new Date(rangeStart.getTime() + 24 * 60 * 60 * 1000);

  await client.query('BEGIN');

  try {
    await client.query(
      `SELECT pg_advisory_xact_lock($1, hashtext($2))`,
      [BATTLE_DISTRIBUTION_LOCK_NAMESPACE, dateStr]
    );

    // Check if already distributed
    const existing = await client.query(
      `SELECT COUNT(*) as cnt FROM battle_reward_claims WHERE battle_date = $1`,
      [dateStr]
    );
    if (parseInt(existing.rows[0].cnt, 10) > 0) {
      await client.query('COMMIT');
      return { distributed: 0, ranks: [], alreadyDistributed: true };
    }

    // Get top 3 players by commits earned on target date
    const topResult = await client.query(
      `SELECT
         u.id as user_id,
         COALESCE(SUM(s.commits_earned), 0) as commits_today
       FROM users u
       LEFT JOIN sessions s ON s.user_id = u.id
         AND s.started_at >= $1::timestamptz
         AND s.started_at < $2::timestamptz
       GROUP BY u.id
       HAVING COALESCE(SUM(s.commits_earned), 0) > 0
       ORDER BY commits_today DESC
       LIMIT 3`,
      [rangeStart.toISOString(), rangeEnd.toISOString()]
    );

    const rewards = [];
    for (let i = 0; i < topResult.rows.length; i++) {
      const row = topResult.rows[i];
      const rank = i + 1;
      const rewardKey = rank === 1 ? 'top1' : rank === 2 ? 'top2' : 'top3';
      const reward = BATTLE_REWARD_PREVIEW[rewardKey];

      if (!reward) continue;

      const claimInsert = await client.query(
        `INSERT INTO battle_reward_claims (user_id, battle_date, rank, reward_payload)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (user_id, battle_date) DO NOTHING
         RETURNING id`,
        [row.user_id, dateStr, rank, JSON.stringify(reward)]
      );
      if (claimInsert.rows.length === 0) {
        continue;
      }

      await applyReward(client, row.user_id, reward);

      rewards.push({
        userId: row.user_id,
        rank,
        commitsToday: parseInt(row.commits_today, 10),
        reward
      });
    }

    await client.query('COMMIT');

    return {
      distributed: rewards.length,
      ranks: rewards,
      date: dateStr
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

function getYesterday() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}
