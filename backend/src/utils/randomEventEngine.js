import { RANDOM_EVENTS_CONFIG } from '../config/events.js';
import { DEFAULTS } from '../config/balance.js';
import { pickRandomEvent, getFtueEventSuppression } from './events.js';
import { getRandomEventState, applyRandomEventChoiceState, applyTapToRandomEventState } from './randomEventState.js';

const CHOICE_TIMEOUT_SECONDS_BY_TYPE = {
  bug_production: 15,
  code_review: 15,
  slack_huddle: 15,
  scope_creep: 15,
  merge_conflict: 15,
  canary_rollback: 15,
  production_500_spike: 15,
  ci_pipeline_red: 15,
  friday_release_outage: 15,
  slack_thread_storm: 15,
  stack_overflow_down: 30,
  legacy_code: 20,
  coffee_stain: 15,
  golden_commit: 13,
  green_build: 15,
  deploy_friday: 30,
  open_source_contribution: 15,
};

const EVENT_UI_META = {
  golden_commit: {
    title: 'GOLDEN COMMIT',
    description: 'Редкий чистый коммит. На секунду кажется, что кодовая база тебя любит. x7 LOC/s на 77 секунд!',
    solveLabel: 'ПОЙМАТЬ',
    ignoreLabel: 'ПРОПУСТИТЬ',
  },
  open_source_contribution: {
    title: 'OPEN SOURCE PR',
    description: 'Кто-то принял твой PR! В награду — эксклюзивный скин и +20 коммитов.',
    solveLabel: 'ПРИНЯТЬ',
    ignoreLabel: 'ОТКЛОНИТЬ',
  },
  green_build: {
    title: 'GREEN BUILD',
    description: 'CI зелёный с первого запуска. Никто не понимает почему, поэтому лучше принять победу, пока она не исчезла.',
    solveLabel: 'МЕРЖИТЬ',
    ignoreLabel: 'СОХРАНИТЬ ЛОГ',
  },
  legacy_code: {
    title: 'LEGACY CODE',
    description: 'Апгрейды дорожают x2, пока ты не выжжешь 10 кликов на рефакторинг.',
    solveLabel: 'РЕФАКТОРИТЬ',
    ignoreLabel: 'ТЕРПЕТЬ',
  },
  deploy_friday: {
    title: 'DEPLOY FRIDAY',
    description: 'Нажмёшь deploy? Отмени за 3 клика или рискуй потерять 25% LOC.',
    solveLabel: 'ОТМЕНИТЬ',
    ignoreLabel: 'ДЕПЛОЙ',
  },
  bug_production: {
    title: 'BUG IN PRODUCTION',
    description: 'Пейджер орёт! Погаси баг за 5 кликов, или энергия будет утекать.',
    solveLabel: 'ХОТФИКС',
    ignoreLabel: 'ИГНОР',
  },
  code_review: {
    title: 'CODE REVIEW',
    description: 'Тебе пришёл PR на ревью. Принять с небольшим стрессом или отклонить?',
    solveLabel: 'ПРИНЯТЬ',
    ignoreLabel: 'ОТКЛОНИТЬ',
  },
  slack_huddle: {
    title: 'SLACK HUDDLE',
    description: 'Коллега зовёт на «быстрый созвон на две минуты». Войти за контекст или остаться в фокусе?',
    solveLabel: 'ЗАЙТИ',
    ignoreLabel: 'ТИХО ОТКЛОНИТЬ',
  },
  scope_creep: {
    title: 'SCOPE CREEP',
    description: 'Менеджер просит «крошечную правку». В Figma уже 14 новых экранов. Берёшь в спринт или защищаешь фокус?',
    solveLabel: 'ВЗЯТЬ В СПРИНТ',
    ignoreLabel: 'ЗАЩИТИТЬ ФОКУС',
  },
  coffee_stain: {
    title: 'COFFEE STAIN',
    description: 'Кофе разлилось на клавиатуру. Вытереть за 3 клика и получить энергию?',
    solveLabel: 'ВЫТЕРЕТЬ',
    ignoreLabel: 'ОСТАВИТЬ',
  },
  merge_conflict: {
    title: 'MERGE CONFLICT',
    description: 'Git говорит, что оба правы. Ты знаешь, что это дипломатическая формулировка для «удачи».',
    solveLabel: 'РАЗРУЛИТЬ',
    ignoreLabel: 'ПОТОМ',
  },
  canary_rollback: {
    title: 'CANARY ROLLBACK',
    description: 'Канарейка запела HTTP 500. Откатить релиз сейчас или подождать, пока метрики «успокоятся сами»?',
    solveLabel: 'ОТКАТИТЬ',
    ignoreLabel: 'ЕЩЁ МИНУТКУ',
  },
  production_500_spike: {
    title: 'HTTP 500 SPIKE',
    description: 'График ошибок пошёл вверх. Можно выключить фичу флагом или обновлять Grafana до просветления.',
    solveLabel: 'ВЫКЛЮЧИТЬ ФЛАГ',
    ignoreLabel: 'ОБНОВИТЬ GRAFANA',
  },
  ci_pipeline_red: {
    title: 'CI PIPELINE RED',
    description: 'Pipeline упал в тесте, который «точно не связан с твоим PR». Перезапустить с логами или нажать Re-run и смотреть в стену?',
    solveLabel: 'ЧИТАТЬ ЛОГИ',
    ignoreLabel: 'RE-RUN И НАДЕЯТЬСЯ',
  },
  slack_thread_storm: {
    title: 'SLACK THREAD STORM',
    description: 'В одном треде 47 сообщений и семь «есть апдейт?». Написать статус или тихо выключить нотификации?',
    solveLabel: 'НАПИСАТЬ СТАТУС',
    ignoreLabel: 'MUTE НА 5 МИНУТ',
  },
  friday_release_outage: {
    title: 'FRIDAY RELEASE OUTAGE',
    description: 'В 18:57 прод упал. SRE уже пишет «кто последний деплоил?». Откатить релиз или сообщить, что локально всё работает?',
    solveLabel: 'ОТКАТИТЬ РЕЛИЗ',
    ignoreLabel: 'ЛОКАЛЬНО РАБОТАЕТ',
  },
  stack_overflow_down: {
    title: 'STACK OVERFLOW DOWN',
    description: 'Stack Overflow недоступен 30 секунд. Пора полагаться только на себя.',
    solveLabel: null,
    ignoreLabel: null,
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

function getRemainingClicks(state, type) {
  if (type === 'legacy_code') return state.legacyCodeClicksRemaining || 0;
  if (type === 'bug_production') return state.bugProductionClicksRemaining || 0;
  if (type === 'coffee_stain') return state.coffeeStainClicksRemaining || 0;
  if (type === 'deploy_friday') return state.deployFridayClicksRemaining || 0;
  return 0;
}

export async function expireRandomEvents(client) {
  const result = await client.query(
    `UPDATE user_active_events
     SET resolved = TRUE,
         resolved_at = COALESCE(resolved_at, NOW()),
         resolution = COALESCE(resolution, 'timeout')
     WHERE resolved = FALSE
       AND expires_at < NOW()
     RETURNING *`
  );
  return result.rows;
}

export async function getUserActiveRandomEvent(client, userId) {
  await expireRandomEvents(client);
  const result = await client.query(
    `SELECT * FROM user_active_events
     WHERE user_id = $1 AND resolved = FALSE
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
    `INSERT INTO user_active_events (user_id, event_slug, event_id, started_at, expires_at, state)
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
      solve: EVENT_UI_META[picked.id]?.solveLabel ? { label: EVENT_UI_META[picked.id].solveLabel } : null,
      ignore: EVENT_UI_META[picked.id]?.ignoreLabel ? { label: EVENT_UI_META[picked.id].ignoreLabel } : null,
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
    case 'open_source_contribution': {
      if (action === 'solve') return { energyDelta: 0, depressionDelta: 0, commitsDelta: 20 };
      return { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
    }
    case 'green_build': {
      if (action === 'solve') return { energyDelta: 0, depressionDelta: -3, commitsDelta: 15 };
      return { energyDelta: 0, depressionDelta: 0, commitsDelta: 4 };
    }
    case 'legacy_code': {
      if (action === 'solve') return { energyDelta: 0, depressionDelta: 4, commitsDelta: 0 };
      if (action === 'ignore') return { energyDelta: 0, depressionDelta: 8, commitsDelta: -10 };
      if (action === 'tap') return { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
      return { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
    }
    case 'deploy_friday': {
      if (action === 'solve') return { energyDelta: 0, depressionDelta: -2, commitsDelta: 0 };
      if (action === 'ignore') {
        const success = Math.random() < 0.7;
        return success
          ? { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 }
          : { energyDelta: 0, depressionDelta: 8, commitsDelta: Math.round(-commitsTotal * 0.25) };
      }
      if (action === 'tap') return { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
      return { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
    }
    case 'bug_production': {
      if (action === 'solve') return { energyDelta: 0, depressionDelta: 2, commitsDelta: 5 };
      if (action === 'ignore') return { energyDelta: 0, depressionDelta: 6, commitsDelta: 0 };
      if (action === 'tap') return { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
      return { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
    }
    case 'code_review': {
      if (action === 'solve') return { energyDelta: 0, depressionDelta: 2, commitsDelta: 10 };
      return { energyDelta: 0, depressionDelta: 4, commitsDelta: -5 };
    }
    case 'slack_huddle': {
      if (action === 'solve') return { energyDelta: 0, depressionDelta: 2, commitsDelta: 12 };
      return { energyDelta: 0, depressionDelta: -1, commitsDelta: -3 };
    }
    case 'scope_creep': {
      if (action === 'solve') return { energyDelta: 0, depressionDelta: 3, commitsDelta: 8 };
      return { energyDelta: 0, depressionDelta: -1, commitsDelta: -2 };
    }
    case 'merge_conflict': {
      if (action === 'solve') return { energyDelta: 0, depressionDelta: 3, commitsDelta: 5 };
      return { energyDelta: 0, depressionDelta: 5, commitsDelta: -12 };
    }
    case 'ci_pipeline_red': {
      if (action === 'solve') return { energyDelta: 0, depressionDelta: 1, commitsDelta: -1 };
      return { energyDelta: 0, depressionDelta: 5, commitsDelta: -6 };
    }
    case 'slack_thread_storm': {
      if (action === 'solve') return { energyDelta: 0, depressionDelta: 1, commitsDelta: 4 };
      return { energyDelta: 0, depressionDelta: 3, commitsDelta: -3 };
    }
    case 'friday_release_outage': {
      if (action === 'solve') return { energyDelta: 0, depressionDelta: 2, commitsDelta: -3 };
      return { energyDelta: 0, depressionDelta: 7, commitsDelta: -10 };
    }
    case 'canary_rollback': {
      if (action === 'solve') return { energyDelta: 0, depressionDelta: 1, commitsDelta: -2 };
      return { energyDelta: 0, depressionDelta: 5, commitsDelta: -8 };
    }
    case 'production_500_spike': {
      if (action === 'solve') return { energyDelta: 0, depressionDelta: 2, commitsDelta: 4 };
      return { energyDelta: 0, depressionDelta: 6, commitsDelta: -5 };
    }
    case 'coffee_stain': {
      if (action === 'solve') return { energyDelta: 8, depressionDelta: -4, commitsDelta: 0 };
      if (action === 'tap') return { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
      return { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
    }
    case 'stack_overflow_down': {
      return { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
    }
    default:
      return { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
  }
}

export async function resolveRandomEvent(client, userId, eventId, action, gameState = {}) {
  const result = await client.query(
    `SELECT * FROM user_active_events
     WHERE user_id = $1 AND event_id = $2 AND resolved = FALSE
     FOR UPDATE`,
    [userId, eventId]
  );
  const row = result.rows[0];
  if (!row) {
    return { error: 'Event not found or already resolved', status: 404 };
  }

  const type = row.event_slug;
  const eventState = row.state || {};
  const now = new Date();

  let nextEventState = { ...eventState };
  let nextDeltas = calculateEventDeltas(type, action, gameState);

  const clickEvents = ['legacy_code', 'bug_production', 'coffee_stain', 'deploy_friday'];

  // Click-based events: solve enters click mode
  if (clickEvents.includes(type) && action === 'solve') {
    nextEventState = applyRandomEventChoiceState(eventState, type, action, now);
    const clicksNeeded = getRemainingClicks(nextEventState, type);
    const extendedExpiresAt = new Date(now.getTime() + clicksNeeded * 2000 + 5000);
    await client.query(
      `UPDATE user_active_events
       SET state = $3,
           deltas = $4,
           expires_at = $5
       WHERE user_id = $1 AND event_id = $2`,
      [userId, eventId, JSON.stringify(nextEventState), JSON.stringify(nextDeltas), extendedExpiresAt]
    );
    await syncRandomEventStateToProgression(client, userId, nextEventState);
    return { success: true, resolved: false, nextState: nextEventState, deltas: nextDeltas };
  }

  // Click-based events: tap reduces counter
  if (clickEvents.includes(type) && action === 'tap') {
    nextEventState = applyTapToRandomEventState(eventState);
    nextDeltas = { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
    const clicksLeft = getRemainingClicks(nextEventState, type);
    if (clicksLeft <= 0) {
      await client.query(
        `UPDATE user_active_events
         SET resolved = TRUE, resolved_at = NOW(), resolution = $3, state = $4, deltas = $5
         WHERE user_id = $1 AND event_id = $2`,
        [userId, eventId, action, JSON.stringify(nextEventState), JSON.stringify(nextDeltas)]
      );
      await syncRandomEventStateToProgression(client, userId, nextEventState);
      return { success: true, resolved: true, nextState: nextEventState, deltas: nextDeltas };
    }
    await client.query(
      `UPDATE user_active_events
       SET state = $3
       WHERE user_id = $1 AND event_id = $2`,
      [userId, eventId, JSON.stringify(nextEventState)]
    );
    await syncRandomEventStateToProgression(client, userId, nextEventState);
    return { success: true, resolved: false, nextState: nextEventState, deltas: nextDeltas };
  }

  // Other special cases
  if (type === 'stack_overflow_down' && action === 'ignore') {
    nextEventState = applyRandomEventChoiceState(eventState, type, action, now);
  }
  if (type === 'golden_commit' && action === 'solve') {
    nextEventState = applyRandomEventChoiceState(eventState, type, action, now);
  }
  if (type === 'deploy_friday' && action === 'ignore') {
    nextEventState = applyRandomEventChoiceState(eventState, type, action, now);
  }
  if (type === 'bug_production' && action === 'ignore') {
    nextEventState = applyRandomEventChoiceState(eventState, type, action, now);
  }
  if (type === 'open_source_contribution' && action === 'solve') {
    await client.query(
      `INSERT INTO user_skins (user_id, skin_id, equipped, unlocked_at)
       VALUES ($1, 'open_source_hero', false, NOW())
       ON CONFLICT (user_id, skin_id) DO NOTHING`,
      [userId]
    );
  }

  await client.query(
    `UPDATE user_active_events
     SET resolved = TRUE, resolved_at = NOW(), resolution = $3, state = $4, deltas = $5
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
  const meta = EVENT_UI_META[row.event_slug] || {};
  return {
    eventId: row.event_id,
    type: row.event_slug,
    kind: row.kind || 'neutral',
    title: meta.title || row.event_slug,
    description: meta.description || '',
    options: {
      solve: meta.solveLabel ? { label: meta.solveLabel } : null,
      ignore: meta.ignoreLabel ? { label: meta.ignoreLabel } : null,
    },
    timeout: Math.max(0, Math.floor((new Date(row.expires_at).getTime() - Date.now()) / 1000)),
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    state: row.state || {},
  };
}
