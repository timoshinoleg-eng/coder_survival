import { RANDOM_EVENTS_CONFIG } from '../config/events.js';
import { DEFAULTS } from '../config/balance.js';
import { pickRandomEvent, getFtueEventSuppression } from './events.js';
import { getRandomEventState, applyRandomEventChoiceState, applyTapToRandomEventState } from './randomEventState.js';

const CHOICE_TIMEOUT_SECONDS_BY_TYPE = {
  deploy_friday: 30,
  legacy_code: 20,
  production_alert: 15,
  code_review_reject: 15,
  hot_streak: 15,
  golden_commit: 15,
  coffee_break: 15,
  standup_meeting: 15,
  slack_notification: 15,
  zoom_call: 15,
};

const EVENT_UI_META = {
  golden_commit: {
    title: 'GOLDEN COMMIT',
    description: 'Редкий чистый коммит. На секунду кажется, что кодовая база тебя любит.',
    solveLabel: 'ПОЙМАТЬ',
    ignoreLabel: 'ПРОПУСТИТЬ',
  },
  hot_streak: {
    title: 'HOT STREAK',
    description: 'Поток пошёл. 60 секунд ты чувствуешь себя машиной доставки фич.',
    solveLabel: 'ВКАТИТЬСЯ',
    ignoreLabel: 'ОСТОРОЖНО',
  },
  legacy_code: {
    title: 'LEGACY CODE',
    description: 'Апгрейды дорожают x2, пока ты не выжжешь 10 кликов на рефакторинг.',
    solveLabel: 'РЕФАКТОРИТЬ',
    ignoreLabel: 'ТЕРПЕТЬ',
  },
  deploy_friday: {
    title: 'DEPLOY FRIDAY',
    description: 'Нажмёшь deploy? 70% шанс славы, 30% шанс потерять 25% LOC.',
    solveLabel: 'ДЕПЛОЙ',
    ignoreLabel: 'ОТЛОЖИТЬ',
  },
  code_review_reject: {
    title: 'CODE REVIEW REJECT',
    description: 'Тебе вернули PR. Опять.',
    solveLabel: 'ПЕРЕДЕЛАТЬ',
    ignoreLabel: 'ОБИДЕТЬСЯ',
  },
  production_alert: {
    title: 'PRODUCTION ALERT',
    description: 'Пейджер орёт ещё 3 минуты. Энергия будет утекать, пока не погасишь тревогу.',
    solveLabel: 'ПОГАСИТЬ',
    ignoreLabel: 'ИГНОР',
  },
  coffee_break: {
    title: 'COFFEE BREAK',
    description: 'Пять минут на то, чтобы вспомнить, зачем ты вообще любишь код.',
    solveLabel: 'ГЛОТОК',
    ignoreLabel: 'ПРОДОЛЖИТЬ',
  },
  standup_meeting: {
    title: 'STANDUP',
    description: 'Короткий созвон, длинное ощущение потерянного времени.',
    solveLabel: 'ВЫСТОЯТЬ',
    ignoreLabel: 'МУТ',
  },
  slack_notification: {
    title: 'SLACK PING',
    description: 'Кто-то написал «быстрый вопрос». Это никогда не бывает быстрым.',
    solveLabel: 'ОТВЕТИТЬ',
    ignoreLabel: 'ПОЗЖЕ',
  },
  zoom_call: {
    title: 'ZOOM CALL',
    description: 'Камера выключена, душа тоже.',
    solveLabel: 'ЗАЙТИ',
    ignoreLabel: 'ОТГОВОРКА',
  },
};

function generateEventId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getChoiceTimeoutSeconds(eventType) {
  return CHOICE_TIMEOUT_SECONDS_BY_TYPE[eventType] || 15;
}

function nowPlusSeconds(seconds) {
  return new Date(Date.now() + seconds * 1000);
}

export async function expireRandomEvents(client) {
  const result = await client.query(
    `UPDATE active_random_events
     SET resolved_at = COALESCE(resolved_at, NOW()),
         resolution = COALESCE(resolution, 'timeout')
     WHERE resolved_at IS NULL
       AND expires_at < NOW()
     RETURNING *`
  );
  return result.rows;
}

