import {
  createInitData,
  ensureTestSchema,
  resetTestDatabase,
  testPool,
  TEST_DATABASE_URL,
} from "./helpers/testDb.js";
import { startTestServer } from "./helpers/testServer.js";

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb("onboarding routes", () => {
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

  test("GET /api/state returns onboarding_completed: false for a new user", async () => {
    const telegramId = 910000001;
    const initData = createInitData(telegramId, { username: "onboarding_new" });

    const state = await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    expect(state.status).toBe(200);
    expect(state.body?.progression?.onboardingCompleted).toBe(false);
    expect(state.body?.game?.onboarding_completed).toBe(false);
  });

  test("POST /api/onboarding/skip marks onboarding as finished without rewards", async () => {
    const telegramId = 910000002;
    const initData = createInitData(telegramId, { username: "onboarding_skip" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "onboarding_skip"]
    );
    const userId = userResult.rows[0].id;

    await testPool.query(
      `INSERT INTO progression (user_id, energy) VALUES ($1, 100)`,
      [userId]
    );

    const skip = await server.request("/api/onboarding/skip", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });

    expect(skip.status).toBe(200);
    expect(skip.body?.progression?.onboardingCompleted).toBe(true);
    expect(skip.body?.game?.onboarding_completed).toBe(true);
    expect(skip.body?.progression?.energy).toBe(100);
    expect(skip.body?.progression?.inventory?.coffee_cups).toBeUndefined();
  });

  test("POST /api/onboarding/skip is idempotent", async () => {
    const telegramId = 910000003;
    const initData = createInitData(telegramId, { username: "onboarding_skip_idempotent" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "onboarding_skip_idempotent"]
    );
    const userId = userResult.rows[0].id;

    await testPool.query(
      `INSERT INTO progression (user_id, energy) VALUES ($1, 100)`,
      [userId]
    );

    const first = await server.request("/api/onboarding/skip", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });
    expect(first.status).toBe(200);
    expect(first.body?.progression?.onboardingCompleted).toBe(true);

    const second = await server.request("/api/onboarding/skip", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });
    expect(second.status).toBe(200);
    expect(second.body?.progression?.onboardingCompleted).toBe(true);
    expect(second.body?.progression?.energy).toBe(first.body?.progression?.energy);
  });

  test("POST /api/onboarding/complete marks onboarding as finished and grants reward", async () => {
    const telegramId = 910000004;
    const initData = createInitData(telegramId, { username: "onboarding_complete" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "onboarding_complete"]
    );
    const userId = userResult.rows[0].id;

    await testPool.query(
      `INSERT INTO progression (user_id, energy) VALUES ($1, 80)`,
      [userId]
    );

    const complete = await server.request("/api/onboarding/complete", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });

    expect(complete.status).toBe(200);
    expect(complete.body?.progression?.onboardingCompleted).toBe(true);
    expect(complete.body?.game?.onboarding_completed).toBe(true);
    expect(complete.body?.progression?.energy).toBe(100);
    expect(complete.body?.progression?.inventory?.coffee_cups).toBe(1);
  });

  test("POST /api/onboarding/complete is idempotent", async () => {
    const telegramId = 910000005;
    const initData = createInitData(telegramId, { username: "onboarding_complete_idempotent" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "onboarding_complete_idempotent"]
    );
    const userId = userResult.rows[0].id;

    await testPool.query(
      `INSERT INTO progression (user_id, energy) VALUES ($1, 80)`,
      [userId]
    );

    const first = await server.request("/api/onboarding/complete", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });
    expect(first.status).toBe(200);
    expect(first.body?.progression?.inventory?.coffee_cups).toBe(1);

    const second = await server.request("/api/onboarding/complete", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });
    expect(second.status).toBe(200);
    expect(second.body?.progression?.onboardingCompleted).toBe(true);
    expect(second.body?.progression?.energy).toBe(first.body?.progression?.energy);
    expect(second.body?.progression?.inventory?.coffee_cups).toBe(1);
  });

  test("POST /api/onboarding/complete after skip does not grant reward", async () => {
    const telegramId = 910000006;
    const initData = createInitData(telegramId, { username: "onboarding_skip_then_complete" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "onboarding_skip_then_complete"]
    );
    const userId = userResult.rows[0].id;

    await testPool.query(
      `INSERT INTO progression (user_id, energy) VALUES ($1, 100)`,
      [userId]
    );

    const skip = await server.request("/api/onboarding/skip", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });
    expect(skip.status).toBe(200);
    expect(skip.body?.progression?.inventory?.coffee_cups).toBeUndefined();

    const complete = await server.request("/api/onboarding/complete", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });
    expect(complete.status).toBe(200);
    expect(complete.body?.progression?.onboardingCompleted).toBe(true);
    expect(complete.body?.progression?.energy).toBe(100);
    expect(complete.body?.progression?.inventory?.coffee_cups).toBeUndefined();
  });

  test("GET /api/state returns onboarding_completed: true after completion", async () => {
    const telegramId = 910000007;
    const initData = createInitData(telegramId, { username: "onboarding_state_after" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "onboarding_state_after"]
    );
    const userId = userResult.rows[0].id;

    await testPool.query(
      `INSERT INTO progression (user_id, energy, onboarding_status)
       VALUES ($1, 100, 'completed')`,
      [userId]
    );

    const state = await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    expect(state.status).toBe(200);
    expect(state.body?.progression?.onboardingCompleted).toBe(true);
    expect(state.body?.game?.onboarding_completed).toBe(true);
  });

  test("POST /api/onboarding/complete adds reward on top of existing inventory", async () => {
    const telegramId = 910000008;
    const initData = createInitData(telegramId, { username: "onboarding_complete_additive" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "onboarding_complete_additive"]
    );
    const userId = userResult.rows[0].id;

    await testPool.query(
      `INSERT INTO progression (user_id, energy, inventory) VALUES ($1, $2, $3::jsonb)`,
      [userId, 80, JSON.stringify({ coffee_cups: 2, stickers: 1 })]
    );

    const complete = await server.request("/api/onboarding/complete", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });

    expect(complete.status).toBe(200);
    expect(complete.body?.progression?.onboardingCompleted).toBe(true);
    expect(complete.body?.progression?.inventory?.coffee_cups).toBe(3);
    expect(complete.body?.progression?.inventory?.stickers).toBe(1);
  });

  test("POST /api/onboarding/complete is idempotent and does not double-add reward", async () => {
    const telegramId = 910000009;
    const initData = createInitData(telegramId, { username: "onboarding_complete_idempotent_add" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "onboarding_complete_idempotent_add"]
    );
    const userId = userResult.rows[0].id;

    await testPool.query(
      `INSERT INTO progression (user_id, energy, inventory) VALUES ($1, $2, $3::jsonb)`,
      [userId, 80, JSON.stringify({ coffee_cups: 2 })]
    );

    const first = await server.request("/api/onboarding/complete", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });
    expect(first.status).toBe(200);
    expect(first.body?.progression?.inventory?.coffee_cups).toBe(3);

    const second = await server.request("/api/onboarding/complete", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });
    expect(second.status).toBe(200);
    expect(second.body?.progression?.inventory?.coffee_cups).toBe(3);
  });

  test("POST /api/onboarding/complete handles null inventory", async () => {
    const telegramId = 910000012;
    const initData = createInitData(telegramId, { username: "onboarding_complete_null_inventory" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "onboarding_complete_null_inventory"]
    );
    const userId = userResult.rows[0].id;

    await testPool.query(
      `INSERT INTO progression (user_id, energy, inventory) VALUES ($1, $2, $3::jsonb)`,
      [userId, 80, JSON.stringify(null)]
    );

    const complete = await server.request("/api/onboarding/complete", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });

    expect(complete.status).toBe(200);
    expect(complete.body?.progression?.onboardingCompleted).toBe(true);
    expect(complete.body?.progression?.inventory?.coffee_cups).toBe(1);
  });

  test("POST /api/onboarding/complete adds reward to string-numeric inventory value", async () => {
    const telegramId = 910000013;
    const initData = createInitData(telegramId, { username: "onboarding_complete_string_inventory" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "onboarding_complete_string_inventory"]
    );
    const userId = userResult.rows[0].id;

    await testPool.query(
      `INSERT INTO progression (user_id, energy, inventory) VALUES ($1, $2, $3::jsonb)`,
      [userId, 80, JSON.stringify({ coffee_cups: "2" })]
    );

    const complete = await server.request("/api/onboarding/complete", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });

    expect(complete.status).toBe(200);
    expect(complete.body?.progression?.onboardingCompleted).toBe(true);
    expect(complete.body?.progression?.inventory?.coffee_cups).toBe(3);
  });

  test("GET /api/state returns onboarding status and timestamps after completion", async () => {
    const telegramId = 910000010;
    const initData = createInitData(telegramId, { username: "onboarding_state_timestamps" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "onboarding_state_timestamps"]
    );
    const userId = userResult.rows[0].id;

    await testPool.query(
      `INSERT INTO progression (user_id, energy, onboarding_status, onboarding_completed_at)
       VALUES ($1, 100, 'completed', NOW())`,
      [userId]
    );

    const state = await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    expect(state.status).toBe(200);
    expect(state.body?.progression?.onboardingCompleted).toBe(true);
    expect(state.body?.progression?.onboardingStatus).toBe("completed");
    expect(typeof state.body?.progression?.onboardingCompletedAt).toBe("string");
    expect(state.body?.progression?.onboardingCompletedAt).not.toBeNull();
    expect(state.body?.progression?.onboardingSkippedAt).toBeNull();
    expect(state.body?.game?.onboarding_completed).toBe(true);
    expect(state.body?.game?.onboardingStatus).toBe("completed");
    expect(typeof state.body?.game?.onboardingCompletedAt).toBe("string");
    expect(state.body?.game?.onboardingSkippedAt).toBeNull();
  });

  test("GET /api/state returns onboarding_completed: true after skip", async () => {
    const telegramId = 910000011;
    const initData = createInitData(telegramId, { username: "onboarding_state_skip" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "onboarding_state_skip"]
    );
    const userId = userResult.rows[0].id;

    await testPool.query(
      `INSERT INTO progression (user_id, energy) VALUES ($1, 100)`,
      [userId]
    );

    const skip = await server.request("/api/onboarding/skip", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });
    expect(skip.status).toBe(200);

    const state = await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    expect(state.status).toBe(200);
    expect(state.body?.progression?.onboardingCompleted).toBe(true);
    expect(state.body?.game?.onboarding_completed).toBe(true);
    expect(state.body?.progression?.onboardingStatus).toBe("skipped");
    expect(typeof state.body?.progression?.onboardingSkippedAt).toBe("string");
    expect(state.body?.progression?.onboardingSkippedAt).not.toBeNull();
  });

  test("POST /api/onboarding/complete rejects unauthenticated requests", async () => {
    const response = await server.request("/api/onboarding/complete", {
      method: "POST",
      body: {},
    });
    expect(response.status).toBe(401);
  });

  test("POST /api/onboarding/skip rejects unauthenticated requests", async () => {
    const response = await server.request("/api/onboarding/skip", {
      method: "POST",
      body: {},
    });
    expect(response.status).toBe(401);
  });

  test("POST /api/onboarding/complete returns 404 when progression row is missing", async () => {
    const telegramId = 920000001;
    const initData = createInitData(telegramId, { username: "onboarding_complete_no_progression" });

    await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2)`,
      [telegramId, "onboarding_complete_no_progression"]
    );

    const complete = await server.request("/api/onboarding/complete", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });

    expect(complete.status).toBe(404);
  });

  test("POST /api/onboarding/skip returns 404 when progression row is missing", async () => {
    const telegramId = 920000002;
    const initData = createInitData(telegramId, { username: "onboarding_skip_no_progression" });

    await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2)`,
      [telegramId, "onboarding_skip_no_progression"]
    );

    const skip = await server.request("/api/onboarding/skip", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });

    expect(skip.status).toBe(404);
  });

  test("POST /api/onboarding/complete after complete is idempotent", async () => {
    const telegramId = 920000003;
    const initData = createInitData(telegramId, { username: "onboarding_complete_then_skip" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "onboarding_complete_then_skip"]
    );
    const userId = userResult.rows[0].id;

    await testPool.query(
      `INSERT INTO progression (user_id, energy) VALUES ($1, 80)`,
      [userId]
    );

    const complete = await server.request("/api/onboarding/complete", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });
    expect(complete.status).toBe(200);
    expect(complete.body?.progression?.onboardingCompleted).toBe(true);
    expect(complete.body?.progression?.inventory?.coffee_cups).toBe(1);

    const skip = await server.request("/api/onboarding/skip", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: {},
    });
    expect(skip.status).toBe(200);
    expect(skip.body?.progression?.onboardingCompleted).toBe(true);
    expect(skip.body?.progression?.onboardingStatus).toBe("completed");
    expect(skip.body?.progression?.inventory?.coffee_cups).toBe(1);
  });

  test("in_progress onboarding_status is rejected by database constraint", async () => {
    const telegramId = 920000004;

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "onboarding_in_progress_rejected"]
    );
    const userId = userResult.rows[0].id;

    let error;
    try {
      await testPool.query(
        `INSERT INTO progression (user_id, energy, onboarding_status) VALUES ($1, 100, 'in_progress')`,
        [userId]
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.code).toBe("23514");
  });

  test("Concurrent complete requests do not double-reward", async () => {
    const telegramId = 920000005;
    const initData = createInitData(telegramId, { username: "onboarding_concurrent_complete" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, "onboarding_concurrent_complete"]
    );
    const userId = userResult.rows[0].id;

    await testPool.query(
      `INSERT INTO progression (user_id, energy, inventory) VALUES ($1, $2, $3::jsonb)`,
      [userId, 80, JSON.stringify({ coffee_cups: 2 })]
    );

    const [first, second] = await Promise.all([
      server.request("/api/onboarding/complete", {
        method: "POST",
        headers: { "X-Telegram-Init-Data": initData },
        body: {},
      }),
      server.request("/api/onboarding/complete", {
        method: "POST",
        headers: { "X-Telegram-Init-Data": initData },
        body: {},
      }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const progressionResult = await testPool.query(
      `SELECT inventory FROM progression WHERE user_id = $1`,
      [userId]
    );
    expect(progressionResult.rows[0].inventory?.coffee_cups).toBe(3);
  });
});
