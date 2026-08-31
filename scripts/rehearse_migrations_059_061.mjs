import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { migrate } from '../backend/src/migrate.js';
import { buildMigrationPoolOptions } from '../backend/src/migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const migrationsDir = path.join(rootDir, 'backend', 'migrations');
const backendRequire = createRequire(new URL('../backend/package.json', import.meta.url));
const { Pool } = backendRequire('pg');

const tailMigrations = [
  '059_seed_missing_event_definitions.sql',
  '060_starter_pack_once.sql',
  '061_leagues.sql',
];

const expectedEvents = [
  ['green_build', 'Green Build', 'positive', 3, 30, { commits: 15, depressionRelief: 3 }, null],
  ['slack_huddle', 'Slack Huddle', 'neutral', 8, 30, { commits: 12, depression: 2 }, { commits: -4, depression: 2 }],
  ['scope_creep', 'Scope Creep', 'neutral', 7, 30, { commits: 8, depression: 3 }, { commits: -6, depression: 3 }],
  ['slack_thread_storm', 'Slack Thread Storm', 'neutral', 7, 30, { commits: 4, depression: 1 }, { commits: -3, depression: 2 }],
  ['merge_conflict', 'Merge Conflict', 'negative', 3, 30, { commits: 5, depression: 3 }, { commits: -8, depression: 4 }],
  ['canary_rollback', 'Canary Rollback', 'negative', 5, 30, null, { commits: -2, depression: 1 }],
  ['production_500_spike', 'HTTP 500 Spike', 'negative', 5, 30, { commits: 4, depression: 2 }, { commits: -5, depression: 3 }],
  ['ci_pipeline_red', 'CI Pipeline Red', 'negative', 6, 30, null, { commits: -1, depression: 1 }],
  ['friday_release_outage', 'Friday Release Outage', 'negative', 6, 30, null, { commits: -3, depression: 2 }],
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function getRehearsalEnvironment() {
  const databaseUrl = process.env.MIGRATION_REHEARSAL_DATABASE_URL;
  assert(databaseUrl, 'MIGRATION_REHEARSAL_DATABASE_URL is required. Use a dedicated disposable local database.');

  const parsed = new URL(databaseUrl);
  assert(['postgres:', 'postgresql:'].includes(parsed.protocol), 'MIGRATION_REHEARSAL_DATABASE_URL must be a PostgreSQL URL.');
  assert(['127.0.0.1', 'localhost'].includes(parsed.hostname), 'Refusing a non-local rehearsal database. This harness must never target staging or production.');
  assert(/rehearsal/i.test(parsed.pathname), 'Refusing a database whose name does not contain "rehearsal".');

  return {
    ...process.env,
    NODE_ENV: 'test',
    TEST_DATABASE_URL: databaseUrl,
    DATABASE_URL: undefined,
  };
}

function listMigrationFiles() {
  return fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function resetPublicSchema(pool) {
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
}

async function verifyAllMigrationsRecorded(pool, migrationFiles) {
  const { rows } = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
  const applied = rows.map((row) => row.filename);
  assert(JSON.stringify(applied) === JSON.stringify(migrationFiles), 'schema_migrations does not exactly match the repository migration set.');
}

async function readTailInvariants(pool) {
  const { rows: eventRows } = await pool.query(`
    SELECT slug, name, type, weight, duration_sec, reward_json, penalty_json
    FROM event_definitions
    WHERE slug = ANY($1::text[])
    ORDER BY slug
  `, [expectedEvents.map(([slug]) => slug)]);

  const expectedBySlug = new Map(expectedEvents.map((event) => [event[0], event]));
  assert(eventRows.length === expectedEvents.length, `Expected ${expectedEvents.length} seeded event definitions, got ${eventRows.length}.`);

  for (const row of eventRows) {
    const expected = expectedBySlug.get(row.slug);
    assert(expected, `Unexpected event definition returned: ${row.slug}.`);
    const actual = [row.slug, row.name, row.type, row.weight, row.duration_sec, row.reward_json, row.penalty_json];
    assert(JSON.stringify(actual) === JSON.stringify(expected), `Event definition drift for ${row.slug}.`);
  }

  const { rows: objectRows } = await pool.query(`
    SELECT
      to_regclass('public.uq_purchases_starter_pack_once') IS NOT NULL AS starter_index_exists,
      EXISTS (
        SELECT 1
        FROM pg_index
        WHERE indexrelid = 'public.uq_purchases_starter_pack_once'::regclass
          AND indpred IS NOT NULL
      ) AS starter_index_is_partial,
      to_regclass('public.league_placements') IS NOT NULL AS league_table_exists,
      to_regclass('public.idx_league_placements_user') IS NOT NULL AS league_user_index_exists,
      to_regclass('public.idx_league_placements_week') IS NOT NULL AS league_week_index_exists
  `);
  const objects = objectRows[0];

  assert(objects.starter_index_exists, 'Migration 060 starter-pack unique index is missing.');
  assert(objects.starter_index_is_partial, 'Migration 060 starter-pack index is not partial.');
  assert(objects.league_table_exists, 'Migration 061 league_placements table is missing.');
  assert(objects.league_user_index_exists, 'Migration 061 user index is missing.');
  assert(objects.league_week_index_exists, 'Migration 061 week index is missing.');

  return {
    eventDefinitions: eventRows.length,
    starterPackIndex: objects.starter_index_exists,
    starterPackIndexIsPartial: objects.starter_index_is_partial,
    leaguePlacementsTable: objects.league_table_exists,
    leaguePlacementIndexes: Number(objects.league_user_index_exists) + Number(objects.league_week_index_exists),
  };
}

async function reapplyTail(pool) {
  for (const filename of tailMigrations) {
    const client = await pool.connect();
    try {
      const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`Direct idempotency replay failed for ${filename}: ${error.message}`);
    } finally {
      client.release();
    }
  }
}

export async function rehearseMigrationTail() {
  const env = getRehearsalEnvironment();
  const migrationFiles = listMigrationFiles();
  const poolOptions = buildMigrationPoolOptions(env);

  const resetPool = new Pool(poolOptions);
  try {
    console.log('Resetting disposable public schema...');
    await resetPublicSchema(resetPool);
  } finally {
    await resetPool.end();
  }

  console.log(`Applying ${migrationFiles.length} migrations with the production runner contract...`);
  await migrate(env);
  console.log('Repeating the production runner to verify already-applied migration handling...');
  await migrate(env);

  const verificationPool = new Pool(poolOptions);
  try {
    await verifyAllMigrationsRecorded(verificationPool, migrationFiles);
    const beforeReplay = await readTailInvariants(verificationPool);

    console.log('Reapplying 059–061 directly inside per-file transactions...');
    await reapplyTail(verificationPool);
    const afterReplay = await readTailInvariants(verificationPool);
    assert(JSON.stringify(beforeReplay) === JSON.stringify(afterReplay), 'Tail invariants changed after idempotency replay.');

    console.log('MIGRATION REHEARSAL PASSED');
    console.log(JSON.stringify({ migrationsApplied: migrationFiles.length, ...afterReplay }, null, 2));
  } finally {
    await verificationPool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  rehearseMigrationTail().catch((error) => {
    console.error(`MIGRATION REHEARSAL FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
