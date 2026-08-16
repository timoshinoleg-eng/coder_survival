export function getActiveRuntimeEvents(runtimeEventState = {}, nowMs = Date.now()) {
  return {
    hotStreakActive: Boolean(runtimeEventState.hotStreakUntil && new Date(runtimeEventState.hotStreakUntil).getTime() > nowMs),
    productionAlertActive: Boolean(runtimeEventState.productionAlertUntil && new Date(runtimeEventState.productionAlertUntil).getTime() > nowMs),
    legacyCodeActive: Number(runtimeEventState.legacyCodeClicksRemaining || 0) > 0,
    bugProductionActive: Number(runtimeEventState.bugProductionClicksRemaining || 0) > 0,
    coffeeStainActive: Number(runtimeEventState.coffeeStainClicksRemaining || 0) > 0,
    deployFridayActive: Number(runtimeEventState.deployFridayClicksRemaining || 0) > 0,
    goldenCommitActive: Boolean(runtimeEventState.goldenCommitUntil && new Date(runtimeEventState.goldenCommitUntil).getTime() > nowMs),
    stackOverflowDownActive: Boolean(runtimeEventState.stackOverflowDownUntil && new Date(runtimeEventState.stackOverflowDownUntil).getTime() > nowMs),
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

export function reduceClickForEvent(runtimeEventState = {}, eventType) {
  const next = { ...runtimeEventState };
  const keyMap = {
    legacy_code: 'legacyCodeClicksRemaining',
    bug_production: 'bugProductionClicksRemaining',
    coffee_stain: 'coffeeStainClicksRemaining',
    deploy_friday: 'deployFridayClicksRemaining',
  };
  const key = keyMap[eventType];
  if (key && next[key] && next[key] > 0) {
    next[key] = Math.max(0, next[key] - 1);
  }
  return next;
}

export function applyRandomEventChoice(type, action, currentState = {}, gameState = {}) {
  let nextState = { ...currentState };
  let nextDeltas = { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
  let handled = false;

  if (type === 'deploy_friday' && action === 'solve') {
    handled = true;
    nextState.deployFridayClicksRemaining = 3;
    nextDeltas = { energyDelta: 0, depressionDelta: -2, commitsDelta: 0 };
  } else if (type === 'deploy_friday' && action === 'ignore') {
    handled = true;
    const success = Math.random() < 0.7;
    nextDeltas = success
      ? { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 }
      : { energyDelta: 0, depressionDelta: 8, commitsDelta: Math.round(-(gameState.commits || 0) * 0.25) };
  } else if (type === 'legacy_code' && action === 'solve') {
    handled = true;
    nextState.legacyCodeClicksRemaining = 10;
    nextDeltas = { energyDelta: 0, depressionDelta: 4, commitsDelta: 0 };
  } else if (type === 'bug_production' && action === 'solve') {
    handled = true;
    nextState.bugProductionClicksRemaining = 5;
    nextDeltas = { energyDelta: 0, depressionDelta: 2, commitsDelta: 5 };
  } else if (type === 'bug_production' && action === 'ignore') {
    handled = true;
    nextState.productionAlertUntil = new Date(Date.now() + 180000).toISOString();
    nextDeltas = { energyDelta: 0, depressionDelta: 6, commitsDelta: 0 };
  } else if (type === 'coffee_stain' && action === 'solve') {
    handled = true;
    nextState.coffeeStainClicksRemaining = 3;
    nextDeltas = { energyDelta: 8, depressionDelta: -4, commitsDelta: 0 };
  } else if (type === 'golden_commit' && action === 'solve') {
    handled = true;
    nextState.goldenCommitUntil = new Date(Date.now() + 77000).toISOString();
    nextDeltas = { energyDelta: 0, depressionDelta: -4, commitsDelta: 40 };
  } else if (type === 'golden_commit' && action === 'ignore') {
    handled = true;
    nextDeltas = { energyDelta: 0, depressionDelta: 2, commitsDelta: 0 };
  } else if (type === 'code_review' && action === 'solve') {
    handled = true;
    nextDeltas = { energyDelta: 0, depressionDelta: 2, commitsDelta: 10 };
  } else if (type === 'code_review' && action === 'ignore') {
    handled = true;
    nextDeltas = { energyDelta: 0, depressionDelta: 4, commitsDelta: -5 };
  } else if (type === 'slack_huddle' && action === 'solve') {
    handled = true;
    nextDeltas = { energyDelta: 0, depressionDelta: 2, commitsDelta: 12 };
  } else if (type === 'slack_huddle' && action === 'ignore') {
    handled = true;
    nextDeltas = { energyDelta: 0, depressionDelta: -1, commitsDelta: -3 };
  } else if (type === 'open_source_contribution' && action === 'solve') {
    handled = true;
    nextDeltas = { energyDelta: 0, depressionDelta: 0, commitsDelta: 20 };
  } else if (type === 'open_source_contribution' && action === 'ignore') {
    handled = true;
    nextDeltas = { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
  } else if (type === 'stack_overflow_down') {
    handled = true;
    nextState.stackOverflowDownUntil = new Date(Date.now() + 30000).toISOString();
    nextDeltas = { energyDelta: 0, depressionDelta: 3, commitsDelta: 0 };
  }

  return handled ? { nextState, nextDeltas } : null;
}
