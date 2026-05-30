import {
  createInitData,
  ensureTestSchema,
  resetTestDatabase,
  testPool,
  TEST_DATABASE_URL,
} from "./helpers/testDb.js";
import { startTestServer } from "./helpers/testServer.js";

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb("stress_v2 activation", () => {
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

  test("GET /api/state sets featureFlags.stress_v2 = true", async () => {
    const telegramId = 900000099;
    const initData = createInitData(telegramId, { username: "stress_v2_user" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "stress_v2_user"]
    );
    const userId = userResult.rows[0].id;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await testPool.query(
      `INSERT INTO daily_login_claims (user_id, last_claimed_date, streak_days) VALUES ($1, $2, 1)`,
      [userId, today]
    );

    await testPool.query(
      `INSERT INTO progression (user_id, energy, depression_level) VALUES ($1, 100, 0)`,
      [userId]
    );

    const state = await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    expect(state.status).toBe(200);
    expect(state.body?.featureFlags?.stress_v2).toBe(true);
  });

  test("stress_warning offer triggers at depression 20%", async () => {
    const telegramId = 900000010;
    const initData = createInitData(telegramId, { username: "stress_warning_20" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "stress_warning_20"]
    );
    const userId = userResult.rows[0].id;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await testPool.query(
      `INSERT INTO daily_login_claims (user_id, last_claimed_date, streak_days) VALUES ($1, $2, 1)`,
      [userId, today]
    );

    await testPool.query(
      `INSERT INTO progression (user_id, energy, depression_level) VALUES ($1, 50, 20)`,
      [userId]
    );

    const state = await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    expect(state.status).toBe(200);
    expect(state.body?.contextOffer?.type).toBe("stress_warning");
  });

  test("stress_warning offer does NOT trigger at depression 19%", async () => {
    const telegramId = 900000011;
    const initData = createInitData(telegramId, { username: "stress_warning_19" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "stress_warning_19"]
    );
    const userId = userResult.rows[0].id;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await testPool.query(
      `INSERT INTO daily_login_claims (user_id, last_claimed_date, streak_days) VALUES ($1, $2, 1)`,
      [userId, today]
    );

    await testPool.query(
      `INSERT INTO progression (user_id, energy, depression_level) VALUES ($1, 50, 19)`,
      [userId]
    );

    const state = await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    expect(state.status).toBe(200);
    expect(state.body?.contextOffer?.type).not.toBe("stress_warning");
  });

  test("passive depression decay applies after 1 hour idle", async () => {
    const telegramId = 900000012;
    const initData = createInitData(telegramId, { username: "passive_decay" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "passive_decay"]
    );
    const userId = userResult.rows[0].id;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await testPool.query(
      `INSERT INTO daily_login_claims (user_id, last_claimed_date, streak_days) VALUES ($1, $2, 1)`,
      [userId, today]
    );

    const checkpoint = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await testPool.query(
      `INSERT INTO progression (
         user_id, energy, depression_level, created_at,
         last_energy_activity_at, energy_recovery_checkpoint_at
       ) VALUES ($1, 100, 10, $2, $3, $3)`,
      [userId, checkpoint, checkpoint]
    );

    const state = await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    expect(state.status).toBe(200);
    expect(state.body?.game?.depression_level).toBeLessThan(10);
  });
});
