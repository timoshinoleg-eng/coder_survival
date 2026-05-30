function toValidDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getRandomEventState(eventState = {}) {
  return eventState.randomEventState || {};
}

export function applyRandomEventChoiceState(currentState = {}, type, action, now = new Date()) {
  const next = { ...currentState };
  if (type === 'legacy_code' && action === 'solve') {
    next.legacyCodeClicksRemaining = 10;
    next.legacyCodeStartedAt = now.toISOString();
  }
  if (type === 'production_alert' && action === 'ignore') {
    next.productionAlertUntil = new Date(now.getTime() + 180000).toISOString();
    next.productionAlertLastAppliedAt = now.toISOString();
  }
  if (type === 'hot_streak' && action === 'solve') {
    next.hotStreakUntil = new Date(now.getTime() + 60000).toISOString();
  }
  if (type === 'deploy_friday' && action === 'solve') {
    next.deployFridayResolvedAt = now.toISOString();
  }
  return next;
}

export function applyTapToRandomEventState(currentState = {}) {
  if (!currentState.legacyCodeClicksRemaining || currentState.legacyCodeClicksRemaining <= 0) {
    return currentState;
  }
  return {
    ...currentState,
    legacyCodeClicksRemaining: Math.max(0, currentState.legacyCodeClicksRemaining - 1),
  };
}

export const reduceLegacyCodeClick = applyTapToRandomEventState;

export function getGeneratorCostMultiplierFromEventState(eventState = {}, now = new Date()) {
  const randomState = getRandomEventState(eventState);
  return Number(randomState.legacyCodeClicksRemaining || 0) > 0 ? 2 : 1;
}

export function getRandomEventTapMultiplier(eventState = {}, now = new Date()) {
  const randomState = getRandomEventState(eventState);
  return isRuntimeEventActive(randomState.hotStreakUntil, now) ? 3 : 1;
}

export function applyProductionAlertDrain(eventState = {}, maxEnergy = 100, now = new Date()) {
  const randomState = getRandomEventState(eventState);
  if (!isRuntimeEventActive(randomState.productionAlertUntil, now)) {
    return { energyDrain: 0, randomEventState: randomState };
  }
  const lastAppliedAt = toValidDate(randomState.productionAlertLastAppliedAt) || now;
  const until = toValidDate(randomState.productionAlertUntil);
  const effectiveNow = until && until.getTime() < now.getTime() ? until : now;
  const elapsedSeconds = Math.max(0, Math.floor((effectiveNow.getTime() - lastAppliedAt.getTime()) / 1000));
  const ticks = Math.floor(elapsedSeconds / 60);
  if (ticks <= 0) {
    return { energyDrain: 0, randomEventState: randomState };
  }
  return {
    energyDrain: Math.floor(maxEnergy * 0.08 * ticks),
    randomEventState: {
      ...randomState,
      productionAlertLastAppliedAt: new Date(lastAppliedAt.getTime() + ticks * 60000).toISOString(),
    }
  };
}

export function isRuntimeEventActive(value, now = new Date()) {
  const date = toValidDate(value);
  return Boolean(date && date.getTime() > now.getTime());
}
