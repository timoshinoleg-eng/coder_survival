import { Router } from 'express';
import { pool } from '../index.js';
import { applyReward } from '../utils/rewards.js';
import { getMyTeam } from '../utils/teams.js';

const router = Router();

/**
 * GET /api/team-battle/current
 * Returns active season, team contribution, leaderboard.
 */
router.get('/current', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
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
      const userId = userResult.rows[0].id;

      const seasonResult = await client.query(
        `SELECT id, season_number, start_date, end_date, target_commits, reward_payload
         FROM team_battle_seasons
         WHERE status = 'active'
         ORDER BY start_date DESC
         LIMIT 1`
      );

      if (seasonResult.rows.length === 0) {
        return res.json({ active: false });
      }

      const season = seasonResult.rows[0];
      const myTeam = await getMyTeam(client, userId);

      let teamCommits = 0;
      let teamRank = null;
      let personalContribution = 0;

      if (myTeam?.id) {
        const contribResult = await client.query(
          `SELECT COALESCE(SUM(commits_contributed), 0) as total
           FROM team_battle_contributions
           WHERE season_id = $1 AND team_id = $2`,
          [season.id, myTeam.id]
        );
        teamCommits = parseInt(contribResult.rows[0].total, 10);

        const rankResult = await client.query(
          `SELECT team_id, total
           FROM (
             SELECT team_id, COALESCE(SUM(commits_contributed), 0) as total
             FROM team_battle_contributions
             WHERE season_id = $1
             GROUP BY team_id
           ) t
           ORDER BY total DESC`,
          [season.id]
        );
        const idx = rankResult.rows.findIndex(r => r.team_id === myTeam.id);
        teamRank = idx >= 0 ? idx + 1 : null;

        const personalResult = await client.query(
          `SELECT COALESCE(commits_contributed, 0) as personal
           FROM team_battle_contributions
           WHERE season_id = $1 AND user_id = $2`,
          [season.id, userId]
        );
        personalContribution = personalResult.rows.length > 0
          ? parseInt(personalResult.rows[0].personal, 10)
          : 0;
      }

      // Top 10 teams
      const topResult = await client.query(
        `SELECT t.id, t.name, COALESCE(SUM(c.commits_contributed), 0) as total
         FROM teams t
         LEFT JOIN team_battle_contributions c
           ON c.team_id = t.id AND c.season_id = $1
         GROUP BY t.id, t.name
         ORDER BY total DESC
         LIMIT 10`,
        [season.id]
      );

      res.json({
        active: true,
        season: {
          id: season.id,
          seasonNumber: season.season_number,
          startDate: season.start_date,
          endDate: season.end_date,
          targetCommits: season.target_commits,
          reward: season.reward_payload
        },
        myTeam: myTeam ? {
          id: myTeam.id,
          name: myTeam.name,
          teamCommits,
          targetCommits: season.target_commits,
          teamRank,
          personalContribution,
          progressPercent: Math.min(100, Math.round((teamCommits / season.target_commits) * 100))
        } : null,
        topTeams: topResult.rows.map((r, idx) => ({
          rank: idx + 1,
          teamId: r.id,
          teamName: r.name,
          commits: parseInt(r.total, 10)
        }))
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/team-battle/claim
 * Claim season reward if team target reached.
 */
router.post('/claim', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
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

      const seasonResult = await client.query(
        `SELECT id, target_commits, reward_payload, status
         FROM team_battle_seasons
         WHERE status = 'active'
         ORDER BY start_date DESC
         LIMIT 1
         FOR UPDATE`
      );
      if (seasonResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'No active season' });
      }
      const season = seasonResult.rows[0];

      const myTeam = await getMyTeam(client, userId);
      if (!myTeam?.id) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Not in a team' });
      }

      const contribResult = await client.query(
        `SELECT COALESCE(SUM(commits_contributed), 0) as total
         FROM team_battle_contributions
         WHERE season_id = $1 AND team_id = $2`,
        [season.id, myTeam.id]
      );
      const teamCommits = parseInt(contribResult.rows[0].total, 10);

      if (teamCommits < season.target_commits) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Target not reached',
          teamCommits,
          targetCommits: season.target_commits
        });
      }

      // Check if already claimed this season
      const claimedResult = await client.query(
        `SELECT 1 FROM team_battle_contributions
         WHERE season_id = $1 AND user_id = $2 AND reward_claimed = TRUE`,
        [season.id, userId]
      );
      if (claimedResult.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Reward already claimed' });
      }

      await applyReward(client, userId, season.reward_payload);

      await client.query(
        `UPDATE team_battle_contributions
         SET reward_claimed = TRUE
         WHERE season_id = $1 AND user_id = $2`,
        [season.id, userId]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        reward: season.reward_payload,
        teamCommits,
        targetCommits: season.target_commits
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
