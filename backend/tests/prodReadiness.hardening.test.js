import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  createInitData,
  ensureTestSchema,
  resetTestDatabase,
  testPool,
  TEST_DATABASE_URL,
} from "./helpers/testDb.js";
import { startTestServer } from "./helpers/testServer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

// Regression tests for the production-readiness hardening pass:
//  - admin API auth (season rotation must not be anonymous)
//  - /api/shop now requires Telegram initData
//  - the client-writable XP mint endpoint was removed
//  - git_push_force booster respects the prestige LOC gate
//  - event reward claim is idempotent under concurrency
//  - migrations bootstrap a fresh DB and re-running is a no-op
describeIfDb("prod-readiness hardening", () => {
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

  async function seedUserWithProgression(telegramId, progression = {}) {
    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, `u_${telegramId}`],
    );
    const userId = userResult.rows[0].id;
    const cols = { energy: 100, depression_level: 0, commits_total: 0, ...progression };
    const keys = Object.keys(cols);
    const placeholders = keys.map((_, i) => `$${i + 2}`).join(", ");
    await testPool.query(
      `INSERT INTO progression (user_id, ${keys.join(", ")}) VALUES ($1, ${placeholders})`,
      [userId, ...keys.map((k) => cols[k])],
    );
    return userId;
  }

  describe("admin API authentication", () => {
    const originalSecret = process.env.ADMIN_API_SECRET;
    afterAll(() => {
      if (originalSecret === undefined) delete process.env.ADMIN_API_SECRET;
      else process.env.ADMIN_API_SECRET = originalSecret;
    });

    test("rejects anonymous access to season status/rotate", async () => {
      process.env.ADMIN_API_SECRET = "unit-admin-secret";
      const noHeader = await server.request("/api/admin/season/status");
      expect(noHeader.status).toBe(401);

      const wrong = await server.request("/api/admin/season/status", {
        headers: { "X-Admin-Secret": "nope" },
      });
      expect(wrong.status).toBe(401);

      const rotate = await server.request("/api/admin/season/rotate", {
        method: "POST",
        body: {},
      });
      expect(rotate.status).toBe(401);
    });

    test("allows access with the correct admin secret", async () => {
      process.env.ADMIN_API_SECRET = "unit-admin-secret";
      const ok = await server.request("/api/admin/season/status", {
        headers: { "X-Admin-Secret": "unit-admin-secret" },
      });
      expect(ok.status).toBe(200);
      expect(ok.body.success).toBe(true);
    });

    test("fails closed (503) when no admin secret is configured", async () => {
      delete process.env.ADMIN_API_SECRET;
      const res = await server.request("/api/admin/season/status");
      expect(res.status).toBe(503);
    });
  });

  describe("shop auth model: public catalog, authenticated mutations", () => {
    test("GET /api/shop/products is a public read (200, no auth)", async () => {
      const anon = await server.request("/api/shop/products");
      expect(anon.status).toBe(200);
      expect(Array.isArray(anon.body.products)).toBe(true);
    });

    test("POST /api/shop/purchase-deal requires initData (401 without)", async () => {
      const anon = await server.request("/api/shop/purchase-deal", {
        method: "POST",
        body: { dealType: "daily_deal" },
      });
      expect(anon.status).toBe(401);
    });
  });

  describe("client XP mint endpoint removed", () => {
    test("POST /api/player/level/xp is gone (410, no XP minted)", async () => {
      const res = await server.request("/api/player/level/xp", {
        method: "POST",
        headers: { "X-Telegram-Init-Data": createInitData(900100002) },
        body: { amount: 1000000, source: "tap" },
      });
      expect(res.status).toBe(410);
    });
  });

  describe("git_push_force booster respects prestige LOC gate", () => {
    test("rejects purchase below 1,000,000 lifetime LOC and does not spend stars", async () => {
      const telegramId = 900100003;
      const userId = await seedUserWithProgression(telegramId, {
        stars: 100,
        lifetime_loc: 0,
        commits_total: 0,
      });

      const res = await server.request("/api/boosters/purchase", {
        method: "POST",
        headers: { "X-Telegram-Init-Data": createInitData(telegramId) },
        body: { boosterSlug: "git_push_force" },
      });
      expect(res.status).toBe(409);
      expect(res.body.requiredLoc).toBe(1000000);

      const stars = await testPool.query(
        `SELECT stars FROM progression WHERE user_id = $1`,
        [userId],
      );
      expect(Number(stars.rows[0].stars)).toBe(100); // rolled back, not spent
    });

    test("allows purchase once the LOC gate is met", async () => {
      const telegramId = 900100004;
      await seedUserWithProgression(telegramId, {
        stars: 100,
        lifetime_loc: 1000000,
        commits_total: 1000000,
      });

      const res = await server.request("/api/boosters/purchase", {
        method: "POST",
        headers: { "X-Telegram-Init-Data": createInitData(telegramId) },
        body: { boosterSlug: "git_push_force" },
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("event reward claim is idempotent under concurrency", () => {
    test("two concurrent claims credit exactly once", async () => {
      const telegramId = 900100005;
      const userId = await seedUserWithProgression(telegramId, { energy: 10 });

      const eventResult = await testPool.query(
        `INSERT INTO events (event_type, title, description, start_date, end_date, target_commits, reward_payload, is_active)
         VALUES ('hackathon', 'Test Event', 'x', CURRENT_DATE - 1, CURRENT_DATE + 1, 5, '{"energy": 25}'::jsonb, TRUE)
         RETURNING id`,
      );
      const eventId = eventResult.rows[0].id;
      await testPool.query(
        `INSERT INTO event_contributions (user_id, event_id, commits_contributed, claimed)
         VALUES ($1, $2, 10, FALSE)`,
        [userId, eventId],
      );

      const headers = { "X-Telegram-Init-Data": createInitData(telegramId) };
      const [a, b] = await Promise.all([
        server.request("/api/event/claim", { method: "POST", headers, body: {} }),
        server.request("/api/event/claim", { method: "POST", headers, body: {} }),
      ]);

      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 409]); // exactly one success

      const claimed = await testPool.query(
        `SELECT claimed FROM event_contributions WHERE user_id = $1 AND event_id = $2`,
        [userId, eventId],
      );
      expect(claimed.rows[0].claimed).toBe(true);
    });
  });

  describe("migrations are reproducible and idempotent", () => {
    test("re-running ensureTestSchema is a no-op and every migration is recorded", async () => {
      const migrationsDir = path.resolve(__dirname, "../migrations");
      const fileCount = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql")).length;

      // Re-run must not throw (idempotent skip of already-applied migrations).
      await expect(ensureTestSchema()).resolves.toBeUndefined();

      const applied = await testPool.query(`SELECT COUNT(*)::int AS n FROM schema_migrations`);
      expect(applied.rows[0].n).toBe(fileCount);
    });
  });
});