export async function getUserActiveRandomEvent(client, userId) {
  await expireRandomEvents(client);
  const result = await client.query(
    `SELECT * FROM active_random_events
     WHERE user_id = $1 AND resolved_at IS NULL
     ORDER BY started_at DESC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function shouldSpawnRandomEvent(client, userId) {
  const result = await client.query(
    `SELECT last_random_event_spawn_at FROM progression WHERE user_id = $1`,
    [userId]
  );
  const lastSpawn = result.rows[0]?.last_random_event_spawn_at;
  if (!lastSpawn) return true;

  const elapsedMs = Date.now() - new Date(lastSpawn).getTime();
  const { min, max } = RANDOM_EVENTS_CONFIG.frequencySeconds;
  const requiredMs = (min + Math.random() * (max - min)) * 1000;
  return elapsedMs >= requiredMs;
}

export async function spawnRandomEvent(client, userId, accountAgeMinutes = 61) {
  const canSpawn = await shouldSpawnRandomEvent(client, userId);
  if (!canSpawn) return null;

  const hasActive = await getUserActiveRandomEvent(client, userId);
  if (hasActive) return null;

  const picked = pickRandomEvent(Math.random(), { accountAgeMinutes });
  if (!picked) return null;

  const eventId = generateEventId();
  const expiresAt = nowPlusSeconds(getChoiceTimeoutSeconds(picked.id));

  await client.query(
    `INSERT INTO active_random_events (user_id, event_type, event_id, started_at, expires_at, state)
     VALUES ($1, $2, $3, NOW(), $4, $5)
     ON CONFLICT (user_id, event_id) DO NOTHING`,
    [userId, picked.id, eventId, expiresAt, JSON.stringify({})]
  );

  await client.query(
    `UPDATE progression SET last_random_event_spawn_at = NOW() WHERE user_id = $1`,
    [userId]
  );

  return {
    eventId,
    type: picked.id,
    kind: picked.type,
    title: EVENT_UI_META[picked.id]?.title || picked.id,
    description: EVENT_UI_META[picked.id]?.description || '',
    options: {
      solve: { label: EVENT_UI_META[picked.id]?.solveLabel || 'РЕШИТЬ' },
      ignore: { label: EVENT_UI_META[picked.id]?.ignoreLabel || 'ИГНОР' },
    },
    timeout: getChoiceTimeoutSeconds(picked.id),
    startedAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

export function calculateEventDeltas(type, action, gameState = {}) {
  const commitsTotal = gameState.commitsTotal || gameState.commits || 0;

  switch (type) {
    case 'golden_commit': {
      if (action === 'solve') return { energyDelta: 0, depressionDelta: -4, commitsDelta: 40 };
      return { energyDelta: 0, depressionDelta: 2, commitsDelta: 0 };
    }
    case 'hot_streak': {
      if (action === 'solve') return { energyDelta: 0, depressionDelta: -3, commitsDelta: 25 };
      return { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
    }
    case 'legacy_code': {
      if (action === 'solve') return { energyDelta: 0, depressionDelta: 4, commitsDelta: 0 };
      if (action === 'ignore') return { energyDelta: 0, depressionDelta: 8, commitsDelta: -10 };
      if (action === 'tap') return { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
      return { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
    }
    case 'deploy_friday': {
      if (action === 'solve') {
        const success = Math.random() < DEFAULTS.RANDOM_EVENTS.stateMachine.deployFriday.successChance;
        return success
          ? { energyDelta: 0, depressionDelta: -4, commitsDelta: 0 }
          : { energyDelta: 0, depressionDelta: 8, commitsDelta: Math.round(-commitsTotal * DEFAULTS.RANDOM_EVENTS.stateMachine.deployFriday.failLocLoss) };
      }
      return { energyDelta: 0, depressionDelta: -2, commitsDelta: 0 };
    }
    case 'code_review_reject': {
      if (action === 'solve') return { energyDelta: 0, depressionDelta: 4, commitsDelta: 10 };
      return { energyDelta: 0, depressionDelta: 8, commitsDelta: -5 };
    }
    case 'production_alert': {
      if (action === 'solve') return { energyDelta: 0, depressionDelta: 2, commitsDelta: 5 };
      return { energyDelta: 0, depressionDelta: 6, commitsDelta: 0 };
    }
    case 'coffee_break': {
      if (action === 'solve') return { energyDelta: 8, depressionDelta: -4, commitsDelta: 0 };
      return { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
    }
    case 'standup_meeting': {
      if (action === 'solve') return { energyDelta: -2, depressionDelta: 0, commitsDelta: 0 };
      return { energyDelta: 0, depressionDelta: 1, commitsDelta: 0 };
    }
    case 'slack_notification': {
      if (action === 'solve') return { energyDelta: -1, depressionDelta: 1, commitsDelta: 0 };
      return { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
    }
    case 'zoom_call': {
      if (action === 'solve') return { energyDelta: -2, depressionDelta: 0, commitsDelta: 0 };
      return { energyDelta: 0, depressionDelta: 1, commitsDelta: 0 };
    }
    default:
      return { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
  }
}

export async function resolveRandomEvent(client, userId, eventId, action, gameState = {}) {
  const result = await client.query(
    `SELECT * FROM active_random_events
     WHERE user_id = $1 AND event_id = $2 AND resolved_at IS NULL
     FOR UPDATE`,
    [userId, eventId]
  );
  const row = result.rows[0];
  if (!row) {
    return { error: 'Event not found or already resolved', status: 404 };
  }

  const type = row.event_type;
  const eventState = row.state || {};
  const now = new Date();

  let nextEventState = { ...eventState };
  let nextDeltas = calculateEventDeltas(type, action, gameState);

  if (type === 'legacy_code' && action === 'solve') {
    nextEventState = applyRandomEventChoiceState(eventState, type, action, now);
  } else if (type === 'production_alert' && action === 'ignore') {
    nextEventState = applyRandomEventChoiceState(eventState, type, action, now);
  } else if (type === 'hot_streak' && action === 'solve') {
    nextEventState = applyRandomEventChoiceState(eventState, type, action, now);
  } else if (type === 'deploy_friday' && action === 'solve') {
    nextEventState = applyRandomEventChoiceState(eventState, type, action, now);
  } else if (type === 'legacy_code' && action === 'tap') {
    nextEventState = applyTapToRandomEventState(eventState);
    nextDeltas = { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
    const clicksLeft = nextEventState.legacyCodeClicksRemaining || 0;
    if (clicksLeft <= 0) {
      await client.query(
        `UPDATE active_random_events
         SET resolved_at = NOW(), resolution = $3, state = $4, deltas = $5
         WHERE user_id = $1 AND event_id = $2`,
        [userId, eventId, action, JSON.stringify(nextEventState), JSON.stringify(nextDeltas)]
      );
      await syncRandomEventStateToProgression(client, userId, nextEventState);
      return { success: true, resolved: true, nextState: nextEventState, deltas: nextDeltas };
    }
    await client.query(
      `UPDATE active_random_events
       SET state = $3
       WHERE user_id = $1 AND event_id = $2`,
      [userId, eventId, JSON.stringify(nextEventState)]
    );
    await syncRandomEventStateToProgression(client, userId, nextEventState);
    return { success: true, resolved: false, nextState: nextEventState, deltas: nextDeltas };
  }

  await client.query(
    `UPDATE active_random_events
     SET resolved_at = NOW(), resolution = $3, state = $4, deltas = $5
     WHERE user_id = $1 AND event_id = $2`,
    [userId, eventId, action, JSON.stringify(nextEventState), JSON.stringify(nextDeltas)]
  );

  await syncRandomEventStateToProgression(client, userId, nextEventState);

  return { success: true, resolved: true, nextState: nextEventState, deltas: nextDeltas };
}

export async function syncRandomEventStateToProgression(client, userId, randomEventState) {
  const progResult = await client.query(
    `SELECT event_state FROM progression WHERE user_id = $1`,
    [userId]
  );
  const eventState = progResult.rows[0]?.event_state || {};
  const nextEventState = {
    ...eventState,
    randomEventState
  };
  await client.query(
    `UPDATE progression SET event_state = $2 WHERE user_id = $1`,
    [userId, JSON.stringify(nextEventState)]
  );
}

export function buildActiveEventPayload(row) {
  if (!row) return null;
  const meta = EVENT_UI_META[row.event_type] || {};
  return {
    eventId: row.event_id,
    type: row.event_type,
    kind: row.kind || 'neutral',
    title: meta.title || row.event_type,
    description: meta.description || '',
    options: {
      solve: { label: meta.solveLabel || 'РЕШИТЬ' },
      ignore: { label: meta.ignoreLabel || 'ИГНОР' },
    },
    timeout: Math.max(0, Math.ceil((new Date(row.expires_at).getTime() - Date.now()) / 1000)),
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    state: row.state || {},
  };
}
