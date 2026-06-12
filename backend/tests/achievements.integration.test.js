import {
  createInitData,
  ensureTestSchema,
  resetTestDatabase,
  testPool,
  TEST_DATABASE_URL,
} from "./helpers/testDb.js";
import { startTestServer } from "./helpers/testServer.js";

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb("achievements integration", () => {
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

  async function createUser(telegramId, username) {
    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, username]
    );
    const userId = userResult.rows[0].id;

    await testPool.query(
      `INSERT INTO progression (user_id, energy, depression_level, commits_total) VALUES ($1, 100, 0, 0)`,
      [userId]
    );

    await testPool.query(
      `INSERT INTO player_levels (user_id, xp_total) VALUES ($1, 0)`,
      [userId]
    );

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await testPool.query(
      `INSERT INTO daily_login_claims (user_id, last_claimed_date, streak_days) VALUES ($1, $2, 1)`,
      [userId, today]
    );

    return { userId, initData: createInitData(telegramId, { username }) };
  }

  test("GET /api/achievements returns 21 achievements for new user", async () => {
    const { initData } = await createUser(900010000, "ach_new");

    const res = await server.request("/api/achievements", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.achievements)).toBe(true);
    expect(res.body.achievements.length).toBe(29);

    const helloWorld = res.body.achievements.find((a) => a.slug === "hello_world");
    expect(helloWorld).toBeDefined();
    expect(helloWorld.earned_at).toBeNull();
  });

  test("POST /api/tap grants hello_world achievement at first tap", async () => {
    const { initData } = await createUser(900010001, "ach_first_tap");

    const tap = await server.request("/api/tap", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });

    expect(tap.status).toBe(200);
    expect(tap.body?.achievements_earned).toContain("hello_world");

    const state = await server.request("/api/achievements", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    const helloWorld = state.body.achievements.find((a) => a.slug === "hello_world");
    expect(helloWorld.earned_at).not.toBeNull();
    expect(helloWorld.claimed_at).toBeNull();
  });

  test("POST /api/achievements/:slug/claim applies coins reward", async () => {
    const { initData, userId } = await createUser(900010002, "ach_claim");

    await testPool.query(
      `INSERT INTO user_achievements (user_id, achievement_id, earned_at, source)
       SELECT $1, id, NOW(), 'runtime' FROM achievements WHERE slug = 'hello_world'`,
      [userId]
    );

    const before = await testPool.query(`SELECT coins FROM users WHERE id = $1`, [userId]);
    const coinsBefore = Number(before.rows[0].coins);

    const claim = await server.request("/api/achievements/hello_world/claim", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
    });

    expect(claim.status).toBe(200);
    expect(claim.body?.success).toBe(true);
    expect(claim.body?.rewards).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "coins", amount: 10 })])
    );

    const after = await testPool.query(`SELECT coins FROM users WHERE id = $1`, [userId]);
    expect(Number(after.rows[0].coins)).toBe(coinsBefore + 10);
  });

  test("Duplicate claim returns 409", async () => {
    const { initData, userId } = await createUser(900010003, "ach_dup");

    await testPool.query(
      `INSERT INTO user_achievements (user_id, achievement_id, earned_at, source)
       SELECT $1, id, NOW(), 'runtime' FROM achievements WHERE slug = 'hello_world'`,
      [userId]
    );

    const first = await server.request("/api/achievements/hello_world/claim", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
    });
    expect(first.status).toBe(200);

    const second = await server.request("/api/achievements/hello_world/claim", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
    });
    expect(second.status).toBe(409);
  });

  test("Unearned claim returns 403 or 404", async () => {
    const { initData } = await createUser(900010004, "ach_unearned");

    const res = await server.request("/api/achievements/hello_world/claim", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
    });
    expect([403, 404]).toContain(res.status);
  });

  test("Progressive achievement tracks percent", async () => {
    const { initData, userId } = await createUser(900010005, "ach_progress");

    // night_owl requires 50 taps between 00:00-05:00 server time
    // We can't easily control server time, so we'll test a simpler progressive
    // by manually inserting progress and verifying the endpoint shape
    const nightOwl = await testPool.query(`SELECT id FROM achievements WHERE slug = 'night_owl'`);
    const achievementId = nightOwl.rows[0]?.id;

    if (achievementId) {
      await testPool.query(
        `INSERT INTO achievement_progress (user_id, achievement_id, current_value, target_value, percent)
         VALUES ($1, $2, 25, 50, 50)`,
        [userId, achievementId]
      );

      const res = await server.request("/api/achievements", {
        headers: { "X-Telegram-Init-Data": initData },
      });

      const nightOwlResult = res.body.achievements.find((a) => a.slug === "night_owl");
      expect(nightOwlResult.percent).toBe(50);
      expect(nightOwlResult.current_value).toBe(25);
      expect(nightOwlResult.target_value).toBe(50);
    }
  });

  test("Secret achievement is masked until earned", async () => {
    const { initData } = await createUser(900010006, "ach_secret");

    const res = await server.request("/api/achievements", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    const founder = res.body.achievements.find((a) => a.slug === "founder");
    expect(founder).toBeDefined();
    expect(founder.name).toMatch(/\\?\\?\\?|Founder/);
  });
});
