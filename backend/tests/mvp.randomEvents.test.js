import {
  calculateEventDeltas,
  expireRandomEvents,
  getUserActiveRandomEvent,
  resolveRandomEvent,
  spawnRandomEvent,
  buildActiveEventPayload,
} from '../src/utils/randomEventEngine.js';
import { ensureTestSchema, resetTestDatabase, testPool, TEST_DATABASE_URL } from './helpers/testDb.js';

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
    expect(active.event_type).toBe(event.type);
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
      if (event && ['legacy_code', 'deploy_friday', 'code_review_reject', 'production_alert'].includes(event.type)) {
        foundNegative = true;
        break;
      }
    }
    expect(foundNegative).toBe(false);
  });

  test('resolveRandomEvent resolves solve action and returns deltas', async () => {
    const { userId } = await createUser(1004);
    const event = await spawnRandomEvent(testPool, userId, 61);
    expect(event).not.toBeNull();

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
      `INSERT INTO active_random_events (user_id, event_type, event_id, started_at, expires_at, state)
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
      `INSERT INTO active_random_events (user_id, event_type, event_id, started_at, expires_at, state)
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
      `INSERT INTO active_random_events (user_id, event_type, event_id, started_at, expires_at, state)
       VALUES ($1, 'coffee_break', 'cb_001', NOW() - INTERVAL '2 minutes', NOW() - INTERVAL '1 minute', '{}')`,
      [userId]
    );

    const expired = await expireRandomEvents(testPool);
    expect(expired.length).toBeGreaterThanOrEqual(1);

    const active = await getUserActiveRandomEvent(testPool, userId);
    expect(active).toBeNull();
  });

  test('calculateEventDeltas for deploy_friday solve respects success chance range', async () => {
    let successCount = 0;
    for (let i = 0; i < 100; i++) {
      const deltas = calculateEventDeltas('deploy_friday', 'solve', { commitsTotal: 1000 });
      if (deltas.depressionDelta < 0) successCount++;
    }
    // 70% success chance → expect 60-80 successes in 100 rolls (generous range for test stability)
    expect(successCount).toBeGreaterThanOrEqual(50);
    expect(successCount).toBeLessThanOrEqual(90);
  });

  test('buildActiveEventPayload returns null for missing row', () => {
    expect(buildActiveEventPayload(null)).toBeNull();
  });

  test('buildActiveEventPayload formats event with timeout seconds remaining', async () => {
    const { userId } = await createUser(1007);
    await testPool.query(
      `INSERT INTO active_random_events (user_id, event_type, event_id, started_at, expires_at, state)
       VALUES ($1, 'hot_streak', 'hs_001', NOW(), NOW() + INTERVAL '15 seconds', '{}')`,
      [userId]
    );
    const active = await getUserActiveRandomEvent(testPool, userId);
    const payload = buildActiveEventPayload(active);
    expect(payload.type).toBe('hot_streak');
    expect(payload.timeout).toBeGreaterThan(0);
    expect(payload.timeout).toBeLessThanOrEqual(16);
  });
});
