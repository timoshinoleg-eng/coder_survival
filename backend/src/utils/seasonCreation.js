import { STAGE2 } from '../config/balance.js';

const { PASS } = STAGE2;

/**
 * Create the next season in sprint_passes and seed pass_rewards.
 * @param {object} client — pg Pool client (must be inside a transaction)
 * @param {object} [options]
 * @param {number} [options.seasonNumber] — override (default: max + 1)
 * @param {string} [options.seasonName] — override (default: "Season N")
 * @param {string} [options.theme] — override (default: "default")
 * @param {number} [options.seasonDays] — override (default: PASS.SEASON_DAYS)
 * @returns {object} { season: row, rewardCount: number }
 */
export async function createNextSeason(client, options = {}) {
  const maxResult = await client.query(
    'SELECT COALESCE(MAX(season_number), 0) AS max_num FROM sprint_passes'
  );
  const nextNumber = options.seasonNumber ?? (maxResult.rows[0].max_num + 1);
  const seasonName = options.seasonName ?? `Season ${nextNumber}`;
  const theme = options.theme ?? 'default';
  const seasonDays = options.seasonDays ?? PASS.SEASON_DAYS;

  const today = new Date();
  const startDate = today.toISOString().slice(0, 10);
  const endDateObj = new Date(today);
  endDateObj.setUTCDate(endDateObj.getUTCDate() + seasonDays - 1);
  const endDate = endDateObj.toISOString().slice(0, 10);

  const seasonResult = await client.query(
    `INSERT INTO sprint_passes (season_number, season_name, start_date, end_date, is_active, theme)
     VALUES ($1, $2, $3, $4, TRUE, $5)
     RETURNING id, season_number, season_name, start_date, end_date, theme`,
    [nextNumber, seasonName, startDate, endDate, theme]
  );
  const season = seasonResult.rows[0];

  const levels = PASS.LEVELS;
  const values = [];
  const params = [];
  let paramIdx = 1;

  for (const level of levels) {
    const freeReward = PASS.FREE_REWARDS[level.level] || { energy: 10 };
    const premiumReward = PASS.PREMIUM_REWARDS[level.level] || { energy: 20, commitsCurrent: 10 };
    values.push(
      `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}::jsonb, $${paramIdx + 4}::jsonb)`
    );
    params.push(season.id, level.level, level.requiredXp, JSON.stringify(freeReward), JSON.stringify(premiumReward));
    paramIdx += 5;
  }

  await client.query(
    `INSERT INTO pass_rewards (pass_id, level, required_xp, free_reward_payload, premium_reward_payload)
     VALUES ${values.join(', ')}`,
    params
  );

  return { season, rewardCount: levels.length };
}
