/**
 * Smoke test: idle energy regeneration anchor regression
 * Covers the key regression path where repeated state fetches (app opens)
 * must NOT reset the idle regeneration timer.
 *
 * What it tests:
 *   1. recoverProgression() correctly recovers energy from a stale anchor.
 *   2. Repeated recoverProgression() calls without taps do NOT regress energy.
 *   3. A tap resets last_energy_activity_at, blocking immediate regen.
 *
 * What it does NOT test:
 *   - Real time progression over spaced intervals (it uses a single stale
 *     anchor and repeated immediate reads, not 5 actual openings over an hour).
 *   - This is a fast regression guard, not a full simulation.
 *
 * Prerequisites:
 *   - Schema migration 009_quick_wins.sql must be applied
 *     (progression.last_energy_activity_at column must exist).
 *
 * Run: npm test -- tests/smoke.idleEnergyRegen.test.js
 * Requires: TEST_DATABASE_URL env or local PostgreSQL
 */

import pg from 'pg';
import { recoverProgression } from '../src/utils/progression.js';

const { Pool } = pg;

// Use a dedicated test DB if available; otherwise rely on env
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function withClient(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('ROLLBACK');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

describe('idle energy regen smoke', () => {
  if (!DATABASE_URL) {
    test.skip('no database url', () => {});
    return;
  }

  test('energy regenerates across multiple state fetches without taps', async () => {
    await withClient(async (client) => {
      // 1. Create a test user
      const userRes = await client.query(
        `INSERT INTO users (telegram_id, username)
         VALUES ($1, $2)
         RETURNING id`,
        [999999001, 'smoke_test_user']
      );
      const userId = userRes.rows[0].id;

      // 2. Seed progression with low energy and a stale activity anchor
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const progRes = await client.query(
        `INSERT INTO progression (user_id, energy, last_energy_activity_at)
         VALUES ($1, 50, $2)
         RETURNING *`,
        [userId, tenMinutesAgo]
      );
      let progression = progRes.rows[0];

      // 3. First "open app" (state fetch) — should recover energy
      const maxEnergy = 100;
      progression = await recoverProgression(client, progression, maxEnergy, {});
      const energyAfterFirst = progression.energy;

      // Expect ~10 minutes of recovery (at 60s interval => ~10 energy)
      expect(energyAfterFirst).toBeGreaterThan(50);

      // 4. Simulate 4 more state fetches over 5 minutes (NO taps)
      for (let i = 0; i < 4; i++) {
        // Re-fetch progression row to simulate fresh DB read
        const fresh = await client.query(
          `SELECT * FROM progression WHERE user_id = $1`,
          [userId]
        );
        progression = await recoverProgression(client, fresh.rows[0], maxEnergy, {});
      }

      // 5. Energy should NOT have reset; it should be monotonically increasing or stable
      expect(progression.energy).toBeGreaterThanOrEqual(energyAfterFirst);

      // 6. Tap once — this should reset the idle anchor
      await client.query(
        `UPDATE progression
         SET energy = energy - 1,
             last_energy_activity_at = NOW()
         WHERE user_id = $1`,
        [userId]
      );

      // 7. Immediate state fetch after tap — energy should NOT recover instantly
      const postTap = await client.query(
        `SELECT * FROM progression WHERE user_id = $1`,
        [userId]
      );
      const afterTap = await recoverProgression(client, postTap.rows[0], maxEnergy, {});
      expect(afterTap.energy).toBe(postTap.rows[0].energy); // no immediate regen
    });
  });

  afterAll(async () => {
    await pool.end();
  });
});
