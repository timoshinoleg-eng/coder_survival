import { Router } from 'express';
import { pool } from '../index.js';
import { createNextSeason } from '../utils/seasonCreation.js';
import { processPremiumRefunds } from '../utils/passRefund.js';
import { runSeasonRotation } from '../jobs/seasonRotationCron.js';

const router = Router();

router.get('/status', async (req, res) => {
  try {
    const activeResult = await pool.query(
      `SELECT id, season_number, season_name, start_date, end_date, theme, refund_processed
       FROM sprint_passes
       WHERE is_active = TRUE
       ORDER BY season_number DESC
       LIMIT 1`
    );
    const countResult = await pool.query('SELECT COUNT(*) AS total FROM sprint_passes');
    const premiumCount = await pool.query(
      `SELECT COUNT(*) AS count FROM player_passes pp
       JOIN sprint_passes sp ON sp.id = pp.pass_id
       WHERE sp.is_active = TRUE AND pp.is_premium = TRUE`
    );

    res.json({
      success: true,
      active: activeResult.rows[0] || null,
      totalSeasons: Number(countResult.rows[0].total),
      activePremiumBuyers: Number(premiumCount.rows[0].count)
    });
  } catch (err) {
    console.error('[seasonAdmin] status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/rotate', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const activeResult = await client.query(
      `SELECT id, season_number, season_name, refund_processed
       FROM sprint_passes
       WHERE is_active = TRUE
       ORDER BY season_number DESC
       LIMIT 1`
    );

    if (activeResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No active season found' });
    }

    const active = activeResult.rows[0];

    if (!active.refund_processed) {
      const refundResult = await processPremiumRefunds(client, active.id);
      console.log(`[seasonAdmin] Manual refund: ${refundResult.processed} players`);
    }

    await client.query(
      'UPDATE sprint_passes SET is_active = FALSE WHERE id = $1',
      [active.id]
    );

    const { season, rewardCount } = await createNextSeason(client);
    await client.query('COMMIT');

    res.json({
      success: true,
      previousSeason: active.season_number,
      newSeason: {
        id: season.id,
        number: season.season_number,
        name: season.season_name,
        startDate: season.start_date,
        endDate: season.end_date,
        theme: season.theme,
        rewardLevels: rewardCount
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seasonAdmin] rotate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

export default router;
