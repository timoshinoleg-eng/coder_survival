import { ensurePlayerLevel } from './vnext.js';
import { updateTeamProgress } from './teams.js';

/**
 * Shared reward applicator.
 * Supports:
 *   - energy: adds energy capped to maxEnergy
 *   - commitsCurrent: adds to progression.commits_current
 *   - depressionRelief: subtracts from depression_level
 *
 * This is the single place to apply non-shop rewards so that
 * event / pass / team / quest rewards stay consistent.
 */
export async function applyReward(client, userId, rewardPayload) {
  if (!rewardPayload || Object.keys(rewardPayload).length === 0) {
    return { applied: false };
  }

  const levelRow = await ensurePlayerLevel(client, userId);
  const maxEnergy = levelRow.resolved.maxEnergy;
  const updates = [];

  if (typeof rewardPayload.energy === 'number') {
    await client.query(
      `UPDATE progression
       SET energy = LEAST($3, energy + $2),
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, rewardPayload.energy, maxEnergy]
    );
    updates.push({ type: 'energy', value: rewardPayload.energy });
  }

  if (typeof rewardPayload.commitsCurrent === 'number') {
    const commitsDelta = Number(rewardPayload.commitsCurrent);
    await client.query(
      `UPDATE progression
       SET commits_current = commits_current + $2,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, commitsDelta]
    );
    await updateTeamProgress(client, userId, commitsDelta);
    updates.push({ type: 'commitsCurrent', value: commitsDelta });
  }

  if (typeof rewardPayload.xpTotal === 'number') {
    const xpDelta = Number(rewardPayload.xpTotal);
    await client.query(
      `UPDATE player_levels
       SET xp_total = xp_total + $2,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, xpDelta]
    );
    updates.push({ type: 'xpTotal', value: xpDelta });
  }

  if (typeof rewardPayload.depressionRelief === 'number') {
    await client.query(
      `UPDATE progression
       SET depression_level = GREATEST(0, depression_level - $2),
           is_burnout = GREATEST(0, depression_level - $2) >= 100,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, rewardPayload.depressionRelief]
    );
    updates.push({ type: 'depressionRelief', value: rewardPayload.depressionRelief });
  }

  return { applied: updates.length > 0, updates };
}
