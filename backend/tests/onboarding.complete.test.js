import { createInitData, ensureTestSchema, resetTestDatabase, testPool, TEST_DATABASE_URL } from "./helpers/testDb.js";
import { startTestServer } from "./helpers/testServer.js";

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

// Regression coverage for the onboarding completion route. The route must
// reward the starter pack exactly once and must NEVER 500 on malformed
// historical `inventory` JSONB (the original defect: a cast of
// `inventory->>'coffee_cups'` to int throws on non-numeric / out-of-range
// values, which the frontend surfaced as "Не удалось сохранить прогресс").
describeIfDb("onboarding completion", () => {
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
    if (server) {
      await server.close();
    }
    if (testPool) {
      await testPool.end();
    }
  });

  async function seedUser(telegramId, { energy = 90, inventory = "{}", onboardingCompleted = false, withProgression = true } = {}) {
    const user = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, `user_${telegramId}`],
    );
    if (withProgression) {
      await testPool.query(
        `INSERT INTO progression (user_id, energy, inventory, onboarding_completed)
         VALUES ($1, $2, $3::jsonb, $4)`,
        [user.rows[0].id, energy, inventory, onboardingCompleted],
      );
    }
    return user.rows[0].id;
  }

  async function completeOnboarding(telegramId) {
    return server.request("/api/onboarding/complete", {
      method: "POST",
      headers: {
        "X-Telegram-Init-Data": createInitData(telegramId),
      },
    });
  }

  async function getInventory(telegramId) {
    const result = await testPool.query(
      `SELECT p.inventory, p.energy, p.onboarding_completed
       FROM progression p
       JOIN users u ON u.id = p.user_id
       WHERE u.telegram_id = $1`,
      [telegramId],
    );
    return result.rows[0];
  }

  test("normal {} inventory completes and grants exactly one coffee cup", async () => {
    await seedUser(800001, { energy: 50, inventory: "{}" });
    const res = await completeOnboarding(800001);
    expect(res.status).toBe(200);
    expect(res.body.progression.onboardingCompleted).toBe(true);
    expect(res.body.progression.energy).toBe(70);

    const row = await getInventory(800001);
    expect(row.inventory.coffee_cups).toBe(1);
    expect(row.energy).toBe(70);
    expect(row.onboarding_completed).toBe(true);
  });

  test("JSON null inventory completes without 500", async () => {
    await seedUser(800003, { inventory: "null" });
    const res = await completeOnboarding(800003);
    expect(res.status).toBe(200);
    expect(res.body.progression.inventory.coffee_cups).toBe(1);
  });

  test("array inventory completes without 500", async () => {
    await seedUser(800004, { inventory: "[1,2,3]" });
    const res = await completeOnboarding(800004);
    expect(res.status).toBe(200);
    expect(res.body.progression.inventory.coffee_cups).toBe(1);
  });

  test("scalar inventory completes without 500", async () => {
    await seedUser(800013, { inventory: "42" });
    const res = await completeOnboarding(800013);
    expect(res.status).toBe(200);
    expect(res.body.progression.inventory.coffee_cups).toBe(1);
  });

  test("object inventory with nonnumeric coffee_cups completes without 500", async () => {
    await seedUser(800005, { inventory: '{"coffee_cups":"abc"}' });
    const res = await completeOnboarding(800005);
    expect(res.status).toBe(200);
    expect(res.body.progression.inventory.coffee_cups).toBe(1);
  });

  test("object inventory with float coffee_cups completes without 500", async () => {
    await seedUser(800006, { inventory: '{"coffee_cups":1.5}' });
    const res = await completeOnboarding(800006);
    expect(res.status).toBe(200);
    expect(res.body.progression.inventory.coffee_cups).toBe(1);
  });

  test("object inventory with huge numeric coffee_cups completes without 500", async () => {
    await seedUser(800007, { inventory: '{"coffee_cups":999999999999}' });
    const res = await completeOnboarding(800007);
    expect(res.status).toBe(200);
    expect(res.body.progression.inventory.coffee_cups).toBe(1);
  });

  test("object inventory with scientific-notation coffee_cups completes without 500", async () => {
    await seedUser(800008, { inventory: '{"coffee_cups":1e30}' });
    const res = await completeOnboarding(800008);
    expect(res.status).toBe(200);
    expect(res.body.progression.inventory.coffee_cups).toBe(1);
  });

  test("valid numeric coffee_cups increments by exactly one", async () => {
    await seedUser(800009, { inventory: '{"coffee_cups":2}' });
    const res = await completeOnboarding(800009);
    expect(res.status).toBe(200);
    expect(res.body.progression.inventory.coffee_cups).toBe(3);
  });

  test("missing progression row returns a recoverable 404", async () => {
    await seedUser(800010, { withProgression: false });
    const res = await completeOnboarding(800010);
    expect(res.status).toBe(404);
  });

  test("already-completed row returns 409 and preserves the reward", async () => {
    await seedUser(800011, {
      onboardingCompleted: true,
      inventory: '{"coffee_cups":5}',
      energy: 100,
    });
    const res = await completeOnboarding(800011);
    expect(res.status).toBe(409);

    const row = await getInventory(800011);
    expect(row.inventory.coffee_cups).toBe(5);
    expect(row.energy).toBe(100);
  });

  test("energy reward is clamped at 100", async () => {
    await seedUser(800012, { energy: 95, inventory: "{}" });
    const res = await completeOnboarding(800012);
    expect(res.status).toBe(200);
    expect(res.body.progression.energy).toBe(100);
  });
});
