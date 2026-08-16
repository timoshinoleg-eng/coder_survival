import { createInitData, ensureTestSchema, resetTestDatabase, testPool, TEST_DATABASE_URL } from "./helpers/testDb.js";
import { startTestServer } from "./helpers/testServer.js";

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

async function bootstrapRewardUser(server, telegramId, username) {
  const initData = createInitData(telegramId, { username });
  const state = await server.request("/api/state", {
    headers: { "X-Telegram-Init-Data": initData },
  });
  expect(state.status).toBe(200);
  await testPool.query(
    `UPDATE progression
     SET created_at = NOW() - INTERVAL '2 hours', energy = 1
     WHERE user_id = (SELECT id FROM users WHERE telegram_id = $1)`,
    [telegramId],
  );
  // rewards FTUE gates read users.created_at (not progression), so backdate
  // it too — otherwise the first claim hits the no_ads_shown window and 403s.
  await testPool.query(
    `UPDATE users SET created_at = NOW() - INTERVAL '2 hours' WHERE telegram_id = $1`,
    [telegramId],
  );
  return initData;
}

async function createMockSession(server, initData) {
  const response = await server.request("/api/rewards/ad-session", {
    method: "POST",
    headers: { "X-Telegram-Init-Data": initData },
    body: { provider: "mock" },
  });
  expect(response.status).toBe(200);
  expect(response.body?.nonce).toEqual(expect.any(String));
  expect(response.body?.provider).toBe("mock");
  return response.body;
}

describeIfDb("secure rewarded ads and Coffee Coins", () => {
  let server;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.ENABLE_MOCK_REWARDED_ADS = "true";
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

  test("legacy client-complete endpoint is disabled outside QA", async () => {
    const initData = await bootstrapRewardUser(server, 760001, "rewarded_legacy_disabled");
    const response = await server.request("/api/rewarded-video/complete", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: { timezoneOffset: 180 },
    });
    expect(response.status).toBe(410);
    expect(response.body?.error).toMatch(/Legacy rewarded-video endpoint disabled/);
  });

  test("validated claim grants energy and exactly one Coffee Coin, then is idempotently rejected", async () => {
    const telegramId = 760002;
    const initData = await bootstrapRewardUser(server, telegramId, "rewarded_secure_claim");
    const session = await createMockSession(server, initData);

    const claim = await server.request("/api/rewards/ad-claim", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: { nonce: session.nonce, provider: "mock", proof: {} },
    });
    expect(claim.status).toBe(200);
    expect(claim.body?.success).toBe(true);
    expect(Number(claim.body?.reward?.energy)).toBeGreaterThan(0);
    expect(claim.body?.reward?.coffeeCoins).toBe(1);

    const replay = await server.request("/api/rewards/ad-claim", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: { nonce: session.nonce, provider: "mock", proof: {} },
    });
    expect(replay.status).toBe(409);

    const userResult = await testPool.query(
      `SELECT id FROM users WHERE telegram_id = $1`,
      [telegramId],
    );
    const progressionResult = await testPool.query(
      `SELECT energy, inventory FROM progression WHERE user_id = $1`,
      [userResult.rows[0].id],
    );
    expect(Number(progressionResult.rows[0].energy)).toBeGreaterThan(1);
    expect(Number(progressionResult.rows[0].inventory?.coffee_coins || 0)).toBe(1);
  });

  test("secure claim rejects a nonce issued to another user", async () => {
    const ownerInitData = await bootstrapRewardUser(server, 760006, "rewarded_nonce_owner");
    const attackerInitData = await bootstrapRewardUser(server, 760007, "rewarded_nonce_attacker");
    const session = await createMockSession(server, ownerInitData);

    const claim = await server.request("/api/rewards/ad-claim", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": attackerInitData },
      body: { nonce: session.nonce, provider: "mock", proof: {} },
    });

    expect(claim.status).toBe(403);
    expect(claim.body?.error).toBe("Nonce does not belong to user");
  });

  test("concurrent secure claims allow exactly one first reward during cooldown", async () => {
    const initData = await bootstrapRewardUser(server, 760004, "rewarded_concurrent_claim");
    const sessions = await Promise.all([
      createMockSession(server, initData),
      createMockSession(server, initData),
      createMockSession(server, initData),
    ]);
    const claims = await Promise.all(sessions.map((session) => server.request("/api/rewards/ad-claim", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: { nonce: session.nonce, provider: "mock", proof: {} },
    })));

    expect(claims.filter((response) => response.status === 200)).toHaveLength(1);
    expect(claims.filter((response) => response.status === 429)).toHaveLength(2);
  });

  test("Coffee Coins unlock a cosmetic skin without gameplay rewards or duplicate charges", async () => {
    const telegramId = 760005;
    const initData = await bootstrapRewardUser(server, telegramId, "coffee_cosmetic_unlock");
    await testPool.query(
      `UPDATE progression
       SET inventory = jsonb_set(COALESCE(inventory, '{}'::jsonb), '{coffee_coins}', '3'::jsonb, TRUE)
       WHERE user_id = (SELECT id FROM users WHERE telegram_id = $1)`,
      [telegramId],
    );

    const unlock = await server.request("/api/skins/unlock-coffee", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: { skinId: "coffee_debugger" },
    });
    expect(unlock.status).toBe(200);
    expect(unlock.body?.success).toBe(true);
    expect(unlock.body?.cost).toBe(3);
    expect(unlock.body?.coffeeCoins).toBe(0);
    expect(unlock.body?.skins?.unlocked).toContain("coffee_debugger");

    const duplicate = await server.request("/api/skins/unlock-coffee", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: { skinId: "coffee_debugger" },
    });
    expect(duplicate.status).toBe(409);
  });

  test("reward status reads the secure reward ledger and Coffee Coin spend is atomic", async () => {
    const telegramId = 760003;
    const initData = await bootstrapRewardUser(server, telegramId, "rewarded_status_coin_spend");
    const session = await createMockSession(server, initData);
    const claim = await server.request("/api/rewards/ad-claim", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: { nonce: session.nonce, provider: "mock", proof: {} },
    });
    expect(claim.status).toBe(200);

    const status = await server.request("/api/rewards/status", {
      headers: { "X-Telegram-Init-Data": initData },
    });
    expect(status.status).toBe(200);
    expect(status.body?.countToday).toBe(1);
    expect(status.body?.remainingToday).toBeLessThan(status.body?.dailyLimit);

    const spend = await server.request("/api/coffee/coins", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
    });
    expect(spend.status).toBe(200);
    expect(spend.body?.success).toBe(true);
    expect(spend.body?.coffeeCoins).toBe(0);
    expect(Number(spend.body?.restored)).toBeGreaterThan(0);

    const secondSpend = await server.request("/api/coffee/coins", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
    });
    expect(secondSpend.status).toBe(409);
  });
});
