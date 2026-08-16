import {
  calculateEventDeltas,
  expireRandomEvents,
  getUserActiveRandomEvent,
  resolveRandomEvent,
  spawnRandomEvent,
  buildActiveEventPayload,
} from '../src/utils/randomEventEngine.js';
import { RANDOM_EVENTS_CONFIG } from '../src/config/events.js';
import { ensureTestSchema, resetTestDatabase, testPool, TEST_DATABASE_URL } from './helpers/testDb.js';

describe('Random event balance and Friday production contracts', () => {
  test('keeps configured type weights and the complete event pool at their intended totals', () => {
    const typeWeights = Object.values(RANDOM_EVENTS_CONFIG.events).reduce((totals, event) => {
      totals[event.type] = (totals[event.type] || 0) + event.weight;
      return totals;
    }, {});
    const totalWeight = Object.values(typeWeights).reduce((sum, weight) => sum + weight, 0);

    expect(typeWeights).toEqual(RANDOM_EVENTS_CONFIG.targetWeightByType);
    expect(totalWeight).toBe(100);
    expect(RANDOM_EVENTS_CONFIG.events.friday_release_outage).toMatchObject({
      type: 'negative',
      weight: 6,
      effect: { commits: -3, depression: 2 },
    });
    expect(RANDOM_EVENTS_CONFIG.events.green_build).toMatchObject({
      type: 'positive',
      weight: 3,
      effect: { commits: 15, depressionRelief: 3 },
    });
  });

  test("makes Friday Release Outage's responsible rollback strictly safer than denial", () => {
    expect(calculateEventDeltas('friday_release_outage', 'solve')).toEqual({
      energyDelta: 0,
      depressionDelta: 2,
      commitsDelta: -3,
    });
    expect(calculateEventDeltas('friday_release_outage', 'ignore')).toEqual({
      energyDelta: 0,
      depressionDelta: 7,
      commitsDelta: -10,
    });
  });

  test('makes Green Build a meaningful positive recovery without overpowering Golden Commit', () => {
    expect(calculateEventDeltas('green_build', 'solve')).toEqual({
      energyDelta: 0,
      depressionDelta: -3,
      commitsDelta: 15,
    });
    expect(calculateEventDeltas('green_build', 'ignore')).toEqual({
      energyDelta: 0,
      depressionDelta: 0,
      commitsDelta: 4,
    });
  });
});

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb('MVP Random Events — server-authoritative state machine', () => {
  beforeAll(async () => {
    await ensureTestSchema();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    if (testPool) await testPool.end();
  });

  async function createUser(telegramId, createdAt = null) {
    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username, created_at)
       VALUES ($1, $2, COALESCE($3, NOW()))
       RETURNING id, created_at`,
      [telegramId, `user_${telegramId}`, createdAt]
    );
    const userId = userResult.rows[0].id;
    await testPool.query(
      `INSERT INTO progression (user_id) VALUES ($1)`,
      [userId]
    );
    return { userId, createdAt: userResult.rows[0].created_at };
  }

  test('spawnRandomEvent creates an active event when cadence allows', async () => {
    const { userId } = await createUser(1001);
    const event = await spawnRandomEvent(testPool, userId, 61);
    expect(event).not.toBeNull();
    expect(event.type).toBeTruthy();
    expect(event.eventId).toBeTruthy();

    const active = await getUserActiveRandomEvent(testPool, userId);
    expect(active).not.toBeNull();
    expect(active.event_slug).toBe(event.type);
  });

  test('spawnRandomEvent respects cadence and does not double-spawn', async () => {
    const { userId } = await createUser(1002);
    const first = await spawnRandomEvent(testPool, userId, 61);
    expect(first).not.toBeNull();

    const second = await spawnRandomEvent(testPool, userId, 61);
    expect(second).toBeNull();
  });

  test('FTUE suppression: no negative events in first 5 minutes', async () => {
    const { userId } = await createUser(1003);
    let foundNegative = false;
    for (let i = 0; i < 30; i++) {
      await testPool.query(
        `UPDATE progression SET last_random_event_spawn_at = NULL WHERE user_id = $1`,
        [userId]
      );
      const event = await spawnRandomEvent(testPool, userId, 3); // 3 minutes
      if (event && ['legacy_code', 'deploy_friday', 'bug_production', 'stack_overflow_down'].includes(event.type)) {
        foundNegative = true;
        break;
      }
    }
    expect(foundNegative).toBe(false);
  });

  test('resolveRandomEvent resolves non-click solve action and returns deltas', async () => {
    const { userId } = await createUser(1004);
    const originalRandom = Math.random;
    let event;
    try {
      Math.random = () => 0;
      event = await spawnRandomEvent(testPool, userId, 61);
    } finally {
      Math.random = originalRandom;
    }
    expect(event).not.toBeNull();
    expect(event.type).toBe('golden_commit');

    const result = await resolveRandomEvent(testPool, userId, event.eventId, 'solve', { commitsTotal: 1000 });
    expect(result.success).toBe(true);
    expect(result.resolved).toBe(true);
    expect(result.deltas).toBeDefined();

    const active = await getUserActiveRandomEvent(testPool, userId);
    expect(active).toBeNull();
  });

  test('resolveRandomEvent handles legacy_code tap until clicks exhausted', async () => {
    const { userId } = await createUser(1005);
    await testPool.query(
      `INSERT INTO user_active_events (user_id, event_slug, event_id, started_at, expires_at, state)
       VALUES ($1, 'legacy_code', 'lc_001', NOW(), NOW() + INTERVAL '1 hour', '{"legacyCodeClicksRemaining": 10}')`,
      [userId]
    );

    for (let i = 0; i < 9; i++) {
      const result = await resolveRandomEvent(testPool, userId, 'lc_001', 'tap');
      expect(result.resolved).toBe(false);
    }

    const final = await resolveRandomEvent(testPool, userId, 'lc_001', 'tap');
    expect(final.resolved).toBe(true);
  });

  test('legacy_code solve creates a flat active-event state and resolves on the 10th tap only', async () => {
    const { userId } = await createUser(1010);
    await testPool.query(
      `INSERT INTO user_active_events (user_id, event_slug, event_id, started_at, expires_at, state)
       VALUES ($1, 'legacy_code', 'lc_solve_then_tap', NOW(), NOW() + INTERVAL '1 hour', '{}')`,
      [userId]
    );

    const solved = await resolveRandomEvent(testPool, userId, 'lc_solve_then_tap', 'solve');
    expect(solved.resolved).toBe(false);
    expect(solved.nextState.legacyCodeClicksRemaining).toBe(10);

    for (let i = 0; i < 9; i++) {
      const result = await resolveRandomEvent(testPool, userId, 'lc_solve_then_tap', 'tap');
      expect(result.resolved).toBe(false);
      expect(result.nextState.legacyCodeClicksRemaining).toBe(9 - i);
    }

    const final = await resolveRandomEvent(testPool, userId, 'lc_solve_then_tap', 'tap');
    expect(final.resolved).toBe(true);
    expect(final.nextState.legacyCodeClicksRemaining).toBe(0);
  });

  test('expireRandomEvents auto-resolves stale events', async () => {
    const { userId } = await createUser(1006);
    await testPool.query(
      `INSERT INTO user_active_events (user_id, event_slug, event_id, started_at, expires_at, state)
       VALUES ($1, 'coffee_stain', 'cb_001', NOW() - INTERVAL '2 minutes', NOW() - INTERVAL '1 minute', '{}')`,
      [userId]
    );

    const expired = await expireRandomEvents(testPool);
    expect(expired.length).toBeGreaterThanOrEqual(1);

    const active = await getUserActiveRandomEvent(testPool, userId);
    expect(active).toBeNull();
  });

  test('calculateEventDeltas for deploy_friday solve and ignore follow configured outcomes', async () => {
    expect(calculateEventDeltas('deploy_friday', 'solve', { commitsTotal: 1000 })).toEqual({
      energyDelta: 0,
      depressionDelta: -2,
      commitsDelta: 0,
    });

    const originalRandom = Math.random;
    try {
      Math.random = () => 0.69;
      expect(calculateEventDeltas('deploy_friday', 'ignore', { commitsTotal: 1000 })).toEqual({
        energyDelta: 0,
        depressionDelta: 0,
        commitsDelta: 0,
      });

      Math.random = () => 0.70;
      expect(calculateEventDeltas('deploy_friday', 'ignore', { commitsTotal: 1000 })).toEqual({
        energyDelta: 0,
        depressionDelta: 8,
        commitsDelta: -250,
      });
    } finally {
      Math.random = originalRandom;
    }
  });

  test('calculateEventDeltas keeps Slack Huddle trade-offs explicit', () => {
    expect(calculateEventDeltas('slack_huddle', 'solve')).toEqual({
      energyDelta: 0,
      depressionDelta: 2,
      commitsDelta: 12,
    });
    expect(calculateEventDeltas('slack_huddle', 'ignore')).toEqual({
      energyDelta: 0,
      depressionDelta: -1,
      commitsDelta: -3,
    });
  });

  test('calculateEventDeltas keeps Scope Creep and Merge Conflict trade-offs explicit', () => {
    expect(calculateEventDeltas('scope_creep', 'solve')).toEqual({
      energyDelta: 0,
      depressionDelta: 3,
      commitsDelta: 8,
    });
    expect(calculateEventDeltas('scope_creep', 'ignore')).toEqual({
      energyDelta: 0,
      depressionDelta: -1,
      commitsDelta: -2,
    });
    expect(calculateEventDeltas('merge_conflict', 'solve')).toEqual({
      energyDelta: 0,
      depressionDelta: 3,
      commitsDelta: 5,
    });
    expect(calculateEventDeltas('merge_conflict', 'ignore')).toEqual({
      energyDelta: 0,
      depressionDelta: 5,
      commitsDelta: -12,
    });
  });

  test('calculateEventDeltas keeps Canary Rollback and HTTP 500 Spike trade-offs explicit', () => {
    expect(calculateEventDeltas('canary_rollback', 'solve')).toEqual({
      energyDelta: 0,
      depressionDelta: 1,
      commitsDelta: -2,
    });
    expect(calculateEventDeltas('canary_rollback', 'ignore')).toEqual({
      energyDelta: 0,
      depressionDelta: 5,
      commitsDelta: -8,
    });
    expect(calculateEventDeltas('production_500_spike', 'solve')).toEqual({
      energyDelta: 0,
      depressionDelta: 2,
      commitsDelta: 4,
    });
    expect(calculateEventDeltas('production_500_spike', 'ignore')).toEqual({
      energyDelta: 0,
      depressionDelta: 6,
      commitsDelta: -5,
    });
  });

  test('calculateEventDeltas keeps CI Pipeline Red and Slack Thread Storm trade-offs explicit', () => {
    expect(calculateEventDeltas('ci_pipeline_red', 'solve')).toEqual({
      energyDelta: 0,
      depressionDelta: 1,
      commitsDelta: -1,
    });
    expect(calculateEventDeltas('ci_pipeline_red', 'ignore')).toEqual({
      energyDelta: 0,
      depressionDelta: 5,
      commitsDelta: -6,
    });
    expect(calculateEventDeltas('slack_thread_storm', 'solve')).toEqual({
      energyDelta: 0,
      depressionDelta: 1,
      commitsDelta: 4,
    });
    expect(calculateEventDeltas('slack_thread_storm', 'ignore')).toEqual({
      energyDelta: 0,
      depressionDelta: 3,
      commitsDelta: -3,
    });
  });

  test('buildActiveEventPayload returns null for missing row', () => {
    expect(buildActiveEventPayload(null)).toBeNull();
  });

  test('buildActiveEventPayload formats event with timeout seconds remaining', async () => {
    const { userId } = await createUser(1007);
    await testPool.query(
      `INSERT INTO user_active_events (user_id, event_slug, event_id, started_at, expires_at, state)
       VALUES ($1, 'golden_commit', 'hs_001', NOW(), NOW() + INTERVAL '15 seconds', '{}')`,
      [userId]
    );
    const active = await getUserActiveRandomEvent(testPool, userId);
    const payload = buildActiveEventPayload(active);
    expect(payload.type).toBe('golden_commit');
    expect(payload.timeout).toBeGreaterThan(0);
    expect(payload.timeout).toBeLessThanOrEqual(16);
  });
});
