import {
  ensureTestSchema,
  resetTestDatabase,
  testPool,
  TEST_DATABASE_URL,
} from "./helpers/testDb.js";
import { processLoginReward } from "../src/utils/loginReward.js";
import { todayUtcDateOnly } from "../src/utils/date.js";

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb("login reward timezone regression", () => {
  const originalTz = process.env.TZ;

  beforeAll(async () => {
    process.env.TZ = "Asia/Almaty";
    await ensureTestSchema();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    process.env.TZ = originalTz;
    if (testPool) await testPool.end();
  });

  test("returning player does not receive a second daily reward on the same local Date-return day", async () => {
    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username)
       VALUES ($1, $2)
       RETURNING id`,
      [910001, "login_tz_regression"],
    );
    const userId = userResult.rows[0].id;

    await testPool.query(
      `INSERT INTO progression (user_id, energy, streak_days)
       VALUES ($1, 40, 3)`,
      [userId],
    );
    const today = todayUtcDateOnly().toISOString().slice(0, 10);
    await testPool.query(
      `INSERT INTO daily_login_claims (user_id, last_claimed_date, streak_days)
       VALUES ($1, $2, 3)`,
      [userId, today],
    );

    const reward = await processLoginReward(testPool, userId);
    expect(reward).toEqual({
      claimed: false,
      streak: 3,
      reward: null,
    });

    const progression = await testPool.query(
      `SELECT energy, streak_days FROM progression WHERE user_id = $1`,
      [userId],
    );
    expect(Number(progression.rows[0].energy)).toBe(40);
    expect(Number(progression.rows[0].streak_days)).toBe(3);
  });
});
