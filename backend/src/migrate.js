import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildDatabaseUrl } from './config/database.js';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = buildDatabaseUrl(process.env);

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

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
    const sql = fs.readFileSync(filePath, 'utf-8');

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
      console.log(`✓ ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`✗ ${file}:`, err.message);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log('Migrations complete.');
  await pool.end();
}

migrate();
