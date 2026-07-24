import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ensureTestSchema, testPool, TEST_DATABASE_URL } from "./helpers/testDb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

// Semantic regression tests for the migration-built schema, guarding the
// 058_reconcile_achievement_catalog fix: the 053 rebuild dropped the
// `condition` column and lost eight achievements originally seeded by
// 026/031/033. These tests assert the catalog CONTENT after a full bootstrap,
// not just that migrations "ran".
const RESTORED_SLUGS = [
  "burnout_first",
  "coffee_addict",
  "meme_lord",
  "bug_hunter",
  "referral_god",
  "prod_survivor",
  "architect_winner",
  "rubber_duck_unlock",
];

// Sample of the canonical 053 catalog that must coexist with the restored set.
const CANONICAL_SAMPLE = ["hello_world", "first_commit", "tech_lead", "founder", "night_owl"];

describeIfDb("migration catalog semantics (058 reconcile)", () => {
  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    await ensureTestSchema();
  });

  afterAll(async () => {
    if (testPool) await testPool.end();
  });

  test("every migration file is recorded exactly once in schema_migrations", async () => {
    const migrationsDir = path.resolve(__dirname, "../migrations");
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    const rows = await testPool.query(
      `SELECT COUNT(*)::int AS n, COUNT(DISTINCT filename)::int AS d FROM schema_migrations`,
    );
    expect(rows.rows[0].n).toBe(files.length);
    expect(rows.rows[0].d).toBe(files.length);
  });

  test("achievements catalog contains canonical + restored slugs with no duplicates", async () => {
    const counts = await testPool.query(
      `SELECT COUNT(*)::int AS total, COUNT(DISTINCT slug)::int AS distinct FROM achievements`,
    );
    expect(counts.rows[0].total).toBe(counts.rows[0].distinct); // no dupes
    expect(counts.rows[0].total).toBeGreaterThanOrEqual(29); // 21 canonical + 8 restored

    const present = await testPool.query(`SELECT slug FROM achievements`);
    const slugs = new Set(present.rows.map((r) => r.slug));
    for (const slug of [...RESTORED_SLUGS, ...CANONICAL_SAMPLE]) {
      expect(slugs.has(slug)).toBe(true);
    }
  });

  test("condition column exists and is populated where required", async () => {
    const col = await testPool.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.columns
       WHERE table_name = 'achievements' AND column_name = 'condition'`,
    );
    expect(col.rows[0].n).toBe(1);

    const architect = await testPool.query(
      `SELECT condition->>'gameType' AS game_type FROM achievements WHERE slug = 'architect_winner'`,
    );
    expect(architect.rows[0]?.game_type).toBe("architectural_committee");

    const duck = await testPool.query(
      `SELECT condition->>'period' AS period, condition->>'hidden' AS hidden, is_secret
       FROM achievements WHERE slug = 'rubber_duck_unlock'`,
    );
    expect(duck.rows[0]?.period).toBe("day");
    expect(duck.rows[0]?.hidden).toBe("true");
    expect(duck.rows[0]?.is_secret).toBe(true);
  });

  test("restored achievements carry valid catalog metadata", async () => {
    const rows = await testPool.query(
      `SELECT slug, category, rarity, trigger_type, criteria, reward
       FROM achievements WHERE slug = ANY($1)`,
      [RESTORED_SLUGS],
    );
    expect(rows.rows.length).toBe(RESTORED_SLUGS.length);
    for (const r of rows.rows) {
      expect(r.category).toBe("special");
      expect(["rare", "epic", "legendary"]).toContain(r.rarity);
      expect(r.trigger_type).toBe("special");
      expect(r.criteria).toBeTruthy();
      expect(r.reward).toBeTruthy();
    }
  });

  test("re-running all migrations is a no-op and preserves catalog + earned progress", async () => {
    // Simulate earned progress that a reconcile must never destroy.
    const user = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES (920001, 'catalog_guard') RETURNING id`,
    );
    const ach = await testPool.query(`SELECT id FROM achievements WHERE slug = 'architect_winner'`);
    await testPool.query(
      `INSERT INTO user_achievements (user_id, achievement_id, earned_at, source)
       VALUES ($1, $2, NOW(), 'runtime')
       ON CONFLICT (user_id, achievement_id) DO NOTHING`,
      [user.rows[0].id, ach.rows[0].id],
    );

    const before = await testPool.query(
      `SELECT (SELECT COUNT(*)::int FROM achievements) AS achievements,
              (SELECT COUNT(*)::int FROM schema_migrations) AS migrations`,
    );

    await expect(ensureTestSchema()).resolves.toBeUndefined(); // re-run: must not throw

    const after = await testPool.query(
      `SELECT (SELECT COUNT(*)::int FROM achievements) AS achievements,
              (SELECT COUNT(*)::int FROM schema_migrations) AS migrations`,
    );
    expect(after.rows[0]).toEqual(before.rows[0]);

    const earned = await testPool.query(
      `SELECT ua.id FROM user_achievements ua
       JOIN achievements a ON a.id = ua.achievement_id
       WHERE a.slug = 'architect_winner' AND ua.user_id = $1`,
      [user.rows[0].id],
    );
    expect(earned.rows.length).toBe(1);
  });
});
