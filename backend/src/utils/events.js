import { STAGE4 } from '../config/balance.js';

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

  await client.query(
    `UPDATE event_contributions SET claimed = TRUE, updated_at = NOW()
     WHERE user_id = $1 AND event_id = $2`,
    [userId, event.id]
  );

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
