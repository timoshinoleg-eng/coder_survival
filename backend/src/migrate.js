import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildDatabaseSslOptions, buildDatabaseUrl } from './config/database.js';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function buildMigrationPoolOptions(env = process.env) {
  return {
    connectionString: buildDatabaseUrl(env),
    ssl: buildDatabaseSslOptions(env),
  };
}

export async function migrate(env = process.env) {
  const pool = new Pool(buildMigrationPoolOptions(env));
  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  try {
    console.log('Running migrations...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const file of files) {
      const alreadyApplied = await pool.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file]
      );
      if (alreadyApplied.rows.length > 0) {
        console.log(`Skipping: ${file}`);
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`Applying: ${file}`);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`Applied: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`Migration failed for ${file}:`, err.message);
        throw err;
      } finally {
        client.release();
      }
    }

    console.log('Migrations complete.');
  } finally {
    await pool.end();
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  migrate().catch((err) => {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  });
}
