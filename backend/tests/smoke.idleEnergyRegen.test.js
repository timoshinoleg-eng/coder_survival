/**
 * Smoke test: idle energy regeneration trust contract.
 *
 * Covers:
 *   1. GET /api/state does not reset last_energy_activity_at.
 *   2. 10 minutes idle gives +15 energy for a newbie user (40s interval).
 *   3. An intermediate empty visit does not double-apply the same idle window.
 */

import {
  createInitData,
  ensureTestSchema,
  resetTestDatabase,
  testPool,
  TEST_DATABASE_URL,
} from "./helpers/testDb.js";
import { startTestServer } from "./helpers/testServer.js";
import { recoverProgression } from "../src/utils/progression.js";

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb("idle energy regen smoke", () => {
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

  test("GET /api/state recovers energy without resetting tap activity anchor", async () => {
    const telegramId = 999999001;
    const initData = createInitData(telegramId, { username: "idle_smoke" });

    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username)
       VALUES ($1, $2)
       RETURNING id`,
      [telegramId, "idle_smoke"],
    );
    const userId = userResult.rows[0].id;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await testPool.query(
      `INSERT INTO daily_login_claims (user_id, last_claimed_date, streak_days)
       VALUES ($1, $2, 1)`,
      [userId, today],
    );

    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const anchor = new Date(Date.now() - 10 * 60 * 1000);
    await testPool.query(
      `INSERT INTO progression (
         user_id,
         energy,
         depression_level,
         created_at,
         last_energy_activity_at,
         energy_recovery_checkpoint_at
       )
       VALUES ($1, 50, 20, $2, $3, $3)`,
      [userId, createdAt, anchor],
    );

    const firstState = await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });
    expect(firstState.status).toBe(200);
    expect(firstState.body?.game?.energy).toBe(65);

    const afterFirst = await testPool.query(
      `SELECT energy, last_energy_activity_at, energy_recovery_checkpoint_at
       FROM progression
       WHERE user_id = $1`,
      [userId],
    );
    const persistedEnergyAfterFirstVisit = afterFirst.rows[0].energy;
    expect(persistedEnergyAfterFirstVisit).toBeGreaterThanOrEqual(65);
    expect(new Date(afterFirst.rows[0].last_energy_activity_at).getTime()).toBe(anchor.getTime());
    expect(new Date(afterFirst.rows[0].energy_recovery_checkpoint_at).getTime()).toBeGreaterThan(anchor.getTime());

    const emptyVisit = await recoverProgression(testPool, afterFirst.rows[0], 100);
    expect(emptyVisit.energy).toBe(persistedEnergyAfterFirstVisit);

    const afterEmptyVisit = await testPool.query(
      `SELECT energy, last_energy_activity_at, energy_recovery_checkpoint_at
       FROM progression
       WHERE user_id = $1`,
      [userId],
    );
    expect(afterEmptyVisit.rows[0].energy).toBe(persistedEnergyAfterFirstVisit);
    expect(new Date(afterEmptyVisit.rows[0].last_energy_activity_at).getTime()).toBe(anchor.getTime());
    expect(new Date(afterEmptyVisit.rows[0].energy_recovery_checkpoint_at).getTime()).toBe(
      new Date(afterFirst.rows[0].energy_recovery_checkpoint_at).getTime(),
    );
  });
});
