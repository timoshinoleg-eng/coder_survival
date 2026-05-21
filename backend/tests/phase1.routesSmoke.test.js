import {
  createInitData,
  ensureTestSchema,
  resetTestDatabase,
  testPool,
  TEST_DATABASE_URL,
} from "./helpers/testDb.js";
import { startTestServer } from "./helpers/testServer.js";

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb("phase 1 regression smoke", () => {
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

  test("POST /api/tap still commits and decrements energy", async () => {
    const telegramId = 900000020;
    const initData = createInitData(telegramId, { username: "tap_smoke" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "tap_smoke"]
    );
    const userId = userResult.rows[0].id;

    await testPool.query(
      `INSERT INTO progression (user_id, energy, depression_level, commits_total) VALUES ($1, 100, 0, 0)`,
      [userId]
    );

    const tap = await server.request("/api/tap", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });

    expect(tap.status).toBe(200);
    expect(tap.body?.commitsDelta).toBeGreaterThan(0);
    expect(tap.body?.energy).toBe(99);
    expect(tap.body?.delta?.energy).toBe(-1);
  });

  test("POST /api/tap respects rate limits", async () => {
    const telegramId = 900000021;
    const initData = createInitData(telegramId, { username: "rate_limit_smoke" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "rate_limit_smoke"]
    );
    const userId = userResult.rows[0].id;

    await testPool.query(
      `INSERT INTO progression (user_id, energy, depression_level) VALUES ($1, 100, 0)`,
      [userId]
    );

    const responses = [];
    for (let i = 0; i < 30; i++) {
      const res = await server.request("/api/tap", {
        method: "POST",
        headers: { "X-Telegram-Init-Data": initData },
        body: {},
      });
      responses.push(res);
    }

    const rateLimited = responses.filter((r) => r.status === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
  });

  test("GET /api/state returns updated progression after tap", async () => {
    const telegramId = 900000022;
    const initData = createInitData(telegramId, { username: "state_after_tap" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "state_after_tap"]
    );
    const userId = userResult.rows[0].id;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await testPool.query(
      `INSERT INTO daily_login_claims (user_id, last_claimed_date, streak_days) VALUES ($1, $2, 1)`,
      [userId, today]
    );

    await testPool.query(
      `INSERT INTO progression (user_id, energy, depression_level, commits_total) VALUES ($1, 100, 0, 0)`,
      [userId]
    );

    const tap = await server.request("/api/tap", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });
    expect(tap.status).toBe(200);
    const tapEnergy = tap.body?.energy;

    const state = await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    expect(state.status).toBe(200);
    expect(state.body?.game?.energy).toBe(tapEnergy);
    expect(state.body?.game?.commits_total).toBeGreaterThan(0);
    expect(state.body?.featureFlags?.stress_v2).toBe(true);
  });
});
