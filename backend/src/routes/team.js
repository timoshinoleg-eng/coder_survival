import { Router } from 'express';
import { pool } from '../index.js';
import { createTeam, joinTeam, getMyTeam, leaveTeam, getTeamLeaderboard } from '../utils/teams.js';

const router = Router();

/**
 * GET /api/team/my
 */
router.get('/my', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const client = await pool.connect();
    try {
      const userResult = await client.query(
        `SELECT id FROM users WHERE telegram_id = $1`,
        [telegramUser.id]
      );
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const myTeam = await getMyTeam(client, userResult.rows[0].id);
      res.json({ success: true, team: myTeam });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/team/leaderboard
 */
router.get('/leaderboard', async (req, res, next) => {
  try {
    const client = await pool.connect();
    try {
      const leaderboard = await getTeamLeaderboard(client);
      res.json({ success: true, leaderboard });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/team/create
 * Body: { name: string }
 */
router.post('/create', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { name } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Name is required' });
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

      const result = await createTeam(client, userResult.rows[0].id, name.trim());
      if (result.error) {
        await client.query('ROLLBACK');
        return res.status(result.status).json({ error: result.error });
      }

      await client.query('COMMIT');
      res.json({ success: true, team: result.team });
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

/**
 * POST /api/team/join
 * Body: { inviteCode: string }
 */
router.post('/join', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { inviteCode } = req.body || {};
  if (!inviteCode) {
    return res.status(400).json({ error: 'inviteCode is required' });
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

      const result = await joinTeam(client, userResult.rows[0].id, inviteCode.trim());
      if (result.error) {
        await client.query('ROLLBACK');
        return res.status(result.status).json({ error: result.error });
      }

      await client.query('COMMIT');
      res.json({ success: true, team: result.team });
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

/**
 * POST /api/team/leave
 */
router.post('/leave', async (req, res, next) => {
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

      const result = await leaveTeam(client, userResult.rows[0].id);
      if (result.error) {
        await client.query('ROLLBACK');
        return res.status(result.status).json({ error: result.error });
      }

      await client.query('COMMIT');
      res.json({ success: true });
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
