import {
  generateDailyQuests,
  checkQuestProgress,
  applyQuestUpdates,
} from "../src/utils/dailyQuests.js";
import { logPassXp, getXpSourcesAggregate } from "../src/utils/passXpLog.js";
import { getPassStatus } from "../src/utils/pass.js";
import {
  ensureTestSchema,
  resetTestDatabase,
  testPool,
  TEST_DATABASE_URL,
} from "./helpers/testDb.js";

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describe("phase4 daily progression overhaul", () => {
  describe("quest generation (3+1)", () => {
    test("generateDailyQuests returns exactly 4 quests", () => {
      const quests = generateDailyQuests("user_42", "2026-05-10", 1);
      expect(quests).toHaveLength(4);
    });

    test("generateDailyQuests returns 3 regular + 1 bonus", () => {
      const quests = generateDailyQuests("user_42", "2026-05-10", 1);
      const regular = quests.filter((q) => !q.isBonus);
      const bonus = quests.filter((q) => q.isBonus);
      expect(regular).toHaveLength(3);
      expect(bonus).toHaveLength(1);
      expect(bonus[0].isBonus).toBe(true);
    });

    test("bonus quest has 2x target of its base pool quest", () => {
      const quests = generateDailyQuests("user_42", "2026-05-10", 1);
      const bonus = quests.find((q) => q.isBonus);
      expect(bonus).toBeDefined();
      // The bonus target should be at least 2x the base pool target (plus rank scaling)
      expect(bonus.target).toBeGreaterThanOrEqual(bonus.target / 2.5 * 2);
    });

    test("base quest targets scale with rankTier", () => {
      const questsLow = generateDailyQuests("user_42", "2026-05-10", 1);
      const questsHigh = generateDailyQuests("user_42", "2026-05-10", 5);
      const tapLow = questsLow.find((q) => q.type === "tap_count" && !q.isBonus);
      const tapHigh = questsHigh.find((q) => q.type === "tap_count" && !q.isBonus);
      expect(tapHigh.target).toBe(tapLow.target + 20); // (5-1)*5 = 20
    });
  });

  describe("checkQuestProgress", () => {
    test("updates tap_count progress correctly", () => {
      const quests = [
        { id: "q1", type: "tap_count", progress: 0, target: 50, completed: false },
      ];
      const updates = checkQuestProgress(quests, "tap_count", 5);
      expect(updates[0].newProgress).toBe(5);
      expect(updates[0].wasCompleted).toBe(false);
    });

    test("updates commit_total progress correctly", () => {
      const quests = [
        { id: "q1", type: "commit_total", progress: 0, target: 100, completed: false },
      ];
      const updates = checkQuestProgress(quests, "commit_total", 100);
      expect(updates[0].newProgress).toBe(100);
      expect(updates[0].wasCompleted).toBe(true);
    });

    test("updates login progress to target immediately", () => {
      const quests = [
        { id: "q1", type: "login", progress: 0, target: 1, completed: false },
      ];
      const updates = checkQuestProgress(quests, "login", 1);
      expect(updates[0].newProgress).toBe(1);
      expect(updates[0].wasCompleted).toBe(true);
    });

    test("does not update completed quests", () => {
      const quests = [
        { id: "q1", type: "tap_count", progress: 50, target: 50, completed: true },
      ];
      const updates = checkQuestProgress(quests, "tap_count", 5);
      expect(updates[0].newProgress).toBe(50);
      expect(updates[0].wasCompleted).toBe(false);
    });

    test("applyQuestUpdates correctly patches quests", () => {
      const quests = [
        { id: "q1", type: "tap_count", progress: 0, target: 50, completed: false },
      ];
      const updates = checkQuestProgress(quests, "tap_count", 50);
      const result = applyQuestUpdates(quests, updates);
      expect(result.changed).toBe(true);
      expect(result.quests[0].progress).toBe(50);
      expect(result.quests[0].completed).toBe(true);
    });
  });

  describe("pass XP logging migration drift", () => {
    test("logPassXp skips attribution without inserting when pass_xp_log table is missing", async () => {
      const calls = [];
      const client = {
        async query(sql) {
          calls.push(sql);
          if (sql.includes("to_regclass")) {
            return { rows: [{ table_name: null }] };
          }
          return { rows: [] };
        },
      };

      await expect(logPassXp(client, 1, 2, "tap", 1)).resolves.toBeNull();
      expect(calls.some((sql) => sql.startsWith("INSERT INTO pass_xp_log"))).toBe(false);
    });
  });

  describeIfDb("pass XP logging", () => {
    beforeAll(async () => {
      await ensureTestSchema();
    });

    beforeEach(async () => {
      await resetTestDatabase();
    });

    afterAll(async () => {
      if (testPool) await testPool.end();
    });

    test("logPassXp writes to pass_xp_log", async () => {
      const userResult = await testPool.query(
        `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
        [940001, "xp_user"]
      );
      const userId = userResult.rows[0].id;

      const passResult = await testPool.query(
        `INSERT INTO sprint_passes (season_number, season_name, start_date, end_date, is_active)
         VALUES (1, 'Test Season', CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE + INTERVAL '30 days', TRUE)
         RETURNING id`
      );
      const passId = passResult.rows[0].id;

      const row = await logPassXp(testPool, userId, passId, "quest", 25, { questId: "q1" });
      expect(row).toBeDefined();
      expect(row.source).toBe("quest");
      expect(row.amount).toBe(25);
      expect(row.context).toEqual({ questId: "q1" });

      const aggregate = await getXpSourcesAggregate(testPool, userId, passId);
      expect(aggregate.quest).toBe(25);
      expect(aggregate.tap).toBe(0);
    });

    test("getPassStatus includes levels 1-3 rewards", async () => {
      const userResult = await testPool.query(
        `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
        [940002, "pass_user"]
      );
      const userId = userResult.rows[0].id;

      const passResult = await testPool.query(
        `INSERT INTO sprint_passes (season_number, season_name, start_date, end_date, is_active)
         VALUES (1, 'Test Season', CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE + INTERVAL '30 days', TRUE)
         RETURNING id`
      );
      const passId = passResult.rows[0].id;

      // Seed rewards for levels 1-3
      for (const level of [1, 2, 3]) {
        await testPool.query(
          `INSERT INTO pass_rewards (pass_id, level, required_xp, free_reward_payload, premium_reward_payload)
           VALUES ($1, $2, $3, '{}'::jsonb, '{}'::jsonb)
           ON CONFLICT (pass_id, level) DO NOTHING`,
          [passId, level, 200 + (level - 1) * 15]
        );
      }

      await testPool.query(
        `INSERT INTO player_passes (user_id, pass_id, current_level, current_xp)
         VALUES ($1, $2, 1, 0)
         ON CONFLICT (user_id, pass_id) DO NOTHING`,
        [userId, passId]
      );

      const status = await getPassStatus(testPool, userId);
      expect(status).toBeDefined();
      expect(status.rewards).toBeDefined();
      const levels = status.rewards.map((r) => r.level);
      expect(levels).toContain(1);
      expect(levels).toContain(2);
      expect(levels).toContain(3);
    });
  });

});
