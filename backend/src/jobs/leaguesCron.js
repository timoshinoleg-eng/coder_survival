import cron from 'node-cron';
import { pool } from '../index.js';
import { getWeekMonday, snapshotLeagueWeek } from '../utils/leagues.js';

/**
 * Weekly league snapshot: Monday 00:05 UTC, scores the PREVIOUS ISO week.
 * Single-instance by design (see docs/INFRA.md) — the whole app runs as one
 * backend instance.
 */
export function startLeaguesCron() {
  cron.schedule('5 0 * * 1', async () => {
    const thisMonday = getWeekMonday(new Date());
    const previousMonday = new Date(thisMonday);
    previousMonday.setUTCDate(previousMonday.getUTCDate() - 7);
    try {
      const client = await pool.connect();
      try {
        const result = await snapshotLeagueWeek(client, previousMonday);
        console.log('[LeaguesCron] snapshot complete:', JSON.stringify(result));
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[LeaguesCron] snapshot failed:', err.message);
    }
  });
  console.log('[LeaguesCron] Started (Mondays 00:05 UTC)');
}
