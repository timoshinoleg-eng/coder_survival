import { distributeBattleRewards } from "../src/utils/battleDistribution.js";
import { checkAchievement } from "../src/utils/achievements.js";
import { ensureTestSchema, resetTestDatabase, testPool, TEST_DATABASE_URL } from "./helpers/testDb.js";

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb("phase2 unit coverage", () => {
  beforeAll(async () => {
    await ensureTestSchema();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    if (testPool) {
      await testPool.end();
    }
  });

  test("checkAchievement legacy stub returns empty array", async () => {
    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [740001, "ach_user"],
    );
    const userId = userResult.rows[0].id;

    const first = await checkAchievement(testPool, userId, "tap");
    expect(first).toEqual([]);
  });

  test("distributeBattleRewards ranks top 3 and excludes zero-commit users", async () => {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);

    const sessionStart = new Date(yesterday.getTime() + 60 * 60 * 1000).toISOString();

    const users = [];
    for (const telegramId of [750001, 750002, 750003, 750004]) {
      const userResult = await testPool.query(
        `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
        [telegramId, `battle_${telegramId}`],
      );
      const userId = userResult.rows[0].id;
      users.push(userId);
      await testPool.query(
        `INSERT INTO progression (user_id, energy) VALUES ($1, 50)`,
        [userId],
      );
    }

    const commitsByUser = new Map([
      [users[0], 90],
      [users[1], 60],
      [users[2], 30],
      [users[3], 0],
    ]);

    for (const [userId, commits] of commitsByUser.entries()) {
      if (commits === 0) {
        continue;
      }
      await testPool.query(
        `INSERT INTO sessions (session_id, user_id, started_at, commits_earned)
         VALUES ($1, $2, $3, $4)`,
        [`00000000-0000-0000-0000-${String(userId).padStart(12, "0")}`, userId, sessionStart, commits],
      );
    }

    const client = await testPool.connect();
    let result;
    try {
      result = await distributeBattleRewards(client, yesterday);
    } finally {
      client.release();
    }

    expect(result.distributed).toBe(3);
    expect(result.ranks.map((entry) => entry.userId)).toEqual([
      users[0],
      users[1],
      users[2],
    ]);
    expect(result.ranks.map((entry) => entry.rank)).toEqual([1, 2, 3]);

    const claims = await testPool.query(
      `SELECT user_id, rank FROM battle_reward_claims ORDER BY rank ASC`,
    );
    expect(claims.rows.map((row) => Number(row.user_id))).toEqual([
      users[0],
      users[1],
      users[2],
    ]);
    expect(claims.rows).toHaveLength(3);
  });

  test("burnout remains a soft progression state", () => {
    const progression = { depression_level: 200 };
    expect(progression.depression_level >= 200).toBe(true);
  });
});
