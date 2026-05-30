import {
  createInitData,
  ensureTestSchema,
  resetTestDatabase,
  testPool,
  TEST_DATABASE_URL,
} from "./helpers/testDb.js";
import { startTestServer } from "./helpers/testServer.js";
import {
  generateDailyQuests,
  markLoginCompleteInQuestState,
} from "../src/utils/dailyQuests.js";

// ─────────────────────────────────────────────────────────────────────────────
// Pure unit tests — run everywhere (no DB required).
//
// These lock the SSOT contract for the login quest: marking it complete is
// idempotent and must NEVER reset `claimed` (which would re-open a claimed
// reward and enable a double grant).
// ─────────────────────────────────────────────────────────────────────────────
describe("markLoginCompleteInQuestState (pure SSOT helper)", () => {
  function freshState() {
    return {
      lastDate: "2026-05-30",
      quests: generateDailyQuests("42", "2026-05-30", 1, 7, 20000),
      fullClearClaimed: false,
    };
  }

  test("flips q_login.completed=true and reports changed", () => {
    const { state, changed } = markLoginCompleteInQuestState(freshState());
    const login = state.quests.find((q) => q.id === "q_login");
    expect(changed).toBe(true);
    expect(login.completed).toBe(true);
    expect(login.progress).toBe(login.target);
  });

  test("is idempotent — second call reports no change", () => {
    const first = markLoginCompleteInQuestState(freshState());
    const second = markLoginCompleteInQuestState(first.state);
    expect(second.changed).toBe(false);
    expect(second.state.quests.find((q) => q.id === "q_login").completed).toBe(true);
  });

  test("never resets a claimed login quest (no double reward)", () => {
    const base = freshState();
    base.quests = base.quests.map((q) =>
      q.id === "q_login"
        ? { ...q, progress: q.target, completed: true, claimed: true }
        : q
    );
    const { state, changed } = markLoginCompleteInQuestState(base);
    const login = state.quests.find((q) => q.id === "q_login");
    expect(changed).toBe(false);
    expect(login.claimed).toBe(true);
    expect(login.completed).toBe(true);
  });

  test("does not touch other quests", () => {
    const { state } = markLoginCompleteInQuestState(freshState());
    const others = state.quests.filter((q) => q.id !== "q_login");
    expect(others.every((q) => q.completed === false)).toBe(true);
  });

  test("tolerates malformed state without throwing", () => {
    expect(markLoginCompleteInQuestState(null).changed).toBe(false);
    expect(markLoginCompleteInQuestState({}).changed).toBe(false);
    expect(markLoginCompleteInQuestState({ quests: "nope" }).changed).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration test — requires TEST_DATABASE_URL.
//
// Reproduces the original desync: /api/state "closed" the login quest only in
// the SQL `daily_quests` mirror, while /api/quests/daily (reading the JSONB
// SSOT) still reported q_login.completed=false. After the fix both endpoints
// agree because /api/state writes completion into the JSONB SSOT.
// ─────────────────────────────────────────────────────────────────────────────
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

async function getUserId(telegramId) {
  const result = await testPool.query(
    `SELECT id FROM users WHERE telegram_id = $1`,
    [telegramId]
  );
  return result.rows[0].id;
}

function loginQuestOf(payload) {
  const quests = payload?.quests || payload?.daily?.quests || [];
  return quests.find((q) => q.id === "q_login" || q.type === "login");
}

describeIfDb("login quest SSOT sync between /api/state and /api/quests/daily", () => {
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

  test("q_login.completed is true in BOTH endpoints after login", async () => {
    const initData = createInitData(880001, { username: "login_sync" });

    // /api/state performs the login (closes the login quest).
    const stateRes = await server.request("/api/state?timezoneOffset=180", {
      headers: { "X-Telegram-Init-Data": initData },
    });
    expect(stateRes.status).toBe(200);

    const stateLogin = loginQuestOf(stateRes.body?.daily);
    expect(stateLogin).toBeDefined();
    // Pre-fix this was false (state wrote only the SQL mirror).
    expect(stateLogin.completed).toBe(true);

    // /api/quests/daily reads the JSONB SSOT — must agree with /api/state.
    const questsRes = await server.request("/api/quests/daily?timezoneOffset=180", {
      headers: { "X-Telegram-Init-Data": initData },
    });
    expect(questsRes.status).toBe(200);

    const questsLogin = loginQuestOf(questsRes.body);
    expect(questsLogin).toBeDefined();
    expect(questsLogin.completed).toBe(true);

    // Single source of truth: identical completion across endpoints.
    expect(questsLogin.completed).toBe(stateLogin.completed);
  });

  test("login completion is persisted in the JSONB SSOT column", async () => {
    const initData = createInitData(880002, { username: "login_sync_db" });
    await server.request("/api/state?timezoneOffset=180", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    const userId = await getUserId(880002);
    const row = await testPool.query(
      `SELECT daily_quests_state FROM progression WHERE user_id = $1`,
      [userId]
    );
    const login = (row.rows[0].daily_quests_state.quests || []).find(
      (q) => q.id === "q_login"
    );
    expect(login.completed).toBe(true);
  });

  test("repeated /api/state calls do not re-open or duplicate the login quest", async () => {
    const initData = createInitData(880003, { username: "login_sync_idem" });

    await server.request("/api/state?timezoneOffset=180", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    // Claim the login reward via the quests route.
    const claim = await server.request("/api/quests/claim", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: { questId: "q_login", timezoneOffset: 180 },
    });
    expect(claim.status).toBe(200);
    expect(claim.body.claimedCount).toBe(1);

    // A subsequent /api/state must NOT reset claimed → no second reward.
    await server.request("/api/state?timezoneOffset=180", {
      headers: { "X-Telegram-Init-Data": initData },
    });

    const userId = await getUserId(880003);
    const row = await testPool.query(
      `SELECT daily_quests_state FROM progression WHERE user_id = $1`,
      [userId]
    );
    const login = (row.rows[0].daily_quests_state.quests || []).find(
      (q) => q.id === "q_login"
    );
    expect(login.completed).toBe(true);
    expect(login.claimed).toBe(true);

    // Claiming again must be rejected (no double reward).
    const claimAgain = await server.request("/api/quests/claim", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
      body: { questId: "q_login", timezoneOffset: 180 },
    });
    expect(claimAgain.status).toBe(400);
  });
});
