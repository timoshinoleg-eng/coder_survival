#!/usr/bin/env node
/**
 * schema_migrations_diff.mjs — drift checker for coder_survival backend migrations.
 *
 * Supports release gate G3 (owner step A3): after `node src/migrate.js` runs
 * against staging/prod, run this to prove the DB's applied set exactly matches
 * the on-disk migration catalog.
 *
 * It FAITHFULLY replicates backend/src/migrate.js so the "expected" set equals
 * what the runner would actually apply:
 *   - catalog  = readdirSync(../migrations/*.sql)
 *               sorted by full filename with localeCompare(..., {numeric:true})
 *   - keying   = full filename (schema_migrations.filename is TEXT PRIMARY KEY)
 *
 * Exit codes:
 *   0  clean (no orphan drift). Pending is allowed unless --strict (you run this
 *      BEFORE applying, pending = expected).
 *   1  orphan drift: a file was applied but is no longer in the catalog
 *      (rename/delete) — DANGEROUS, treats applied history as unreliable.
 *   2  usage / DB connection error.
 *   3  --strict and any drift (pending OR orphan).
 *
 * Usage:
 *   DATABASE_URL=postgres://... node backend/scripts/schema_migrations_diff.mjs [--strict]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// migrate.js lives in backend/src/ and uses path.join(__dirname, '../migrations')
// => backend/migrations. This script lives in backend/scripts/ => same ../migrations.
const migrationsDir = path.resolve(__dirname, '../migrations');

const strict = process.argv.includes('--strict');
const dbUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;

function readCatalog() {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`migrations dir not found: ${migrationsDir}`);
  }
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function prefixOf(name) {
  const m = name.match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

function printSection(title) {
  console.log(`\n${'='.repeat(64)}\n${title}\n${'='.repeat(64)}`);
}

async function main() {
  if (!dbUrl) {
    console.error('ERROR: set DATABASE_URL (or TEST_DATABASE_URL) to the target DB.');
    process.exit(2);
  }

  const catalog = readCatalog();
  const pool = new pg.Pool({ connectionString: dbUrl });
  let applied;
  try {
    const { rows } = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
    applied = rows.map((r) => r.filename);
  } catch (e) {
    console.error('DB error:', e.message);
    await pool.end().catch(() => {});
    process.exit(2);
  } finally {
    await pool.end().catch(() => {});
  }

  const catalogSet = new Set(catalog);
  const appliedSet = new Set(applied);
  const pending = catalog.filter((f) => !appliedSet.has(f)); // in catalog, not applied yet
  const orphan = applied.filter((f) => !catalogSet.has(f)); // applied, file gone (rename/delete)

  printSection('CATALOG vs APPLIED');
  console.log(`catalog files : ${catalog.length}`);
  console.log(`applied rows  : ${applied.length}`);

  if (pending.length) {
    printSection(`PENDING (${pending.length}) — would apply on next migrate.js run`);
    pending.forEach((f) => console.log('  + ' + f));
  } else {
    console.log('\nPENDING: none — catalog fully applied.');
  }

  if (orphan.length) {
    printSection(`ORPHAN (${orphan.length}) — APPLIED BUT FILE MISSING (dangerous drift)`);
    orphan.forEach((f) => console.log('  ! ' + f));
  } else {
    console.log('ORPHAN: none — applied set ⊂ catalog.');
  }

  // duplicate numeric prefixes — maintenance hazard, NOT a runtime bug under
  // current migrate.js (keys by full filename). Flag so a future refactor that
  // keys by prefix does not silently skip the second file.
  const byPrefix = new Map();
  for (const f of catalog) {
    const p = prefixOf(f);
    if (p == null) continue;
    if (!byPrefix.has(p)) byPrefix.set(p, []);
    byPrefix.get(p).push(f);
  }
  const dupPrefixes = [...byPrefix.entries()].filter(([, v]) => v.length > 1);
  if (dupPrefixes.length) {
    printSection(`WARN duplicate numeric prefixes (${dupPrefixes.length}) — renumber to avoid footgun`);
    dupPrefixes.forEach(([p, v]) => console.log(`  prefix ${p}: ${v.join(', ')}`));
  }

  // sequence gaps (informational; gaps are usually intentional)
  const prefixes = [...new Set(catalog.map(prefixOf).filter((p) => p != null))].sort((a, b) => a - b);
  const gaps = [];
  for (let i = prefixes[0]; i < prefixes[prefixes.length - 1]; i++) {
    if (!prefixes.includes(i)) gaps.push(i);
  }
  if (gaps.length) {
    printSection(`INFO sequence gaps (${gaps.length}) — usually intentional`);
    console.log('  ' + gaps.join(', '));
  }

  printSection('VERDICT');
  if (orphan.length) {
    console.log('FAIL: orphan drift present (applied history references missing files).');
    process.exit(1);
  }
  if (strict && (pending.length || orphan.length)) {
    console.log('FAIL (--strict): drift present.');
    process.exit(3);
  }
  console.log(strict ? 'PASS: catalog == applied (strict).' : 'PASS: no orphan drift.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(2);
});
