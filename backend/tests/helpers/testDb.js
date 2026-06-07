import fs from "fs";
import path from "path";
import pg from "pg";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const { Pool } = pg;

// Load .env before any env var reads
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function buildTestDatabaseUrl() {
  const envUrl = process.env.TEST_DATABASE_URL || "";
  // If TEST_DATABASE_URL is set and doesn't contain masked password, use it directly
  if (envUrl && !envUrl.includes(":***@")) {
    return envUrl;
  }
  // Otherwise build from individual DB_* vars (avoids dotenv mask overwriting PowerShell env)
  const host = process.env.DB_HOST || "localhost";
  const port = process.env.DB_PORT || "5432";
  const database = process.env.DB_NAME?.includes("test") ? process.env.DB_NAME : (process.env.DB_DATABASE || "coder_survival_test");
  const user = process.env.DB_USER || process.env.DB_USERNAME || "postgres";
  const password = process.env.DB_PASS || process.env.DB_PASSWORD || "";
  if (!password) {
    return envUrl; // fallback to whatever is there, even if masked
  }
  return "postgresql://" + encodeURIComponent(user) + ":" + encodeURIComponent(password) + "@" + host + ":" + port + "/" + encodeURIComponent(database);
}

export const TEST_DATABASE_URL = buildTestDatabaseUrl();

const migrationsDir = path.resolve(__dirname, "../../migrations");

export const testPool = TEST_DATABASE_URL
  ? new Pool({
      connectionString: TEST_DATABASE_URL,
      ssl: false,
    })
  : null;

import crypto from 'crypto';

export function createInitData(userId, options = {}) {
  const params = new URLSearchParams({
    user: JSON.stringify({
      id: userId,
      username: options.username || `user_${userId}`,
      first_name: options.firstName || "Test",
    }),
    auth_date: String(Math.floor(Date.now() / 1000)),
    ...(options.startParam ? { start_param: options.startParam } : {}),
  });

  const botToken = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    const pairs = [];
    for (const [key, value] of params) {
      pairs.push(`${key}=${value}`);
    }
    pairs.sort((a, b) => {
      const keyA = a.slice(0, a.indexOf('='));
      const keyB = b.slice(0, b.indexOf('='));
      return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
    });
    const dataCheckString = pairs.join('\n');
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    const hash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    params.append('hash', hash);
  }

  return params.toString();
}

