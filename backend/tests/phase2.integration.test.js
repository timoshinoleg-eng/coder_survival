import { jest } from "@jest/globals";
import { createInitData, ensureTestSchema, resetTestDatabase, testPool, TEST_DATABASE_URL } from "./helpers/testDb.js";
import { startTestServer } from "./helpers/testServer.js";

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb("phase2 integration", () => {
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

  test("/api/state binds referral from start_param idempotently", async () => {
    const referrer = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [700001, "referrer"],
    );

    const headers = {
      "X-Telegram-Init-Data": createInitData(700002, {
        username: "referred",
        startParam: "ref_700001",
      }),
    };

    const first = await server.request("/api/state", { headers });
    expect(first.status).toBe(200);

    const referralsAfterFirst = await testPool.query(
      `SELECT referrer_id, referred_id, status FROM referrals`,
    );
    expect(referralsAfterFirst.rows).toHaveLength(1);
    expect(referralsAfterFirst.rows[0].referrer_id).toBe(referrer.rows[0].id);
    expect(referralsAfterFirst.rows[0].status).toBe("pending");

    const second = await server.request("/api/state", { headers });
    expect(second.status).toBe(200);

    const referralsAfterSecond = await testPool.query(
      `SELECT COUNT(*)::int AS cnt FROM referrals`,
    );
    expect(referralsAfterSecond.rows[0].cnt).toBe(1);
  });

  test("/api/team-battle/claim rejects duplicate claim with 409", async () => {
    const initData = createInitData(710001, { username: "claimer" });
    const stateResponse = await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });
    expect(stateResponse.status).toBe(200);

    const userResult = await testPool.query(
      `SELECT id FROM users WHERE telegram_id = $1`,
      [710001],
    );
    const userId = userResult.rows[0].id;

    const teamResult = await testPool.query(
      `INSERT INTO teams (name, invite_code) VALUES ($1, $2) RETURNING id`,
      ["Winners", "WINNER1"],
    );
    const teamId = teamResult.rows[0].id;

    await testPool.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'leader')`,
      [teamId, userId],
    );

    const seasonResult = await testPool.query(
      `INSERT INTO team_battle_seasons (season_number, start_date, end_date, target_commits, reward_payload, status)
       VALUES (1, NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day', 10, '{"energy": 5}'::jsonb, 'active')
       RETURNING id`,
    );
    const seasonId = seasonResult.rows[0].id;

    await testPool.query(
      `INSERT INTO team_battle_contributions (season_id, team_id, user_id, commits_contributed, updated_at)
       VALUES ($1, $2, $3, 10, NOW())`,
      [seasonId, teamId, userId],
    );

    const firstClaim = await server.request("/api/team-battle/claim", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
    });
    expect(firstClaim.status).toBe(200);
    expect(firstClaim.body?.success).toBe(true);

    const secondClaim = await server.request("/api/team-battle/claim", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
    });
    expect(secondClaim.status).toBe(409);
    expect(secondClaim.body?.error).toBe("Reward already claimed");

    const claims = await testPool.query(
      `SELECT COUNT(*)::int AS cnt FROM team_battle_reward_claims WHERE season_id = $1 AND user_id = $2`,
      [seasonId, userId],
    );
    expect(claims.rows[0].cnt).toBe(1);
  });

  test("/api/state grants first login reward to a new user", async () => {
    const response = await server.request("/api/state", {
      headers: {
        "X-Telegram-Init-Data": createInitData(720001, { username: "login_new" }),
      },
    });

    expect(response.status).toBe(200);
    expect(response.body?.loginReward?.claimed).toBe(true);
    expect(response.body?.loginReward?.streak).toBe(1);
    expect(response.body?.loginReward?.reward).toEqual(
      expect.objectContaining({ energy: expect.any(Number) }),
    );
  });

  test("/api/tap keeps burnout as a soft penalty state", async () => {
    const initData = createInitData(730001, { username: "burned_out" });

    const stateResponse = await server.request("/api/state", {
      headers: { "X-Telegram-Init-Data": initData },
    });
    expect(stateResponse.status).toBe(200);

    const userResult = await testPool.query(
      `SELECT id FROM users WHERE telegram_id = $1`,
      [730001],
    );
    const userId = userResult.rows[0].id;

    await testPool.query(
      `UPDATE progression
       SET is_burnout = TRUE,
           energy = 80,
           depression_level = 200
       WHERE user_id = $1`,
      [userId],
    );

    // Determinism: at exactly maxDepression a *crit* tap applies a −5 relief
    // (after the cap), dropping the player just below the burnout threshold on
    // ~20% of taps and flaking this assertion. Suppress RNG so no crit fires —
    // this test covers the normal-tap "stays burned out" path, not crit relief.
    // (The test server runs in-process, so this spy reaches the tap route.)
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      const burnoutTap = await server.request("/api/tap", {
        method: "POST",
        headers: { "X-Telegram-Init-Data": initData },
        body: {},
      });
      expect(burnoutTap.status).toBe(200);
      expect(burnoutTap.body?.isBurnout).toBe(true);
      expect(burnoutTap.body?.commitsDelta).toBeGreaterThanOrEqual(1);

      const stateAfterBurnoutTap = await server.request("/api/state", {
        headers: { "X-Telegram-Init-Data": initData },
      });
      expect(stateAfterBurnoutTap.status).toBe(200);
      expect(stateAfterBurnoutTap.body?.isBurnout).toBe(true);
    } finally {
      randomSpy.mockRestore();
    }
  });
});
