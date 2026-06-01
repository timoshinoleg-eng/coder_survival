import { createInitData, ensureTestSchema, resetTestDatabase, testPool, TEST_DATABASE_URL } from "./helpers/testDb.js";
import { startTestServer } from "./helpers/testServer.js";

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

async function getUserId(telegramId) {
  const result = await testPool.query(
    `SELECT id FROM users WHERE telegram_id = $1`,
    [telegramId],
  );
  return result.rows[0].id;
}

describeIfDb("stage2 routes", () => {
  let server;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.STAGE2_PASS_SEASON_START_DATE = "2026-05-01";
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

  test("GET /api/quests is idempotent for the same local day", async () => {
    const initData = createInitData(770001, { username: "quest_idempotent" });
    const first = await server.request("/api/quests?timezoneOffset=180", {
      headers: { "X-Telegram-Init-Data": initData },
    });
    const second = await server.request("/api/quests?timezoneOffset=180", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.quests.map((quest) => quest.id)).toEqual(second.body.quests.map((quest) => quest.id));
    expect(first.body.quests.map((quest) => quest.target)).toEqual(second.body.quests.map((quest) => quest.target));
  });

  test("quest claim is protected against double claim", async () => {
    const initData = createInitData(770002, { username: "quest_double_claim" });
    await server.request("/api/quests?timezoneOffset=180", {
      headers: { "X-Telegram-Init-Data": initData },
    });
    const userId = await getUserId(770002);
    const progression = await testPool.query(
      `SELECT daily_quests_state FROM progression WHERE user_id = $1`,
      [userId],
    );
    const state = progression.rows[0].daily_quests_state;
    state.quests = state.quests.map((quest) => (
      quest.id === "q_login"
        ? { ...quest, progress: quest.target, completed: true, claimed: false }
        : quest
    ));
    await testPool.query(
      `UPDATE progression SET daily_quests_state = $2 WHERE user_id = $1`,
      [userId, JSON.stringify(state)],
    );

    const responses = await Promise.all([
      server.request("/api/quests/claim", {
        method: "POST",
        headers: { "X-Telegram-Init-Data": initData },
        body: { questId: "q_login", timezoneOffset: 180 },
      }),
      server.request("/api/quests/claim", {
        method: "POST",
        headers: { "X-Telegram-Init-Data": initData },
        body: { questId: "q_login", timezoneOffset: 180 },
      }),
    ]);

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 400)).toHaveLength(1);
  });

  test("full clear is available after all quests are completed", async () => {
    const initData = createInitData(770004, { username: "full_clear_claimed" });
    await server.request("/api/quests?timezoneOffset=180", {
      headers: { "X-Telegram-Init-Data": initData },
    });
    const userId = await getUserId(770004);
    const progression = await testPool.query(
      `SELECT daily_quests_state FROM progression WHERE user_id = $1`,
      [userId],
    );
    const state = progression.rows[0].daily_quests_state;
    state.quests = state.quests.map((quest) => ({ ...quest, progress: quest.target, completed: true, claimed: true }));
    await testPool.query(
      `UPDATE progression SET daily_quests_state = $2 WHERE user_id = $1`,
      [userId, JSON.stringify(state)],
    );

    const response = await server.request("/api/quests/full-clear", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: { timezoneOffset: 180 },
    });
    expect(response.status).toBe(200);
    expect(response.body.fullClearClaimed).toBe(true);
  });

  test("full clear is idempotent once claimed", async () => {
    const initData = createInitData(770003, { username: "full_clear_idempotent" });
    await server.request("/api/quests?timezoneOffset=180", {
      headers: { "X-Telegram-Init-Data": initData },
    });
    const userId = await getUserId(770003);
    const progression = await testPool.query(
      `SELECT daily_quests_state FROM progression WHERE user_id = $1`,
      [userId],
    );
    const state = progression.rows[0].daily_quests_state;
    state.quests = state.quests.map((quest) => ({ ...quest, progress: quest.target, completed: true, claimed: true }));
    state.fullClearClaimed = true;
    await testPool.query(
      `UPDATE progression SET daily_quests_state = $2 WHERE user_id = $1`,
      [userId, JSON.stringify(state)],
    );

    const response = await server.request("/api/quests/full-clear", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: { timezoneOffset: 180 },
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Бонус дня недоступен");
  });

  test("timezone travel changes local quest day without changing deterministic order within a day", async () => {
    const initData = createInitData(770005, { username: "timezone_travel" });
    const tokyo = await server.request("/api/quests?timezoneOffset=540", {
      headers: { "X-Telegram-Init-Data": initData },
    });
    const newYork = await server.request("/api/quests?timezoneOffset=-300", {
      headers: { "X-Telegram-Init-Data": initData },
    });
    const newYorkAgain = await server.request("/api/quests?timezoneOffset=-300", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    expect(tokyo.status).toBe(200);
    expect(newYork.status).toBe(200);
    expect(newYorkAgain.body.date).toBe(newYork.body.date);
    expect(newYorkAgain.body.quests.map((quest) => quest.id)).toEqual(newYork.body.quests.map((quest) => quest.id));
  });

  test("pass route returns status for existing users", async () => {
    const initData = createInitData(770006, { username: "pass_backfill" });
    await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });
    const response = await server.request("/api/pass", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    expect(response.status).toBe(200);
    expect(response.body?.success).toBe(true);
    expect(response.body?.status).toBeDefined();
  });

  test("streak route initializes protection for existing users", async () => {
    const initData = createInitData(770007, { username: "streak_backfill" });
    await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });
    const response = await server.request("/api/streak?timezoneOffset=180", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    expect(response.status).toBe(200);
    expect(response.body.protection).toEqual({
      freeUsed: false,
      starSavesUsed: 0,
      teamSaveAvailable: false,
    });
  });
});
