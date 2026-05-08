import { DEPRESSION_RECOVERY_PER_ENERGY, STRESS_V2 } from '../config/balance.js';

export async function recoverProgression(client, progression, maxEnergy = 100, featureFlags = {}) {
  if (!progression) return progression;

  const energy = Number(progression.energy ?? 0);
  // P0-1: use action-based idle anchor; fallback to updated_at for legacy users
  const anchorTimestamp = progression.last_energy_activity_at
    ? new Date(progression.last_energy_activity_at)
    : new Date(progression.updated_at);
  if (!anchorTimestamp || Number.isNaN(anchorTimestamp.getTime()) || energy >= maxEnergy) {
    return progression;
  }

  const recoveryIntervalSeconds = parseInt(process.env.ENERGY_RECOVERY_INTERVAL_SECONDS || '60', 10);
  const now = Date.now();
  const elapsedSeconds = Math.floor((now - anchorTimestamp.getTime()) / 1000);
  const recoveredEnergy = Math.floor(elapsedSeconds / recoveryIntervalSeconds);

  if (recoveredEnergy <= 0) {
    return progression;
  }

  const depressionRecovery = Math.floor(recoveredEnergy / DEPRESSION_RECOVERY_PER_ENERGY);

  // P0-2: stress_v2 passive depression decay
  const stressV2 = featureFlags?.stress_v2 === true;
  const totalDepressionRecovery = stressV2
    ? depressionRecovery + Math.floor(elapsedSeconds / 3600) * (STRESS_V2?.DEPRESSION_PASSIVE_DECAY_PER_HOUR || 5)
    : depressionRecovery;

  const result = await client.query(
    `UPDATE progression
     SET energy = LEAST($3, energy + $2),
         depression_level = GREATEST(0, depression_level - $4),
         updated_at = NOW()
     WHERE user_id = $1
     RETURNING *`,
    [progression.user_id, recoveredEnergy, maxEnergy, totalDepressionRecovery]
  );

  return result.rows[0] || progression;
}
