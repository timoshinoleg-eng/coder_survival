import { STAGE3 } from '../config/balance.js';

const { DAILY_BATTLE } = STAGE3;

export function getActiveBattles(battleState) {
  return Array.isArray(battleState?.active) ? battleState.active : [];
}

export function canChallenge(battleState, opponentId, challengerId = null) {
  const active = getActiveBattles(battleState);
  const now = Date.now();
  const recent = active.filter((battle) => {
    const samePair =
      battle.opponentId === opponentId ||
      battle.challengerId === opponentId ||
      (challengerId && (
        battle.opponentId === challengerId ||
        battle.challengerId === challengerId
      ));
    return samePair &&
      battle.status === DAILY_BATTLE.STATUSES.PENDING &&
      (now - new Date(battle.createdAt).getTime()) < DAILY_BATTLE.COOLDOWN_HOURS * 3600000;
  });
  return recent.length === 0;
}

export function createBattle(challengerId, opponentId, stake, challengerCommits, opponentCommits, now = new Date()) {
  const safeStake = Number(stake);
  if (!Number.isInteger(safeStake) || safeStake < 1 || safeStake > DAILY_BATTLE.MAX_STAKE) {
    throw new Error('Invalid stake');
  }
  if (String(challengerId) === String(opponentId)) {
    throw new Error('Self challenge is not allowed');
  }

  return {
    id: `${challengerId}:${opponentId}:${now.getTime()}`,
    challengerId,
    opponentId,
    stake: safeStake,
    escrow: safeStake * 2,
    status: DAILY_BATTLE.STATUSES.PENDING,
    createdAt: now.toISOString(),
    acceptedAt: null,
    expiresAt: new Date(now.getTime() + DAILY_BATTLE.DURATION_HOURS * 3600000).toISOString(),
    resolvedAt: null,
    challengerStartCommits: Number(challengerCommits || 0),
    opponentStartCommits: Number(opponentCommits || 0),
    winnerId: null
  };
}

export function acceptBattle(battle, challengerCommits = battle.challengerStartCommits, opponentCommits = battle.opponentStartCommits, now = new Date()) {
  if (new Date(battle.expiresAt).getTime() <= now.getTime()) {
    return { ...battle, status: DAILY_BATTLE.STATUSES.EXPIRED, resolvedAt: now.toISOString() };
  }

  return {
    ...battle,
    status: DAILY_BATTLE.STATUSES.ACTIVE,
    acceptedAt: now.toISOString(),
    challengerStartCommits: Number(challengerCommits || 0),
    opponentStartCommits: Number(opponentCommits || 0)
  };
}

export function resolveBattle(battle, challengerCurrentCommits, opponentCurrentCommits, now = new Date()) {
  const challengerDelta = Number(challengerCurrentCommits || 0) - Number(battle.challengerStartCommits || 0);
  const opponentDelta = Number(opponentCurrentCommits || 0) - Number(battle.opponentStartCommits || 0);

  let winnerId = null;
  if (challengerDelta > opponentDelta) winnerId = battle.challengerId;
  else if (opponentDelta > challengerDelta) winnerId = battle.opponentId;

  return {
    ...battle,
    status: DAILY_BATTLE.STATUSES.COMPLETED,
    resolvedAt: now.toISOString(),
    winnerId,
    challengerDelta,
    opponentDelta
  };
}

export function upsertBattleInState(battleState, battle) {
  const active = getActiveBattles(battleState);
  const nextActive = active.filter((item) => item.id !== battle.id);
  if ([DAILY_BATTLE.STATUSES.PENDING, DAILY_BATTLE.STATUSES.ACTIVE].includes(battle.status)) {
    nextActive.push(battle);
  }
  const history = Array.isArray(battleState?.history) ? battleState.history : [];
  const nextHistory = [DAILY_BATTLE.STATUSES.COMPLETED, DAILY_BATTLE.STATUSES.EXPIRED].includes(battle.status)
    ? [battle, ...history.filter((item) => item.id !== battle.id)].slice(0, 10)
    : history;
  return { ...(battleState || {}), active: nextActive, history: nextHistory };
}
