import { Router } from 'express';
import { pool } from '../index.js';
import {
  calculateHackathonTarget,
  getHackathonTier,
  getHoursUntilNextLocalMonday,
  getWeekId
} from '../utils/teamHackathon.js';
import { addPassXp } from '../utils/pass.js';
import { STAGE3 } from '../config/balance.js';

const router = Router();

async function getUserId(client, telegramUser) {
  const result = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramUser.id]);
  return result.rows[0]?.id || null;
}

router.get('/', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const client = await pool.connect();
    try {
      const userId = await getUserId(client, telegramUser);
      if (!userId) return res.status(404).json({ error: 'User not found' });

      const memberResult = await client.query(
        'SELECT team_id FROM team_members WHERE user_id = $1',
        [userId]
      );
      const teamId = memberResult.rows[0]?.team_id;
      if (!teamId) return res.json({ inTeam: false, hackathon: null });

      const tzResult = await client.query(
        'SELECT COALESCE(timezone_offset, $2) AS timezone_offset FROM progression WHERE user_id = $1',
        [userId, Number(req.query.timezoneOffset ?? 0)]
      );
      const timezoneOffset = Number(tzResult.rows[0]?.timezone_offset ?? req.query.timezoneOffset ?? 0);
      const weekId = getWeekId(new Date(), timezoneOffset);

      const membersResult = await client.query(
        `SELECT tm.user_id, u.username, u.first_name, tm.last_active_at
         FROM team_members tm
         JOIN users u ON u.id = tm.user_id
         WHERE tm.team_id = $1
         ORDER BY tm.joined_at ASC`,
        [teamId]
      );
      const memberIds = membersResult.rows.map((row) => row.user_id);

      const statesResult = await client.query(
        `SELECT user_id, team_hackathon_state
         FROM progression
         WHERE user_id = ANY($1::int[])`,
        [memberIds]
      );

      const sevenDaysAgo = Date.now() - 7 * 86400000;
      const activeCount = membersResult.rows.filter((row) => (
        row.last_active_at && new Date(row.last_active_at).getTime() >= sevenDaysAgo
      )).length;
      const target = calculateHackathonTarget(activeCount);
      const contributions = {};
      let progress = 0;
      let tierClaimed = null;

      for (const row of statesResult.rows) {
        const state = row.team_hackathon_state || {};
        if (state.weekId !== weekId) continue;
        for (const [uid, value] of Object.entries(state.contributions || {})) {
          contributions[uid] = (contributions[uid] || 0) + Number(value || 0);
        }
        if (state.tierClaimed) tierClaimed = state.tierClaimed;
      }
      progress = Object.values(contributions).reduce((sum, value) => sum + Number(value || 0), 0);

      const currentTier = getHackathonTier(progress, target);
      const myContribution = contributions[String(userId)] || 0;
      const averageContribution = memberIds.length ? progress / memberIds.length : 0;

      return res.json({
        inTeam: true,
        weekId,
        target,
        progress,
        progressPercent: target ? Math.min(100, Math.round((progress / target) * 100)) : 0,
        contributions,
        members: membersResult.rows.map((row, index) => ({
          userId: row.user_id,
          username: row.username,
          firstName: row.first_name,
          commits: contributions[String(row.user_id)] || 0,
          colorIndex: index
        })),
        currentTier,
        tierClaimed,
        hoursRemaining: getHoursUntilNextLocalMonday(timezoneOffset),
        memberCount: memberIds.length,
        activeCount,
        myContribution,
        behindAverage: myContribution < averageContribution
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/claim', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userId = await getUserId(client, telegramUser);
      if (!userId) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }

      const progressResult = await client.query(
        `SELECT team_hackathon_state, timezone_offset
         FROM progression
         WHERE user_id = $1
         FOR UPDATE`,
        [userId]
      );
      const state = progressResult.rows[0]?.team_hackathon_state || {};
      const weekId = getWeekId(new Date(), Number(progressResult.rows[0]?.timezone_offset || 0));
      if (state.weekId !== weekId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Нет активного хакатона' });
      }

      const tier = state.currentTier || getHackathonTier(state.progress || 0, state.target || 0);
      if (!tier) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Команда ещё не достигла цели' });
      }
      if (state.tierClaimed) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Награда уже получена' });
      }

      const reward = STAGE3.TEAM_HACKATHON.REWARD_TIERS[tier]?.reward;
      const nextState = { ...state, tierClaimed: tier, currentTier: tier };
      await client.query(
        `UPDATE progression
         SET team_hackathon_state = $2,
             energy = LEAST(100, energy + $3),
             inventory = inventory || $4::jsonb
         WHERE user_id = $1`,
        [
          userId,
          JSON.stringify(nextState),
          reward?.energy || 0,
          JSON.stringify(reward?.skinFragment ? { skin_fragments: { [reward.skinFragment]: 1 } } : {})
        ]
      );
      if (reward?.xp) {
        await client.query(
          `INSERT INTO player_levels (user_id, xp_total)
           VALUES ($1, $2)
           ON CONFLICT (user_id) DO UPDATE SET
             xp_total = player_levels.xp_total + EXCLUDED.xp_total,
             updated_at = NOW()`,
          [userId, reward.xp]
        );
      }
      if (reward?.passXp) await addPassXp(client, userId, reward.passXp);

      await client.query('COMMIT');
      return res.json({ success: true, tier, reward });
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
