import {
  createInitData,
  ensureTestSchema,
  resetTestDatabase,
  testPool,
  TEST_DATABASE_URL,
} from "./helpers/testDb.js";
import { startTestServer } from "./helpers/testServer.js";

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb("energy recovery 5-min threshold", () => {
  let server;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    await ensureTestSchema();
    server = await startTestServer();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    if (server) await server.close();
    if (testPool) await testPool.end();
  });

  test("idle < 5 minutes does not recover energy", async () => {
    const telegramId = 900000001;
    const initData = createInitData(telegramId, { username: "energy_threshold" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "energy_threshold"]
    );
    const userId = userResult.rows[0].id;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await testPool.query(
      `INSERT INTO daily_login_claims (user_id, last_claimed_date, streak_days) VALUES ($1, $2, 1)`,
      [userId, today]
    );

    const checkpoint = new Date(Date.now() - 3 * 60 * 1000);
    await testPool.query(
      `INSERT INTO progression (
         user_id, energy, depression_level, created_at,
         last_energy_activity_at, energy_recovery_checkpoint_at
       ) VALUES ($1, 50, 20, $2, $3, $3)`,
      [userId, checkpoint, checkpoint]
    );

    const state = await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    expect(state.status).toBe(200);
    expect(state.body?.game?.energy).toBe(50);

    const after = await testPool.query(
      `SELECT energy, energy_recovery_checkpoint_at FROM progression WHERE user_id = $1`,
      [userId]
    );
    expect(after.rows[0].energy).toBe(50);
    expect(new Date(after.rows[0].energy_recovery_checkpoint_at).getTime()).toBe(
      checkpoint.getTime()
    );
  });

  test("idle >= 5 minutes recovers energy and advances checkpoint", async () => {
    const telegramId = 900000002;
    const initData = createInitData(telegramId, { username: "energy_recover" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "energy_recover"]
    );
    const userId = userResult.rows[0].id;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await testPool.query(
      `INSERT INTO daily_login_claims (user_id, last_claimed_date, streak_days) VALUES ($1, $2, 1)`,
      [userId, today]
    );

    const checkpoint = new Date(Date.now() - 6 * 60 * 1000);
    await testPool.query(
      `INSERT INTO progression (
         user_id, energy, depression_level, created_at,
         last_energy_activity_at, energy_recovery_checkpoint_at
       ) VALUES ($1, 50, 20, $2, $3, $3)`,
      [userId, checkpoint, checkpoint]
    );

    const state = await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    expect(state.status).toBe(200);
    expect(state.body?.game?.energy).toBeGreaterThan(50);

    const after = await testPool.query(
      `SELECT energy, energy_recovery_checkpoint_at FROM progression WHERE user_id = $1`,
      [userId]
    );
    expect(after.rows[0].energy).toBeGreaterThan(50);
    expect(new Date(after.rows[0].energy_recovery_checkpoint_at).getTime()).toBeGreaterThan(
      checkpoint.getTime()
    );
  });

  test("idle >= 5 minutes returns idleRecovery in response", async () => {
    const telegramId = 900000003;
    const initData = createInitData(telegramId, { username: "energy_recovery_response" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "energy_recovery_response"]
    );
    const userId = userResult.rows[0].id;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await testPool.query(
      `INSERT INTO daily_login_claims (user_id, last_claimed_date, streak_days) VALUES ($1, $2, 1)`,
      [userId, today]
    );

    const checkpoint = new Date(Date.now() - 6 * 60 * 1000);
    await testPool.query(
      `INSERT INTO progression (
         user_id, energy, depression_level, created_at,
         last_energy_activity_at, energy_recovery_checkpoint_at
       ) VALUES ($1, 50, 20, $2, $3, $3)`,
      [userId, checkpoint, checkpoint]
    );

    const state = await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    expect(state.status).toBe(200);
    expect(state.body?.idleRecovery?.energy).toBeGreaterThan(0);
    expect(state.body?.idleRecovery?.secondsIdle).toBeGreaterThanOrEqual(300);
  });

  test("multiple rapid visits do not double-recover", async () => {
    const telegramId = 900000004;
    const initData = createInitData(telegramId, { username: "energy_no_double" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "energy_no_double"]
    );
    const userId = userResult.rows[0].id;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await testPool.query(
      `INSERT INTO daily_login_claims (user_id, last_claimed_date, streak_days) VALUES ($1, $2, 1)`,
      [userId, today]
    );

    const checkpoint = new Date(Date.now() - 6 * 60 * 1000);
    await testPool.query(
      `INSERT INTO progression (
         user_id, energy, depression_level, created_at,
         last_energy_activity_at, energy_recovery_checkpoint_at
       ) VALUES ($1, 50, 20, $2, $3, $3)`,
      [userId, checkpoint, checkpoint]
    );

    const firstState = await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });
    expect(firstState.status).toBe(200);
    expect(firstState.body?.game?.energy).toBeGreaterThan(50);
    const firstEnergy = firstState.body.game.energy;

    const afterFirst = await testPool.query(
      `SELECT energy_recovery_checkpoint_at FROM progression WHERE user_id = $1`,
      [userId]
    );
    const firstCheckpoint = new Date(afterFirst.rows[0].energy_recovery_checkpoint_at);

    const secondState = await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });
    expect(secondState.status).toBe(200);
    expect(secondState.body?.game?.energy).toBe(firstEnergy);

    const afterSecond = await testPool.query(
      `SELECT energy, energy_recovery_checkpoint_at FROM progression WHERE user_id = $1`,
      [userId]
    );
    expect(afterSecond.rows[0].energy).toBe(firstEnergy);
    expect(new Date(afterSecond.rows[0].energy_recovery_checkpoint_at).getTime()).toBe(
      firstCheckpoint.getTime()
    );
  });
});