export async function ensureTestSchema() {
  if (!testPool) {
    return;
  }

  await testPool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (const file of files) {
    const alreadyApplied = await testPool.query(
      `SELECT 1 FROM schema_migrations WHERE filename = $1`,
      [file],
    );
    if (alreadyApplied.rows.length > 0) {
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await testPool.query("BEGIN");
    try {
      await testPool.query(sql);
      await testPool.query(
        `INSERT INTO schema_migrations (filename) VALUES ($1)`,
        [file],
      );
      await testPool.query("COMMIT");
    } catch (error) {
      await testPool.query("ROLLBACK");
      throw error;
    }
  }

  await seedTestAchievements();
}

export async function resetTestDatabase() {
  if (!testPool) {
    return;
  }

  const result = await testPool.query(`
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname <> 'schema_migrations'
      AND c.relname <> 'achievements'
    ORDER BY c.relname
  `);
  if (result.rows.length === 0) return;

  const tables = result.rows
    .map((row) => `"public"."${String(row.table_name).replaceAll('"', '""')}"`)
    .join(", ");

  await testPool.query("BEGIN");
  try {
    await testPool.query(`SET LOCAL lock_timeout = '5s'`);
    await testPool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
    await testPool.query("COMMIT");
  } catch (error) {
    await testPool.query("ROLLBACK");
    throw error;
  }
}

export async function seedTestAchievements() {
  if (!testPool) return;

  const countResult = await testPool.query(`SELECT COUNT(*) FROM achievements`);
  if (parseInt(countResult.rows[0].count, 10) > 0) {
    return; // already seeded
  }

  await testPool.query(`
    INSERT INTO achievements (slug, name, description, category, rarity, trigger_type, is_progressive, criteria, reward) VALUES
    ('hello_world', 'Hello World', 'Write your first line of code.', 'taps', 'common', 'tap_count', false, '{"target": 1}', '{"coins": 10, "xp": 5}'),
    ('first_commit', 'First Commit', 'Reach 100 lines of code.', 'taps', 'common', 'tap_count', false, '{"target": 100}', '{"coins": 50, "xp": 25}'),
    ('code_monkey', 'Code Monkey', 'Reach 1,000 lines of code.', 'taps', 'common', 'tap_count', false, '{"target": 1000}', '{"coins": 250, "xp": 100}'),
    ('ten_x_dev', '10x Dev', 'Reach 10,000 lines of code.', 'taps', 'rare', 'tap_count', false, '{"target": 10000}', '{"coins": 1500, "xp": 500, "title": "10x Dev"}'),
    ('first_salary', 'First Salary', 'Earn your first 100 coins.', 'coins', 'common', 'coins_balance', false, '{"target": 100}', '{"coins": 50, "xp": 20}'),
    ('paycheck', 'Paycheck', 'Earn 1,000 coins.', 'coins', 'common', 'coins_balance', false, '{"target": 1000}', '{"coins": 150, "xp": 75}'),
    ('startup_exit', 'Startup Exit', 'Earn 100,000 coins.', 'coins', 'rare', 'coins_balance', false, '{"target": 100000}', '{"coins": 3000, "xp": 800}'),
    ('crypto_millionaire', 'Crypto Millionaire', 'Earn 1,000,000 coins.', 'coins', 'legendary', 'coins_balance', false, '{"target": 1000000}', '{"coins": 25000, "xp": 5000, "title": "Crypto Millionaire"}'),
    ('junior_dev', 'Junior Developer', 'Reach 1,000 XP.', 'rank', 'common', 'xp_total', false, '{"target": 1000}', '{"coins": 250, "xp": 100}'),
    ('middle_dev', 'Middle Developer', 'Reach 5,000 XP.', 'rank', 'rare', 'xp_total', false, '{"target": 5000}', '{"coins": 1000, "xp": 250}'),
    ('senior_dev', 'Senior Developer', 'Reach 15,000 XP.', 'rank', 'epic', 'xp_total', false, '{"target": 15000}', '{"coins": 3500, "xp": 1000, "title": "Senior Dev"}'),
    ('tech_lead', 'Tech Lead', 'Reach 50,000 XP.', 'rank', 'legendary', 'xp_total', false, '{"target": 50000}', '{"coins": 10000, "xp": 3000, "title": "Tech Lead"}'),
    ('first_skin', 'New Outfit', 'Unlock your first skin.', 'skins', 'common', 'skins_count', false, '{"target": 1}', '{"coins": 100, "xp": 50}'),
    ('fashion_coder', 'Fashion Coder', 'Unlock 5 skins.', 'skins', 'rare', 'skins_count', false, '{"target": 5}', '{"coins": 1000, "xp": 300}'),
    ('collector', 'Collector', 'Unlock 15 skins.', 'skins', 'epic', 'skins_count', false, '{"target": 15}', '{"coins": 5000, "xp": 1500, "badge": "collector"}'),
    ('team_player', 'Team Player', 'Participate in your first team battle.', 'battles', 'common', 'battle_count', false, '{"target": 1}', '{"coins": 200, "xp": 100}'),
    ('battle_regular', 'Battle Regular', 'Participate in 10 team battles.', 'battles', 'rare', 'battle_count', false, '{"target": 10}', '{"coins": 1500, "xp": 500}'),
    ('mvp', 'MVP', 'Become MVP of a team battle.', 'battles', 'epic', 'battle_mvp', false, '{"target": 1}', '{"coins": 3000, "xp": 1000, "title": "MVP"}'),
    ('night_owl', 'Night Owl', 'Code between midnight and 4 AM.', 'combo', 'rare', 'time_pattern', true, '{"after_hour": 0, "before_hour": 4, "tap_target": 50}', '{"coins": 750, "xp": 250, "badge": "night_owl"}'),
    ('weekend_warrior', 'Weekend Warrior', 'Code 500 lines on a weekend.', 'combo', 'rare', 'time_pattern', true, '{"days": ["sat", "sun"], "tap_target": 500}', '{"coins": 1200, "xp": 400}'),
    ('founder', 'Founder', 'Joined before official launch.', 'special', 'epic', 'special', false, '{"prelaunch_user": true}', '{"skin_unlock": "founder_hoodie", "title": "Founder"}')
    ON CONFLICT (slug) DO NOTHING
  `);
}
