export function getActiveRuntimeEvents(runtimeEventState = {}, nowMs = Date.now()) {
  return {
    hotStreakActive: Boolean(runtimeEventState.hotStreakUntil && new Date(runtimeEventState.hotStreakUntil).getTime() > nowMs),
    productionAlertActive: Boolean(runtimeEventState.productionAlertUntil && new Date(runtimeEventState.productionAlertUntil).getTime() > nowMs),
    legacyCodeActive: Number(runtimeEventState.legacyCodeClicksRemaining || 0) > 0,
  };
}

export function reduceLegacyCodeClick(runtimeEventState = {}) {
  if (!runtimeEventState.legacyCodeClicksRemaining || runtimeEventState.legacyCodeClicksRemaining <= 0) {
    return runtimeEventState;
  }
  return {
    ...runtimeEventState,
    legacyCodeClicksRemaining: Math.max(0, runtimeEventState.legacyCodeClicksRemaining - 1),
  };
}

export function applyRandomEventChoice(type, action, currentState = {}, gameState = {}) {
  let nextState = { ...currentState };
  let nextDeltas = { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
  let handled = false;

  if (type === 'deploy_friday' && action === 'solve') {
    handled = true;
    const success = Math.random() < 0.7;
    nextDeltas = success
      ? { energyDelta: 0, depressionDelta: -4, commitsDelta: 0 }
      : { energyDelta: 0, depressionDelta: 8, commitsDelta: Math.round(-(gameState.commits || 0) * 0.25) };
  } else if (type === 'legacy_code' && action === 'solve') {
    handled = true;
    nextState.legacyCodeClicksRemaining = 10;
    nextDeltas = { energyDelta: 0, depressionDelta: 4, commitsDelta: 0 };
  } else if (type === 'production_alert' && action === 'ignore') {
    handled = true;
    nextState.productionAlertUntil = new Date(Date.now() + 180000).toISOString();
    nextDeltas = { energyDelta: 0, depressionDelta: 6, commitsDelta: 0 };
  } else if (type === 'hot_streak' && action === 'solve') {
    handled = true;
    nextState.hotStreakUntil = new Date(Date.now() + 60000).toISOString();
    nextDeltas = { energyDelta: 0, depressionDelta: -3, commitsDelta: 25 };
  }

  return handled ? { nextState, nextDeltas } : null;
}
