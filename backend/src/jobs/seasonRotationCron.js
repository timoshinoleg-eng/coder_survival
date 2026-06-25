import cron from 'node-cron';
import { pool } from '../index.js';
import { createNextSeason } from '../utils/seasonCreation.js';
import { processPremiumRefunds } from '../utils/passRefund.js';

const ENABLE_CRON = process.env.ENABLE_SEASON_ROTATION_CRON !== 'false';

async function runSeasonRotation() {
  const client = await pool.connect();
  try {
    const expiredResult = await client.query(
      `SELECT id, season_number, season_name, end_date, refund_processed
       FROM sprint_passes
       WHERE is_active = TRUE
         AND end_date < CURRENT_DATE
       ORDER BY season_number DESC
       LIMIT 1`
    );

    if (expiredResult.rows.length === 0) {
      return;
    }

    const expired = expiredResult.rows[0];
    console.log(`[seasonRotation] Season ${expired.season_number} (${expired.season_name}) expired on ${expired.end_date}`);

    await client.query('BEGIN');

    if (!expired.refund_processed) {
      console.log(`[seasonRotation] Processing premium refunds for season ${expired.season_number}...`);
      const refundResult = await processPremiumRefunds(client, expired.id);
      console.log(`[seasonRotation] Refunded ${refundResult.processed} players: ${refundResult.totalStars} stars, ${refundResult.totalTon} ton`);
    }

    await client.query(
      'UPDATE sprint_passes SET is_active = FALSE WHERE id = $1',
      [expired.id]
    );
    console.log(`[seasonRotation] Deactivated season ${expired.season_number}`);

    const { season, rewardCount } = await createNextSeason(client);
    console.log(`[seasonRotation] Created season ${season.season_number} (${season.season_name}): ${season.start_date} → ${season.end_date}, ${rewardCount} reward levels`);

    await client.query('COMMIT');
    console.log(`[seasonRotation] Rotation complete: ${expired.season_number} → ${season.season_number}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seasonRotation] Error during rotation:', err);
  } finally {
    client.release();
  }
}

export function startSeasonRotationCron() {
  if (!ENABLE_CRON) {
    console.log('[seasonRotation] Cron disabled via ENABLE_SEASON_ROTATION_CRON=false');
    return;
  }

  const task = cron.schedule('5 0 * * *', runSeasonRotation, {
    timezone: 'UTC',
    scheduled: true
  });

  console.log('[seasonRotation] Scheduled season rotation for 00:05 UTC daily');
  return task;
}

export { runSeasonRotation };
