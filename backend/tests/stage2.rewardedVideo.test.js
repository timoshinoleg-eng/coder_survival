import { createInitData, ensureTestSchema, resetTestDatabase, testPool, TEST_DATABASE_URL } from "./helpers/testDb.js";
import { startTestServer } from "./helpers/testServer.js";

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb("stage2 rewarded video ceiling", () => {
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

  test("4 concurrent complete requests leave countToday <= 3", async () => {
    const initData = createInitData(760001, { username: "rewarded_ceiling" });
    await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        server.request("/api/rewarded-video/complete", {
          method: "POST",
          headers: { "X-Telegram-Init-Data": initData },
          body: { timezoneOffset: 180 },
        }),
      ),
    );

    expect(responses.some((response) => response.status === 429)).toBe(true);

    const userResult = await testPool.query(
      `SELECT id FROM users WHERE telegram_id = $1`,
      [760001],
    );
    const progressionResult = await testPool.query(
      `SELECT rewarded_video_state
       FROM progression
       WHERE user_id = $1`,
      [userResult.rows[0].id],
    );
    expect(Number(progressionResult.rows[0].rewarded_video_state.countToday || 0)).toBeLessThanOrEqual(3);
  });

  test("3 concurrent requests allow exactly 1 success during cooldown window", async () => {
    const initData = createInitData(760002, { username: "rewarded_one_success" });
    await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        server.request("/api/rewarded-video/complete", {
          method: "POST",
          headers: { "X-Telegram-Init-Data": initData },
          body: { timezoneOffset: 180 },
        }),
      ),
    );

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(2);
  });
});
