import { createInitData, ensureTestSchema, resetTestDatabase, testPool, TEST_DATABASE_URL } from "./helpers/testDb.js";
import { startTestServer } from "./helpers/testServer.js";

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

async function getUserId(telegramId) {
  const result = await testPool.query(
    `SELECT id FROM users WHERE telegram_id = $1`,
    [telegramId],
  );
  return result.rows[0]?.id;
}

async function setUserLevel(telegramId, xpTotal) {
  const userId = await getUserId(telegramId);
  await testPool.query(
    `UPDATE player_levels SET xp_total = $2 WHERE user_id = $1`,
    [userId, xpTotal],
  );
  return userId;
}

async function getUserAchievementSlugs(userId) {
  const result = await testPool.query(
    `SELECT a.slug
     FROM user_achievements ua
     JOIN achievements a ON a.id = ua.achievement_id
     WHERE ua.user_id = $1
     ORDER BY a.slug`,
    [userId],
  );
  return result.rows.map((row) => row.slug);
}

describeIfDb("mini-game routes", () => {
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

  test("IPO complete: score 3 succeeds and grants cto_cape skin", async () => {
    const telegramId = 880001;
    const initData = createInitData(telegramId, { username: "ipo_winner" });
    await server.request("/api/state", { headers: { "X-Telegram-Init-Data": initData } });
    await setUserLevel(telegramId, 360); // rank 1, level 10

    const complete = await server.request("/api/minigame/complete", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: { gameType: "ipo", score: 3 },
    });

    expect(complete.status).toBe(200);
    expect(complete.body.success).toBe(true);
    expect(complete.body.score).toBe(3);
    expect(complete.body.reward.commits).toBe(1000);

    const userId = await getUserId(telegramId);
    const skinResult = await testPool.query(
      `SELECT 1 FROM user_skins WHERE user_id = $1 AND skin_id = 'cto_cape'`,
      [userId],
    );
    expect(skinResult.rows.length).toBe(1);
  });

  test("IPO complete: score 2 fails and does not grant skin", async () => {
    const telegramId = 880002;
    const initData = createInitData(telegramId, { username: "ipo_loser" });
    await server.request("/api/state", { headers: { "X-Telegram-Init-Data": initData } });
    await setUserLevel(telegramId, 360); // rank 1, level 10

    const complete = await server.request("/api/minigame/complete", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: { gameType: "ipo", score: 2 },
    });
    expect(complete.status).toBe(200);
    expect(complete.body.success).toBe(false);
    expect(complete.body.score).toBe(2);

    const userId = await getUserId(telegramId);
    const skinResult = await testPool.query(
      `SELECT 1 FROM user_skins WHERE user_id = $1 AND skin_id = 'cto_cape'`,
      [userId],
    );
    expect(skinResult.rows.length).toBe(0);
  });

  test("IPO complete: score 4 is rejected as invalid", async () => {
    const telegramId = 880003;
    const initData = createInitData(telegramId, { username: "ipo_cheater" });
    await server.request("/api/state", { headers: { "X-Telegram-Init-Data": initData } });
    await setUserLevel(telegramId, 360); // rank 1, level 10

    const complete = await server.request("/api/minigame/complete", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: { gameType: "ipo", score: 4 },
    });

    expect(complete.status).toBe(400);
    expect(complete.body.error).toMatch(/Invalid score/i);
  });

  test("Dream Interview complete: success grants skin fragment without SQL error", async () => {
    const telegramId = 880004;
    const initData = createInitData(telegramId, { username: "dream_winner" });
    await server.request("/api/state", { headers: { "X-Telegram-Init-Data": initData } });
    await setUserLevel(telegramId, 180); // rank 1, level 6

    const complete = await server.request("/api/minigame/complete", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: { gameType: "dream_interview", score: 4 },
    });

    expect(complete.status).toBe(200);
    expect(complete.body.success).toBe(true);
    expect(complete.body.reward.skinFragment).toBe("dream_interview_rare");

    const userId = await getUserId(telegramId);
    const progression = await testPool.query(
      `SELECT inventory FROM progression WHERE user_id = $1`,
      [userId],
    );
    expect(progression.rows[0].inventory.fragment_dream_interview_rare).toBe(1);
  });

  test("Architectural Committee complete: success earns architect_winner achievement", async () => {
    const telegramId = 880005;
    const initData = createInitData(telegramId, { username: "architect_winner" });
    await server.request("/api/state", { headers: { "X-Telegram-Init-Data": initData } });
    const userId = await setUserLevel(telegramId, 280); // rank 1, level 8

    const complete = await server.request("/api/minigame/complete", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: { gameType: "architectural_committee", score: 1 },
    });

    expect(complete.status).toBe(200);
    expect(complete.body.success).toBe(true);
    await expect(getUserAchievementSlugs(userId)).resolves.toContain("architect_winner");
  });

  test("Mini-game failures: third failure earns rubber_duck_unlock achievement", async () => {
    const telegramId = 880006;
    const initData = createInitData(telegramId, { username: "rubber_duck_candidate" });
    await server.request("/api/state", { headers: { "X-Telegram-Init-Data": initData } });
    const userId = await setUserLevel(telegramId, 80); // rank 1, level 4

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const complete = await server.request("/api/minigame/complete", {
        method: "POST",
        headers: { "X-Telegram-Init-Data": initData },
        body: { gameType: "code_review", score: 0 },
      });
      expect(complete.status).toBe(200);
      expect(complete.body.success).toBe(false);

      if (attempt < 3) {
        await testPool.query(
          `UPDATE progression SET minigame_state = '{}'::jsonb WHERE user_id = $1`,
          [userId],
        );
      }
    }

    await expect(getUserAchievementSlugs(userId)).resolves.toContain("rubber_duck_unlock");
  });
});
