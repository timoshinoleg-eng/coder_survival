import { STAGE4 } from '../config/balance.js';
import { RANDOM_EVENTS_CONFIG } from '../config/events.js';

const { EVENTS } = STAGE4;

/**
 * Event System v1 — weekly hackathon.
 * Single active event at a time. Config-driven, no cron scheduler.
 */

export async function getActiveEvent(client) {
  const result = await client.query(
    `SELECT id, event_type, title, description, start_date, end_date, target_commits, reward_payload
     FROM events
     WHERE is_active = TRUE
       AND start_date <= CURRENT_DATE
       AND end_date >= CURRENT_DATE
     ORDER BY start_date DESC
     LIMIT 1`
  );
  return result.rows[0] || null;
}

export async function getEventContribution(client, userId, eventId) {
  const result = await client.query(
    `INSERT INTO event_contributions (user_id, event_id, commits_contributed)
     VALUES ($1, $2, 0)
     ON CONFLICT (user_id, event_id) DO NOTHING
     RETURNING *`,
    [userId, eventId]
  );
  if (result.rows.length > 0) return result.rows[0];

  const existing = await client.query(
    `SELECT * FROM event_contributions WHERE user_id = $1 AND event_id = $2`,
    [userId, eventId]
  );
  return existing.rows[0] || null;
}

export async function recordEventContribution(client, userId, commitsDelta) {
  const event = await getActiveEvent(client);
  if (!event) return null;

  const result = await client.query(
    `INSERT INTO event_contributions (user_id, event_id, commits_contributed)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, event_id) DO UPDATE SET
       commits_contributed = event_contributions.commits_contributed + $3,
       updated_at = NOW()
     RETURNING *`,
    [userId, event.id, commitsDelta]
  );

  return { event, contribution: result.rows[0] };
}

export async function claimEventReward(client, userId) {
  const event = await getActiveEvent(client);
  if (!event) {
    return { error: 'No active event', status: 404 };
  }

  const contribution = await getEventContribution(client, userId, event.id);
  if (!contribution || contribution.commits_contributed < event.target_commits) {
    return { error: 'Target not reached', status: 409 };
  }
  if (contribution.claimed) {
    return { error: 'Already claimed', status: 409 };
  }

  // Atomic, idempotent claim gate. The conditional UPDATE succeeds only for the
  // first caller; concurrent duplicate claims match 0 rows (already claimed), so
  // the reward is credited exactly once even under a race. The pre-checks above
  // stay for friendly error messages, but this UPDATE is the authoritative gate.
  const claimUpdate = await client.query(
    `UPDATE event_contributions SET claimed = TRUE, updated_at = NOW()
     WHERE user_id = $1 AND event_id = $2 AND claimed = FALSE`,
    [userId, event.id]
  );
  if (claimUpdate.rowCount === 0) {
    return { error: 'Already claimed', status: 409 };
  }

  // Audit on significant action (claim), not per-tap
  await client.query(
    `INSERT INTO audit_logs (user_id, action, context)
     VALUES ($1, 'event_claim', $2)`,
    [userId, JSON.stringify({ eventId: event.id, commitsContributed: contribution.commits_contributed })]
  );

  return {
    event,
    contribution: { ...contribution, claimed: true },
    status: 200
  };
}

export function getCurrentEvent(weekIndex) {
  const normalized = Math.max(0, Number(weekIndex || 0));
  return EVENTS.ROTATION[normalized % EVENTS.ROTATION.length] || null;
}

export function getLiveOpsWeekIndex(userDate = new Date()) {
  return Math.floor(userDate.getTime() / (EVENTS.EVENT_DURATION_DAYS * 86400000));
}

export function isEventActiveToday(event, userDate = new Date()) {
  if (!event) return false;
  if (event.activeDays) {
    return event.activeDays.includes(userDate.getDay());
  }
  return true;
}

export function applyEventModifiers(baseValue, modifiers, modifierType) {
  if (!modifiers) return baseValue;
  switch (modifierType) {
    case 'energyRecovery':
      return modifiers.energyRecoveryMult ? baseValue * modifiers.energyRecoveryMult : baseValue;
    case 'commits':
      return modifiers.commitMult ? baseValue * modifiers.commitMult : baseValue;
    case 'critChance':
      return modifiers.critChanceAdd ? baseValue + modifiers.critChanceAdd : baseValue;
    default:
      return baseValue;
  }
}

