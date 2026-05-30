import {
  DEPRESSION_PASSIVE_RECOVERY_PER_HOUR,
  MIN_IDLE_THRESHOLD_SECONDS,
  RECOVERY_INTERVAL_NEWBIE_SECONDS,
  RECOVERY_INTERVAL_VETERAN_SECONDS,
  TAP_MECHANICS
} from '../config/balance.js';
import { getEventRecoveryMultiplier } from './events.js';
import { applyProductionAlertDrain } from './randomEventState.js';

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

export function getEffectiveRecoveryIntervalSeconds(progression, now = new Date(), skinRecoveryMult = 1) {
  const createdAt = toValidDate(progression?.created_at);
  let interval = RECOVERY_INTERVAL_VETERAN_SECONDS;

  if (createdAt) {
    const ageMs = now.getTime() - createdAt.getTime();
    const newbieWindowMs = TAP_MECHANICS.newbiePeriodHours * 60 * 60 * 1000;
    const isNewbie = ageMs >= 0 && ageMs < newbieWindowMs;
    if (isNewbie) {
      interval = RECOVERY_INTERVAL_NEWBIE_SECONDS;
    }
  }

  if (skinRecoveryMult > 1) {
    interval = Math.max(1, Math.floor(interval / skinRecoveryMult));
  }

  return interval;
}

export function getRecoveryEtaSeconds(progression, maxEnergy = TAP_MECHANICS.maxEnergy, now = new Date(), skinRecoveryMult = 1) {
  if (!progression) return null;

  const energy = Number(progression.energy ?? 0);
  if (energy >= maxEnergy) return 0;

  const anchor = getRecoveryAnchor(progression);
  const checkpoint = getRecoveryCheckpoint(progression);
  let interval = getEffectiveRecoveryIntervalSeconds(progression, now, skinRecoveryMult);
  const recoveryMultiplier = getEventRecoveryMultiplier(progression.event_state || {}, now);
  if (recoveryMultiplier > 1) {
    interval = Math.max(1, Math.floor(interval / recoveryMultiplier));
  }
  const secondsPassed = Math.max(0, Math.floor((now.getTime() - checkpoint.getTime()) / 1000));
  const remainder = secondsPassed % interval;

  return remainder === 0 && secondsPassed > 0 ? 0 : interval - remainder;
}

export async function recoverProgression(client, progression, maxEnergy = TAP_MECHANICS.maxEnergy, skinRecoveryMult = 1, officeCatEquipped = false) {
  if (!progression) return progression;

  const now = new Date();
  const energy = Number(progression.energy ?? 0);
  const depression = Number(progression.depression_level ?? 0);
  const anchor = getRecoveryAnchor(progression);
  const checkpoint = getRecoveryCheckpoint(progression);
  let interval = getEffectiveRecoveryIntervalSeconds(progression, now, skinRecoveryMult);
  const recoveryMultiplier = getEventRecoveryMultiplier(progression.event_state || {}, now);
  if (recoveryMultiplier > 1) {
    interval = Math.max(1, Math.floor(interval / recoveryMultiplier));
  }
  const secondsPassed = Math.max(0, Math.floor((now.getTime() - checkpoint.getTime()) / 1000));
  const productionAlert = applyProductionAlertDrain(progression.event_state || {}, maxEnergy, now);
  const energyAfterAlert = Math.max(0, energy - productionAlert.energyDrain);

  const shouldRecoverEnergy = secondsPassed >= MIN_IDLE_THRESHOLD_SECONDS;
  const energyRecovered = shouldRecoverEnergy ? Math.floor(secondsPassed / interval) : 0;

  const passiveDepressionDecay = Math.floor(
    (secondsPassed / 3600) * DEPRESSION_PASSIVE_RECOVERY_PER_HOUR
  );

  if (energyRecovered <= 0) {
    if (passiveDepressionDecay > 0 && depression > 0) {
      const newDepression = Math.max(0, depression - passiveDepressionDecay);
      const isBurnout = newDepression >= TAP_MECHANICS.maxDepression;
      await client.query(
        `UPDATE progression
         SET depression_level = $2,
             is_burnout = $3,
             energy = $4,
             event_state = $5
         WHERE user_id = $1`,
        [progression.user_id, newDepression, isBurnout, energyAfterAlert, JSON.stringify({ ...(progression.event_state || {}), randomEventState: productionAlert.randomEventState })]
      );
      return {
        ...progression,
        energy: energyAfterAlert,
        depression_level: newDepression,
        is_burnout: isBurnout,
        event_state: { ...(progression.event_state || {}), randomEventState: productionAlert.randomEventState },
        _idleRecovery: null
      };
    }
    if (productionAlert.energyDrain > 0) {
      await client.query(
        `UPDATE progression
         SET energy = $2,
             event_state = $3
         WHERE user_id = $1`,
        [progression.user_id, energyAfterAlert, JSON.stringify({ ...(progression.event_state || {}), randomEventState: productionAlert.randomEventState })]
      );
    }
    return {
      ...progression,
      energy: energyAfterAlert,
      is_burnout: depression >= TAP_MECHANICS.maxDepression,
      event_state: { ...(progression.event_state || {}), randomEventState: productionAlert.randomEventState },
      _idleRecovery: null
    };
  }

  const newEnergy = Math.min(maxEnergy, energyAfterAlert + energyRecovered);
  const actualRecovered = newEnergy - energyAfterAlert;

  if (actualRecovered <= 0) {
    return {
      ...progression,
      is_burnout: depression >= TAP_MECHANICS.maxDepression,
      _idleRecovery: null
    };
  }

  const depressionRecovered = Math.floor(actualRecovered / TAP_MECHANICS.depressionRecoveryPerEnergy);
  let combinedDepressionDecay = depressionRecovered + passiveDepressionDecay;

  // Office Cat skin: -10 depression every 5 minutes when equipped
  if (officeCatEquipped && secondsPassed >= 300) {
    const catReliefCycles = Math.floor(secondsPassed / 300);
    combinedDepressionDecay += catReliefCycles * 10;
  }

  const newDepression = Math.max(0, depression - combinedDepressionDecay);
  const isBurnout = newDepression >= TAP_MECHANICS.maxDepression;
  const nextCheckpoint = new Date(checkpoint.getTime() + actualRecovered * interval * 1000);

  const result = await client.query(
    `UPDATE progression
     SET energy = $2,
          depression_level = $3,
          is_burnout = $4,
          energy_recovery_checkpoint_at = $5,
          event_state = $6
       WHERE user_id = $1
       RETURNING *`,
    [progression.user_id, newEnergy, newDepression, isBurnout, nextCheckpoint, JSON.stringify({ ...(progression.event_state || {}), randomEventState: productionAlert.randomEventState })]
  );

  const idleRecovery = { energy: actualRecovered, secondsIdle: secondsPassed };

  return {
    ...(result.rows[0] || {
      ...progression,
      energy: newEnergy,
      depression_level: newDepression,
      is_burnout: isBurnout,
      energy_recovery_checkpoint_at: nextCheckpoint
    }),
    _idleRecovery: idleRecovery
  };
}
