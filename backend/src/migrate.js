import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL || 
  `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASS || 'postgres'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'coder_survival'}`;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  console.log('Running migrations...');

  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    console.log(`Applying: ${file}`);
    
    try {
      await pool.query(sql);
      console.log(`✓ ${file}`);
    } catch (err) {
      console.error(`✗ ${file}:`, err.message);
      process.exit(1);
    }
  }

  console.log('Migrations complete.');
  await pool.end();
}

migrate();