export function generateEventBonusQuest(event) {
  if (!event || !event.bonusQuest) return null;
  return {
    id: 'q_event_bonus',
    type: event.bonusQuest.type,
    target: event.bonusQuest.target,
    reward: event.bonusQuest.reward,
    eventId: event.id,
    isEvent: true,
    progress: 0,
    completed: false,
    claimed: false
  };
}

export function getEventRecoveryMultiplier(eventState = {}, now = new Date()) {
  const expiresAt = eventState.expiresAt ? new Date(eventState.expiresAt) : null;
  if (!eventState.eventId || !eventState.modifiersApplied || (expiresAt && expiresAt.getTime() <= now.getTime())) {
    return 1;
  }
  const multiplier = Number(eventState.modifiersApplied.energyRecoveryMult || 1);
  if (!Number.isFinite(multiplier) || multiplier < 0.1 || multiplier > 5) {
    return 1;
  }
  return multiplier;
}

export function getLocalDateFromOffset(timezoneOffset = 0, now = new Date()) {
  return new Date(now.getTime() + Number(timezoneOffset || 0) * 60000);
}

export function getRandomEventDefinitions({ includeBalanceBlocked = true } = {}) {
  return Object.entries(RANDOM_EVENTS_CONFIG.events)
    .filter(([, event]) => includeBalanceBlocked || event.requiresBalance !== true)
    .map(([id, event]) => ({ id, ...event }));
}

export function getFtueEventSuppression(accountAgeMinutes = 0) {
  const age = Math.max(0, Number(accountAgeMinutes || 0));
  return RANDOM_EVENTS_CONFIG.ftueEventSuppression.find((window) => age >= window.minMinutes && age < window.maxMinutes)
    || RANDOM_EVENTS_CONFIG.ftueEventSuppression[RANDOM_EVENTS_CONFIG.ftueEventSuppression.length - 1];
}

function applyFtueEventSuppression(events, accountAgeMinutes) {
  const suppression = getFtueEventSuppression(accountAgeMinutes);
  if (suppression.rule === 'no_negative_events') {
    return events.filter((event) => event.type !== 'negative');
  }
  if (suppression.rule === 'negative_events_at_50_percent_weight') {
    return events.map((event) => (
      event.type === 'negative'
        ? { ...event, weight: Number(event.weight || 0) * 0.5 }
        : event
    ));
  }
  return events;
}

export function getRandomEventWeightSummary({ includeBalanceBlocked = true } = {}) {
  const summary = { negative: 0, neutral: 0, positive: 0 };
  for (const event of getRandomEventDefinitions({ includeBalanceBlocked })) {
    summary[event.type] = Number(summary[event.type] || 0) + Number(event.weight || 0);
  }
  return summary;
}

export function getRandomEventBalanceGaps() {
  const configured = getRandomEventWeightSummary();
  const gaps = [];

  for (const [type, targetWeight] of Object.entries(RANDOM_EVENTS_CONFIG.targetWeightByType)) {
    const configuredWeight = Number(configured[type] || 0);
    if (configuredWeight !== targetWeight) {
      gaps.push({ type, targetWeight, configuredWeight, missingWeight: targetWeight - configuredWeight });
    }
  }

  for (const event of getRandomEventDefinitions()) {
    if (event.requiresBalance) {
      gaps.push({ eventId: event.id, tbdBalance: event.tbdBalance || [] });
    }
  }

  return gaps;
}

export function pickRandomEvent(randomValue = Math.random(), options = {}) {
  const definitions = getRandomEventDefinitions({ includeBalanceBlocked: options.includeBalanceBlocked === true });
  const events = applyFtueEventSuppression(definitions, options.accountAgeMinutes ?? 61);
  const totalWeight = events.reduce((sum, event) => sum + Number(event.weight || 0), 0);
  if (totalWeight <= 0) return null;

  const clampedRandom = Math.max(0, Math.min(0.999999, Number(randomValue) || 0));
  let cursor = clampedRandom * totalWeight;

  for (const event of events) {
    cursor -= Number(event.weight || 0);
    if (cursor < 0) return event;
  }

  return events[events.length - 1] || null;
}
