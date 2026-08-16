import { createInitData, ensureTestSchema, resetTestDatabase, testPool, TEST_DATABASE_URL } from "./helpers/testDb.js";
import { startTestServer } from "./helpers/testServer.js";
import { getLeagueForCommits, getWeekMonday, snapshotLeagueWeek, LEAGUES } from "../src/utils/leagues.js";

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describe("league tier thresholds (pure)", () => {
  test("zero and small commits are bronze", () => {
    expect(getLeagueForCommits(0).league.id).toBe("bronze");
    expect(getLeagueForCommits(499).league.id).toBe("bronze");
  });

  test("boundaries map exactly", () => {
    expect(getLeagueForCommits(500).league.id).toBe("silver");
    expect(getLeagueForCommits(2000).league.id).toBe("gold");
    expect(getLeagueForCommits(6000).league.id).toBe("platinum");
    expect(getLeagueForCommits(15000).league.id).toBe("diamond");
    expect(getLeagueForCommits(40000).league.id).toBe("legend");
    expect(getLeagueForCommits(40000).next).toBeNull();
  });

  test("next tier delta computed", () => {
    const ctx = getLeagueForCommits(700);
    expect(ctx.next.id).toBe("gold");
    expect(ctx.next.min - ctx.commits).toBe(1300);
  });

  test("monday of week is a Monday", () => {
    const monday = getWeekMonday(new Date("2026-08-16T12:00:00Z")); // Sunday
    expect(monday.getUTCDay()).toBe(1);
    expect(monday.toISOString().slice(0, 10)).toBe("2026-08-10");
  });
});

describeIfDb("weekly league snapshot (db)", () => {
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

  async function seedUserWithWeekCommits(telegramId, commits) {
    const initData = createInitData(telegramId);
    const state = await server.request("/api/state", { headers: { "X-Telegram-Init-Data": initData } });
    expect(state.status).toBe(200);
    const userId = state.body?.user?.id;
    // Anchor inside the CURRENT ISO week regardless of the weekday the suite runs on.
    await testPool.query(
      `INSERT INTO sessions (session_id, user_id, started_at, taps_count, commits_earned)
       VALUES (gen_random_uuid(), $1, date_trunc('week', NOW()) + INTERVAL '1 hour', 10, $2)`,
      [userId, commits]
    );
    return userId;
  }

  test("snapshot places players, grants tier stars, idempotent on rerun", async () => {
    const bronzeUser = await seedUserWithWeekCommits(910001, 100);
    const goldUser = await seedUserWithWeekCommits(910002, 2500);
    const legendUser = await seedUserWithWeekCommits(910003, 45000);

    const weekMonday = getWeekMonday(new Date());
    // sessions were seeded NOW()-2d => inside the CURRENT week; snapshot the current week
    const client = await testPool.connect();
    let result;
    try {
      result = await snapshotLeagueWeek(client, weekMonday);
    } finally {
      client.release();
    }

    expect(result.placed).toBe(3);
    expect(result.byTier).toEqual({ bronze: 1, gold: 1, legend: 1 });

    const tiers = await testPool.query(
      `SELECT user_id, league_tier, reward_stars, placement FROM league_placements WHERE week_start = $1`,
      [weekMonday.toISOString().slice(0, 10)]
    );
    const byUser = Object.fromEntries(tiers.rows.map((r) => [r.user_id, r]));
    expect(byUser[bronzeUser].league_tier).toBe("bronze");
    expect(byUser[goldUser].league_tier).toBe("gold");
    expect(byUser[legendUser].league_tier).toBe("legend");
    expect(byUser[legendUser].placement).toBe(1);

    const goldStarsRow = await testPool.query(
      `SELECT stars FROM progression WHERE user_id = $1`,
      [goldUser]
    );
    expect(Number(goldStarsRow.rows[0]?.stars || 0)).toBeGreaterThanOrEqual(
      LEAGUES.find((l) => l.id === "gold").rewardStars
    );

    // idempotency: rerun must not double-place or double-grant
    const client2 = await testPool.connect();
    let rerun;
    try {
      rerun = await snapshotLeagueWeek(client2, weekMonday);
    } finally {
      client2.release();
    }
    expect(rerun.placed).toBe(0);
    expect(rerun.rewarded).toBe(0);
  });
});
