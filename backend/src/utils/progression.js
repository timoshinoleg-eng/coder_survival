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

async function persistIdleSideEffects(client, progression, {
  energy,
  depression,
  isBurnout,
  burnoutAffliction,
  eventState,
  shouldPersistDepression
}) {
  if (shouldPersistDepression) {
    await client.query(
      `UPDATE progression
       SET depression_level = $2,
           is_burnout = $3,
           burnout_affliction = $4,
           energy = $5,
           event_state = $6
       WHERE user_id = $1`,
      [progression.user_id, depression, isBurnout, burnoutAffliction, energy, JSON.stringify(eventState)]
    );
  } else if (Number(progression.energy ?? 0) !== energy) {
    await client.query(
      `UPDATE progression
       SET energy = $2,
           event_state = $3
       WHERE user_id = $1`,
      [progression.user_id, energy, JSON.stringify(eventState)]
    );
  }

  return {
    ...progression,
    energy,
    depression_level: shouldPersistDepression ? depression : progression.depression_level,
    is_burnout: isBurnout,
    burnout_affliction: burnoutAffliction,
    event_state: eventState,
    _idleRecovery: null
  };
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

export function getRecoveryEtaSeconds(progression, maxEnergy = TAP_MECHANICS.maxEnergy, now = new Date(), skinRecoveryMult = 1, prestigeRecoveryMult = 1) {
  if (!progression) return null;

  const energy = Number(progression.energy ?? 0);
  if (energy >= maxEnergy) return 0;

  const anchor = getRecoveryAnchor(progression);
  const checkpoint = getRecoveryCheckpoint(progression);
  let interval = getEffectiveRecoveryIntervalSeconds(progression, now, skinRecoveryMult);
  if (prestigeRecoveryMult > 1) {
    interval = Math.max(1, Math.floor(interval / prestigeRecoveryMult));
  }
  const recoveryMultiplier = getEventRecoveryMultiplier(progression.event_state || {}, now);
  if (recoveryMultiplier > 1) {
    interval = Math.max(1, Math.floor(interval / recoveryMultiplier));
  }
  const secondsPassed = Math.max(0, Math.floor((now.getTime() - checkpoint.getTime()) / 1000));
  const remainder = secondsPassed % interval;

  return remainder === 0 && secondsPassed > 0 ? 0 : interval - remainder;
}

export async function recoverProgression(client, progression, maxEnergy = TAP_MECHANICS.maxEnergy, skinRecoveryMult = 1, officeCatEquipped = false, prestigeRecoveryMult = 1) {
  if (!progression) return progression;

  const now = new Date();
  const energy = Number(progression.energy ?? 0);
  const depression = Number(progression.depression_level ?? 0);
  const anchor = getRecoveryAnchor(progression);
  const checkpoint = getRecoveryCheckpoint(progression);
  let interval = getEffectiveRecoveryIntervalSeconds(progression, now, skinRecoveryMult);
  if (prestigeRecoveryMult > 1) {
    interval = Math.max(1, Math.floor(interval / prestigeRecoveryMult));
  }
  const recoveryMultiplier = getEventRecoveryMultiplier(progression.event_state || {}, now);
  if (recoveryMultiplier > 1) {
    interval = Math.max(1, Math.floor(interval / recoveryMultiplier));
  }
  const secondsPassed = Math.max(0, Math.floor((now.getTime() - checkpoint.getTime()) / 1000));
  const productionAlert = applyProductionAlertDrain(progression.event_state || {}, maxEnergy, now);
  const energyAfterAlert = Math.max(0, energy - productionAlert.energyDrain);
  const nextEventState = {
    ...(progression.event_state || {}),
    randomEventState: productionAlert.randomEventState
  };

  const shouldRecoverEnergy = secondsPassed >= MIN_IDLE_THRESHOLD_SECONDS;
  const energyRecovered = shouldRecoverEnergy ? Math.floor(secondsPassed / interval) : 0;

  const passiveDepressionDecay = Math.floor(
    (secondsPassed / 3600) * DEPRESSION_PASSIVE_RECOVERY_PER_HOUR
  );

  if (energyRecovered <= 0) {
    const newDepression = passiveDepressionDecay > 0 && depression > 0
      ? Math.max(0, depression - passiveDepressionDecay)
      : depression;
    return persistIdleSideEffects(client, progression, {
      energy: energyAfterAlert,
      depression: newDepression,
      isBurnout: newDepression >= TAP_MECHANICS.maxDepression,
      burnoutAffliction: newDepression >= TAP_MECHANICS.afflictionDepression,
      eventState: nextEventState,
      shouldPersistDepression: newDepression !== depression
    });
  }

  const newEnergy = Math.min(maxEnergy, energyAfterAlert + energyRecovered);
  const actualRecovered = newEnergy - energyAfterAlert;

  if (actualRecovered <= 0) {
    const newDepression = passiveDepressionDecay > 0 && depression > 0
      ? Math.max(0, depression - passiveDepressionDecay)
      : depression;
    return persistIdleSideEffects(client, progression, {
      energy: energyAfterAlert,
      depression: newDepression,
      isBurnout: newDepression >= TAP_MECHANICS.maxDepression,
      burnoutAffliction: newDepression >= TAP_MECHANICS.afflictionDepression,
      eventState: nextEventState,
      shouldPersistDepression: newDepression !== depression
    });
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
  const burnoutAffliction = newDepression >= TAP_MECHANICS.afflictionDepression;
  const nextCheckpoint = new Date(checkpoint.getTime() + actualRecovered * interval * 1000);

  // Clear expired forced break
  const forcedBreakExpired = progression.forced_break_until && new Date(progression.forced_break_until) <= now;

  const result = await client.query(
    `UPDATE progression
     SET energy = $2,
          depression_level = $3,
          is_burnout = $4,
          burnout_affliction = $5,
          forced_break_until = CASE WHEN $6 THEN NULL ELSE forced_break_until END,
          energy_recovery_checkpoint_at = $7,
          event_state = $8
       WHERE user_id = $1
       RETURNING *`,
    [progression.user_id, newEnergy, newDepression, isBurnout, burnoutAffliction, forcedBreakExpired, nextCheckpoint, JSON.stringify(nextEventState)]
  );

  const idleRecovery = { energy: actualRecovered, secondsIdle: secondsPassed };

  return {
    ...(result.rows[0] || {
      ...progression,
      energy: newEnergy,
      depression_level: newDepression,
      is_burnout: isBurnout,
      burnout_affliction: burnoutAffliction,
      forced_break_until: forcedBreakExpired ? null : progression.forced_break_until,
      energy_recovery_checkpoint_at: nextCheckpoint
    }),
    _idleRecovery: idleRecovery
  };
}
