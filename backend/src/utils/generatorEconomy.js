import { buildGeneratorStatus, normalizeGeneratorState } from './generatorState.js';
import { applyLocPenalty, normalizeAntiCheatState } from './anticheat.js';
import { logDailyFarm } from './farmLog.js';
import { getGeneratorCostMultiplierFromEventState, getRandomEventLocMultiplier } from './randomEventState.js';
import { updateTeamProgress } from './teams.js';

function toValidDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function recoverPassiveLoc(client, progression, { accountAgeMinutes = 61, passiveMultiplier = 1 } = {}) {
  if (!progression) return progression;

  const generatorState = normalizeGeneratorState(progression.generator_state || {});
  const now = new Date();
  const lastCollectedAt = toValidDate(generatorState.lastCollectedAt)
    || toValidDate(progression.session_started_at)
    || toValidDate(progression.created_at)
    || now;
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - lastCollectedAt.getTime()) / 1000));
  const status = buildGeneratorStatus(generatorState, accountAgeMinutes, {
    costMultiplier: getGeneratorCostMultiplierFromEventState(progression.event_state || {})
  });
  const effectivePerSecond = Number(status.passiveLocPerSecond || 0) * Math.max(0, Number(passiveMultiplier || 1)) * getRandomEventLocMultiplier(progression.event_state || {}, now);
  const rawLocEarned = Math.floor(effectivePerSecond * elapsedSeconds);
  const antiCheatState = normalizeAntiCheatState(progression.anti_cheat_state || {});
  const locEarned = applyLocPenalty(rawLocEarned, antiCheatState.banScore);
  const nextGeneratorState = {
    ...generatorState,
    lastCollectedAt: now.toISOString()
  };

  if (locEarned <= 0) {
    return {
      ...progression,
      generator_state: nextGeneratorState,
      _passiveLocRecovery: null
    };
  }

  const result = await client.query(
    `UPDATE progression
     SET commits_total = commits_total + $2,
         lifetime_loc = lifetime_loc + $2,
         commits_current = commits_current + $2,
         generator_state = $3,
         updated_at = NOW()
     WHERE user_id = $1
     RETURNING *`,
    [progression.user_id, locEarned, JSON.stringify(nextGeneratorState)]
  );

  await updateTeamProgress(client, progression.user_id, locEarned);
  await logDailyFarm(client, progression.user_id, locEarned);

  return {
    ...(result.rows[0] || progression),
    _passiveLocRecovery: {
      locEarned,
      elapsedSeconds,
      passiveLocPerSecond: effectivePerSecond,
    },
  };
}

export async function purchaseGenerator(client, progression, tierId, { accountAgeMinutes = 61 } = {}) {
  const generatorState = normalizeGeneratorState(progression.generator_state || {});
  const status = buildGeneratorStatus(generatorState, accountAgeMinutes, {
    costMultiplier: getGeneratorCostMultiplierFromEventState(progression.event_state || {})
  });
  const tier = status.tiers.find((entry) => entry.id === tierId);
  if (!tier) return { error: 'Invalid generator', status: 400 };
  if (!tier.unlocked) return { error: 'Generator not unlocked', status: 409 };

  const commitsCurrent = Number(progression.commits_current || 0);
  if (commitsCurrent < tier.nextCost) {
    return { error: 'Not enough LOC', status: 409, required: tier.nextCost, current: commitsCurrent };
  }

  const nextGeneratorState = {
    ...generatorState,
    owned: {
      ...generatorState.owned,
      [tierId]: Number(generatorState.owned?.[tierId] || 0) + 1,
    },
    purchasedAt: {
      ...generatorState.purchasedAt,
      [tierId]: new Date().toISOString(),
    },
    lastCollectedAt: generatorState.lastCollectedAt || new Date().toISOString(),
  };

  const result = await client.query(
    `UPDATE progression
     SET commits_current = commits_current - $2,
         generator_state = $3,
         updated_at = NOW()
     WHERE user_id = $1
     RETURNING *`,
    [progression.user_id, tier.nextCost, JSON.stringify(nextGeneratorState)]
  );

  return {
    status: 200,
    progression: result.rows[0] || progression,
    generator: tierId,
    cost: tier.nextCost,
    generatorState: buildGeneratorStatus(nextGeneratorState, accountAgeMinutes),
  };
}
