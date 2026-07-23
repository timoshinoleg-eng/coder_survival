import { Router } from 'express';
import { pool } from '../index.js';
import { getActiveEvent, getEventContribution, claimEventReward } from '../utils/events.js';
import { applyReward } from '../utils/rewards.js';

const router = Router();

/**
 * GET /api/event/active
 */
router.get('/active', async (req, res, next) => {
  try {
    const client = await pool.connect();
    try {
      const event = await getActiveEvent(client);
      if (!event) {
        return res.json({ success: true, event: null, myContribution: null });
      }

      let myContribution = null;
      const telegramUser = req.telegramUser?.user;
      if (telegramUser) {
        const userResult = await client.query(
          `SELECT id FROM users WHERE telegram_id = $1`,
          [telegramUser.id]
        );
        if (userResult.rows.length > 0) {
          myContribution = await getEventContribution(client, userResult.rows[0].id, event.id);
        }
      }

      res.json({
        success: true,
        event: {
          id: event.id,
          type: event.event_type,
          title: event.title,
          description: event.description,
          startDate: event.start_date,
          endDate: event.end_date,
          targetCommits: event.target_commits,
          rewardPayload: event.reward_payload
        },
        myContribution: myContribution ? {
          commitsContributed: myContribution.commits_contributed,
          claimed: myContribution.claimed,
          progressPercent: Math.min(100, Math.round((myContribution.commits_contributed / event.target_commits) * 100))
        } : null
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/event/claim
 */
router.post('/claim', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        `SELECT id FROM users WHERE telegram_id = $1`,
        [telegramUser.id]
      );
      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }
      const userId = userResult.rows[0].id;

      const claimResult = await claimEventReward(client, userId);
      if (claimResult.error) {
        await client.query('ROLLBACK');
        return res.status(claimResult.status).json({ error: claimResult.error });
      }

      const rewardApplied = await applyReward(client, userId, claimResult.event.reward_payload);

      await client.query('COMMIT');

      res.json({
        success: true,
        event: claimResult.event,
        contribution: claimResult.contribution,
        rewardApplied: rewardApplied.applied
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
