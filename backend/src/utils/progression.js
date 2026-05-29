import { TAP_MECHANICS } from '../config/balance.js';
import { getEventRecoveryMultiplier } from './events.js';

function toValidDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getRecoveryAnchor(progression) {
  const activityAnchor = toValidDate(progression?.last_energy_activity_at);
  if (activityAnchor) return activityAnchor;

  const createdAnchor = toValidDate(progression?.created_at);
  if (createdAnchor) return createdAnchor;

  console.warn('[Progression] Missing valid last_energy_activity_at and created_at; using current time', {
    userId: progression?.user_id ?? null
  });
  return new Date();
}

function getRecoveryCheckpoint(progression) {
  return toValidDate(progression?.energy_recovery_checkpoint_at) || getRecoveryAnchor(progression);
}

export function getEffectiveRecoveryIntervalSeconds(progression, now = new Date()) {
  const createdAt = toValidDate(progression?.created_at);
  if (!createdAt) {
    return TAP_MECHANICS.energyRecoveryIntervalSeconds;
  }

  const ageMs = now.getTime() - createdAt.getTime();
  const newbieWindowMs = TAP_MECHANICS.newbiePeriodHours * 60 * 60 * 1000;
  const isNewbie = ageMs >= 0 && ageMs < newbieWindowMs;

  if (!isNewbie) {
    return TAP_MECHANICS.energyRecoveryIntervalSeconds;
  }

  console.log('newbie_recovery_active', {
    userId: progression?.user_id ?? null,
    createdAt: createdAt.toISOString()
  });

  return Math.floor(
    TAP_MECHANICS.energyRecoveryIntervalSeconds / TAP_MECHANICS.newbieRecoveryMultiplier
  );
}

export function getRecoveryEtaSeconds(progression, maxEnergy = TAP_MECHANICS.maxEnergy, now = new Date()) {
  if (!progression) return null;

  const energy = Number(progression.energy ?? 0);
  if (energy >= maxEnergy) return 0;

  const anchor = getRecoveryAnchor(progression);
  const checkpoint = getRecoveryCheckpoint(progression);
  let interval = getEffectiveRecoveryIntervalSeconds(progression, now);
  const recoveryMultiplier = getEventRecoveryMultiplier(progression.event_state || {}, now);
  if (recoveryMultiplier > 1) {
    interval = Math.max(1, Math.floor(interval / recoveryMultiplier));
  }
  const secondsPassed = Math.max(0, Math.floor((now.getTime() - checkpoint.getTime()) / 1000));
  const remainder = secondsPassed % interval;

  return remainder === 0 && secondsPassed > 0 ? 0 : interval - remainder;
}

export async function recoverProgression(client, progression, maxEnergy = TAP_MECHANICS.maxEnergy) {
  if (!progression) return progression;

  const now = new Date();
  const energy = Number(progression.energy ?? 0);
  const depression = Number(progression.depression_level ?? 0);
  const anchor = getRecoveryAnchor(progression);
  const checkpoint = getRecoveryCheckpoint(progression);
  let interval = getEffectiveRecoveryIntervalSeconds(progression, now);
  const recoveryMultiplier = getEventRecoveryMultiplier(progression.event_state || {}, now);
  if (recoveryMultiplier > 1) {
    interval = Math.max(1, Math.floor(interval / recoveryMultiplier));
  }
  const secondsPassed = Math.max(0, Math.floor((now.getTime() - checkpoint.getTime()) / 1000));
  const energyRecovered = Math.floor(secondsPassed / interval);

  if (energyRecovered <= 0) {
    return {
      ...progression,
      is_burnout: depression >= TAP_MECHANICS.maxDepression
    };
  }

  const newEnergy = Math.min(maxEnergy, energy + energyRecovered);
  const actualRecovered = newEnergy - energy;

  if (actualRecovered <= 0) {
    return {
      ...progression,
      is_burnout: depression >= TAP_MECHANICS.maxDepression
    };
  }

  const depressionRecovered = Math.floor(actualRecovered / TAP_MECHANICS.depressionRecoveryPerEnergy);
  const newDepression = Math.max(0, depression - depressionRecovered);
  const isBurnout = newDepression >= TAP_MECHANICS.maxDepression;
  const nextCheckpoint = new Date(checkpoint.getTime() + actualRecovered * interval * 1000);

  const result = await client.query(
    `UPDATE progression
     SET energy = $2,
         depression_level = $3,
         is_burnout = $4,
         energy_recovery_checkpoint_at = $5
     WHERE user_id = $1
     RETURNING *`,
    [progression.user_id, newEnergy, newDepression, isBurnout, nextCheckpoint]
  );

  console.log('energy_recovery_trusted', {
    userId: progression.user_id,
    energyRecovered: actualRecovered,
    anchor: anchor.toISOString(),
    checkpoint: checkpoint.toISOString(),
    nextCheckpoint: nextCheckpoint.toISOString(),
    intervalSeconds: interval
  });

  return result.rows[0] || {
    ...progression,
    energy: newEnergy,
    depression_level: newDepression,
    is_burnout: isBurnout,
    energy_recovery_checkpoint_at: nextCheckpoint
  };
}
