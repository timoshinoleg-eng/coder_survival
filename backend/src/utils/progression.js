import { DEPRESSION_RECOVERY_PER_ENERGY } from '../config/balance.js';

export async function recoverProgression(client, progression, maxEnergy = 100) {
  if (!progression) return progression;

  const energy = Number(progression.energy ?? 0);
  const updatedAt = progression.updated_at ? new Date(progression.updated_at) : null;
  if (!updatedAt || Number.isNaN(updatedAt.getTime()) || energy >= maxEnergy) {
    return progression;
  }

  const recoveryIntervalSeconds = parseInt(process.env.ENERGY_RECOVERY_INTERVAL_SECONDS || '60', 10);
  const now = Date.now();
  const elapsedSeconds = Math.floor((now - updatedAt.getTime()) / 1000);
  const recoveredEnergy = Math.floor(elapsedSeconds / recoveryIntervalSeconds);

  if (recoveredEnergy <= 0) {
    return progression;
  }

  const depressionRecovery = Math.floor(recoveredEnergy / DEPRESSION_RECOVERY_PER_ENERGY);
  const result = await client.query(
    `UPDATE progression
     SET energy = LEAST($3, energy + $2),
         depression_level = GREATEST(0, depression_level - $4),
         updated_at = NOW()
     WHERE user_id = $1
     RETURNING *`,
    [progression.user_id, recoveredEnergy, maxEnergy, depressionRecovery]
  );

  return result.rows[0] || progression;
}
