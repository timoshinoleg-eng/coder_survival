/**
 * API Contract Tests — Coder Survival
 *
 * Validates response shapes for all major endpoints.
 * Tests assert structure (keys exist, correct types), not exact values.
 *
 * Uses the project's established integration test helpers.
 * Tests create minimal user data then read API responses — no business logic mutations.
 * Skips gracefully when TEST_DATABASE_URL is not configured.
 */

import {
  createInitData,
  ensureTestSchema,
  resetTestDatabase,
  testPool,
  TEST_DATABASE_URL,
} from "../helpers/testDb.js";
import { startTestServer } from "../helpers/testServer.js";

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

// ══════════════════════════════════════════════════════════════════════
// HTTP endpoint contracts (require test DB)
// ══════════════════════════════════════════════════════════════════════

describeIfDb("API contracts", () => {
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

  // ── Helper: create a user and return initData header ────────────

  function user(telegramId, username) {
    return createInitData(telegramId, { username });
  }

  function auth(initData) {
    return { "X-Telegram-Init-Data": initData };
  }

  // ────────────────────────────────────────────────────────────────
  // GET /api/shop/products — public, no auth
  // ────────────────────────────────────────────────────────────────

  describe("GET /api/shop/products", () => {
    test("returns 200 with products array", async () => {
      const res = await server.request("/api/shop/products");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.products)).toBe(true);
      expect(res.body.products.length).toBeGreaterThan(0);
    });

    test("each product has id, name, stars, category", async () => {
      const res = await server.request("/api/shop/products");
      for (const p of res.body.products) {
        expect(typeof p.id).toBe("string");
        expect(typeof p.name).toBe("string");
        expect(typeof p.stars).toBe("number");
        expect(typeof p.category).toBe("string");
      }
    });

    test("known products exist: energy_refill, coffee_break, premium_pass", async () => {
      const res = await server.request("/api/shop/products");
      const ids = res.body.products.map((p) => p.id);
      expect(ids).toContain("energy_refill");
      expect(ids).toContain("coffee_break");
      expect(ids).toContain("premium_pass");
    });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /api/state — auth required
  // ────────────────────────────────────────────────────────────────

  describe("GET /api/state", () => {
    test("returns 200 with user, progression, game objects", async () => {
      const initData = user(880001, "contract_state");
      const res = await server.request("/api/state?timezoneOffset=180", {
        headers: auth(initData),
      });
      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.progression).toBeDefined();
      expect(res.body.game).toBeDefined();
    });

    test("user has id (number), telegramId (number), username (string)", async () => {
      const initData = user(880002, "contract_user_shape");
      const res = await server.request("/api/state?timezoneOffset=180", {
        headers: auth(initData),
      });
      expect(typeof res.body.user.id).toBe("number");
      expect(typeof res.body.user.telegramId).toBe("number");
      expect(typeof res.body.user.username).toBe("string");
    });

    test("progression has energy, depressionLevel, tier, streakDays", async () => {
      const initData = user(880003, "contract_prog_shape");
      const res = await server.request("/api/state?timezoneOffset=180", {
        headers: auth(initData),
      });
      const p = res.body.progression;
      expect(typeof p.energy).toBe("number");
      expect(typeof p.depressionLevel).toBe("number");
      expect(typeof p.tier).toBe("number");
      expect(typeof p.commitsTotal).toBe("number");
      expect(typeof p.commitsCurrent).toBe("number");
      expect(typeof p.streakDays).toBe("number");
    });

    test("game has energy, depression_level, streak_days (snake_case)", async () => {
      const initData = user(880004, "contract_game_shape");
      const res = await server.request("/api/state?timezoneOffset=180", {
        headers: auth(initData),
      });
      const g = res.body.game;
      expect(typeof g.energy).toBe("number");
      expect(typeof g.depression_level).toBe("number");
      expect(typeof g.streak_days).toBe("number");
    });

    test("level and prestige objects present", async () => {
      const initData = user(880005, "contract_level");
      const res = await server.request("/api/state?timezoneOffset=180", {
        headers: auth(initData),
      });
      expect(res.body.level).toBeDefined();
      expect(res.body.prestige).toBeDefined();
      expect(typeof res.body.prestige.level).toBe("number");
      expect(typeof res.body.prestige.currency).toBe("number");
    });

    test("serverNow is valid ISO timestamp", async () => {
      const initData = user(880006, "contract_time");
      const res = await server.request("/api/state?timezoneOffset=180", {
        headers: auth(initData),
      });
      expect(typeof res.body.serverNow).toBe("string");
      expect(new Date(res.body.serverNow).getTime()).not.toBeNaN();
    });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /api/pass — auth required
  // ────────────────────────────────────────────────────────────────

  describe("GET /api/pass", () => {
    test("returns 200 with success", async () => {
      const initData = user(880010, "contract_pass");
      await server.request("/api/state?timezoneOffset=180", {
        headers: auth(initData),
      });
      const res = await server.request("/api/pass", {
        headers: auth(initData),
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test("has status (object or null) and weekendDoubleXpActive (boolean)", async () => {
      const initData = user(880011, "contract_pass2");
      await server.request("/api/state?timezoneOffset=180", {
        headers: auth(initData),
      });
      const res = await server.request("/api/pass", {
        headers: auth(initData),
      });
      if (res.body.status !== null) {
        expect(typeof res.body.status).toBe("object");
      }
      expect(typeof res.body.weekendDoubleXpActive).toBe("boolean");
    });

    test("has catchUp field", async () => {
      const initData = user(880012, "contract_pass3");
      await server.request("/api/state?timezoneOffset=180", {
        headers: auth(initData),
      });
      const res = await server.request("/api/pass", {
        headers: auth(initData),
      });
      expect("catchUp" in res.body).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /api/event/active — auth optional
  // ────────────────────────────────────────────────────────────────

  describe("GET /api/event/active", () => {
    test("returns 200 with success and event (object|null)", async () => {
      const res = await server.request("/api/event/active");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const ev = res.body.event;
      expect(ev === null || typeof ev === "object").toBe(true);
    });

    test("if event exists, has id and type", async () => {
      const res = await server.request("/api/event/active");
      if (res.body.event !== null) {
        expect(res.body.event.id).toBeDefined();
        expect(res.body.event.type).toBeDefined();
      }
    });

    test("myContribution key always present", async () => {
      const res = await server.request("/api/event/active");
      expect("myContribution" in res.body).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /api/quests — auth required
  // ────────────────────────────────────────────────────────────────

  describe("GET /api/quests", () => {
    test("returns 200 with quests array and daily summary", async () => {
      const initData = user(880020, "contract_quests");
      await server.request("/api/state?timezoneOffset=180", {
        headers: auth(initData),
      });
      const res = await server.request("/api/quests?timezoneOffset=180", {
        headers: auth(initData),
      });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.quests)).toBe(true);
      expect(res.body.daily).toBeDefined();
      expect(typeof res.body.daily.total).toBe("number");
      expect(typeof res.body.daily.completed).toBe("number");
    });

    test("each quest has type, target, progress", async () => {
      const initData = user(880021, "contract_quests2");
      await server.request("/api/state?timezoneOffset=180", {
        headers: auth(initData),
      });
      const res = await server.request("/api/quests?timezoneOffset=180", {
        headers: auth(initData),
      });
      for (const q of res.body.quests) {
        expect(typeof q.type).toBe("string");
        expect(typeof q.target).toBe("number");
        expect(typeof q.progress).toBe("number");
      }
    });

    test("date is YYYY-MM-DD string", async () => {
      const initData = user(880022, "contract_quests3");
      await server.request("/api/state?timezoneOffset=180", {
        headers: auth(initData),
      });
      const res = await server.request("/api/quests?timezoneOffset=180", {
        headers: auth(initData),
      });
      expect(typeof res.body.date).toBe("string");
      expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════
// Economy Constants — regression (no DB needed)
// ══════════════════════════════════════════════════════════════════════

describe("Economy Constants — regression", () => {
  let TAP_MECHANICS;
  let DEPRESSION_SCALE;
  let STAGE2;
  let shopCatalog;

  beforeAll(async () => {
    const balance = await import("../../src/config/balance.js");
    TAP_MECHANICS = balance.TAP_MECHANICS;
    DEPRESSION_SCALE = balance.DEPRESSION_SCALE;
    STAGE2 = balance.STAGE2;
    shopCatalog = await import("../../src/utils/shopCatalog.js");
  });

  test("depressionRecoveryPerEnergy is 5", () => {
    expect(TAP_MECHANICS.depressionRecoveryPerEnergy).toBe(5);
  });

  test("max depression (heart attack threshold) is 200", () => {
    expect(TAP_MECHANICS.maxDepression).toBe(200);
    expect(DEPRESSION_SCALE.HEART_ATTACK_THRESHOLD).toBe(200);
  });

  test("depression scale MAX is 200", () => {
    expect(DEPRESSION_SCALE.MAX).toBe(200);
  });

  test("affliction threshold is 100", () => {
    expect(DEPRESSION_SCALE.AFFLICTION_THRESHOLD).toBe(100);
  });

  test("max energy is 100", () => {
    expect(TAP_MECHANICS.maxEnergy).toBe(100);
  });

  test("depression gain per tap is 0.5", () => {
    expect(TAP_MECHANICS.depressionGainPerTap).toBe(0.5);
  });

  test("crit silver chance is 0.15", () => {
    expect(TAP_MECHANICS.critSilverChance).toBe(0.15);
  });

  test("crit gold chance is 0.05", () => {
    expect(TAP_MECHANICS.critGoldChance).toBe(0.05);
  });

  test("streak bonus cap is 0.20", () => {
    expect(TAP_MECHANICS.streakBonusCap).toBe(0.20);
  });

  test("pass max level is 50 with 50 entries", () => {
    expect(STAGE2.PASS.MAX_LEVEL).toBe(50);
    expect(STAGE2.PASS.LEVELS.length).toBe(50);
  });

  test("pass levels have level + requiredXp", () => {
    for (const lv of STAGE2.PASS.LEVELS) {
      expect(typeof lv.level).toBe("number");
      expect(typeof lv.requiredXp).toBe("number");
      expect(lv.requiredXp).toBeGreaterThan(0);
    }
  });

  test("total pass XP sums to 10000", () => {
    const total = STAGE2.PASS.LEVELS.reduce((s, l) => s + l.requiredXp, 0);
    expect(total).toBe(10000);
  });

  test("premium_pass costs 499 stars in shop catalog", () => {
    const p = shopCatalog.getProductById("premium_pass");
    expect(p).not.toBeNull();
    expect(p.stars).toBe(499);
  });

  test("energy_refill costs 10 stars in shop catalog", () => {
    const p = shopCatalog.getProductById("energy_refill");
    expect(p).not.toBeNull();
    expect(p.stars).toBe(10);
  });
});
