import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";

const { Pool } = pg;

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || "";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../migrations");

export const testPool = TEST_DATABASE_URL
  ? new Pool({
      connectionString: TEST_DATABASE_URL,
      ssl: false,
    })
  : null;

export function createInitData(userId, options = {}) {
  return new URLSearchParams({
    user: JSON.stringify({
      id: userId,
      username: options.username || `user_${userId}`,
      first_name: options.firstName || "Test",
    }),
    auth_date: String(Math.floor(Date.now() / 1000)),
    ...(options.startParam ? { start_param: options.startParam } : {}),
  }).toString();
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
}

export async function resetTestDatabase() {
  if (!testPool) {
    return;
  }

  const result = await testPool.query(`
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'schema_migrations'
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
