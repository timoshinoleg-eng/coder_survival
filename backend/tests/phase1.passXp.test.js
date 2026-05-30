import {
  createInitData,
  ensureTestSchema,
  resetTestDatabase,
  testPool,
  TEST_DATABASE_URL,
} from "./helpers/testDb.js";
import { startTestServer } from "./helpers/testServer.js";

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb("pass numeric XP", () => {
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

  test("normalizePassStatus includes nextLevelXp and remainingXp", async () => {
    const telegramId = 900000002;
    const initData = createInitData(telegramId, { username: "pass_xp_user" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "pass_xp_user"]
    );
    const userId = userResult.rows[0].id;

    const passResult = await testPool.query(
      `INSERT INTO sprint_passes (season_number, season_name, start_date, end_date, is_active)
       VALUES (1, 'Test Season', CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE + INTERVAL '30 days', TRUE)
       RETURNING id`
    );
    const passId = passResult.rows[0].id;

    // required_xp for level 1 = 200, level 2 = 215
    // 450 XP → level 2, remaining = 450 - 200 - 215 = 35, nextLevelXp = 230
    await testPool.query(
      `INSERT INTO player_passes (user_id, pass_id, current_level, current_xp)
       VALUES ($1, $2, 1, 450)`,
      [userId, passId]
    );

    const status = await server.request("/api/pass", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    expect(status.status).toBe(200);
    expect(status.body?.playerPass?.nextLevelXp).toBeGreaterThan(0);
    expect(typeof status.body?.playerPass?.remainingXp).toBe("number");
  });
});
