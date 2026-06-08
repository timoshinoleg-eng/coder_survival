import { Router } from 'express';
import { pool } from '../index.js';
import { applyReward } from '../utils/rewards.js';
import { getMyTeam } from '../utils/teams.js';
import { DEPRESSION_SCALE } from '../config/balance.js';

const router = Router();

const BUG_TYPES = [
  { id: 'memory_leak', name: 'Memory Leak', emoji: '🧠' },
  { id: 'race_condition', name: 'Race Condition', emoji: '🏎️' },
  { id: 'null_pointer', name: 'Null Pointer', emoji: '💥' },
  { id: 'infinite_loop', name: 'Infinite Loop', emoji: '🔄' },
  { id: 'dependency_hell', name: 'Dependency Hell', emoji: '📦' },
  { id: 'css_bug', name: 'CSS Bug', emoji: '🎨' },
  { id: 'api_timeout', name: 'API Timeout', emoji: '⏳' },
  { id: 'merge_conflict', name: 'Merge Conflict', emoji: '🔀' }
];

const DEADLINES = [4, 8, 24];
const SEVERITIES = ['P0', 'P1', 'P2'];

function getTargetLoc(severity) {
  switch (severity) {
    case 'P0': return 15000;
    case 'P1': return 8000;
    case 'P2': return 3000;
    default: return 5000;
  }
}

function getRewardForSeverity(severity, contributionRatio) {
  const ratio = Math.min(1, Math.max(0, contributionRatio));
  switch (severity) {
    case 'P0':
      return {
        energy: Math.round(60 * ratio),
        coffeeCups: ratio >= 0.5 ? 2 : 1,
        depressionRelief: Math.round(25 * ratio),
        commitsCurrent: Math.round(100 * ratio)
      };
    case 'P1':
      return {
        energy: Math.round(40 * ratio),
        coffeeCups: 1,
        depressionRelief: Math.round(15 * ratio),
        commitsCurrent: Math.round(50 * ratio)
      };
    case 'P2':
      return {
        energy: Math.round(20 * ratio),
        depressionRelief: Math.round(10 * ratio),
        commitsCurrent: Math.round(25 * ratio)
      };
    default:
      return { energy: 10 };
  }
}

function getFailurePenalty(severity) {
  switch (severity) {
    case 'P0': return 30;
    case 'P1': return 20;
    case 'P2': return 10;
    default: return 15;
  }
}

async function getUserId(client, telegramUser) {
  const result = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramUser.id]);
  return result.rows[0]?.id || null;
}

export function generateDailyBattle(now = new Date()) {
  const bug = BUG_TYPES[Math.floor(Math.random() * BUG_TYPES.length)];
  const deadline = DEADLINES[Math.floor(Math.random() * DEADLINES.length)];
  const severity = SEVERITIES[Math.floor(Math.random() * SEVERITIES.length)];
  const targetLoc = getTargetLoc(severity);

  const hour = now.getUTCHours();
  const resetTime = (hour >= 10 && hour < 19) ? '19:00' : '10:00';
  const endsAt = new Date(now.getTime() + deadline * 60 * 60 * 1000);

  return {
    bugType: bug.id,
    bugName: bug.name,
    bugEmoji: bug.emoji,
    deadlineHours: deadline,
    severity,
    resetTime,
    targetLoc,
    endsAt: endsAt.toISOString()
  };
}

/**
 * GET /api/daily-battle/current
 */
router.get('/current', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const client = await pool.connect();
    try {
      const userId = await getUserId(client, telegramUser);
      if (!userId) return res.status(404).json({ error: 'User not found' });

      const battleResult = await client.query(
        `SELECT id, battle_date, bug_type, deadline_hours, severity, reset_time, status, target_loc, total_loc, participants_count, created_at, ends_at
         FROM daily_battles
         WHERE status = 'active'
         ORDER BY created_at DESC
         LIMIT 1`
      );

      if (battleResult.rows.length === 0) {
        return res.json({ active: false });
      }

      const battle = battleResult.rows[0];
      const now = Date.now();
      const endsAt = new Date(battle.ends_at).getTime();
      const timeRemainingMs = Math.max(0, endsAt - now);

      // Auto-fail if expired
      if (timeRemainingMs <= 0 && battle.status === 'active') {
        await client.query(
          `UPDATE daily_battles SET status = 'failed' WHERE id = $1`,
          [battle.id]
        );
        battle.status = 'failed';
      }

      const myResult = await client.query(
        `SELECT joined_at, completed_at, success, contribution_loc, claimed, claimed_at, reward_payload
         FROM user_daily_battles
         WHERE user_id = $1 AND battle_id = $2`,
        [userId, battle.id]
      );

      const myParticipation = myResult.rows.length > 0 ? {
        joined: true,
        joinedAt: myResult.rows[0].joined_at,
        completedAt: myResult.rows[0].completed_at,
        success: myResult.rows[0].success,
        contributionLoc: parseInt(myResult.rows[0].contribution_loc, 10),
        claimed: myResult.rows[0].claimed,
        claimedAt: myResult.rows[0].claimed_at,
        reward: myResult.rows[0].reward_payload
      } : { joined: false, contributionLoc: 0, claimed: false };

      // Squad / team progress
      const myTeam = await getMyTeam(client, userId);
      let squadProgress = {
        totalLoc: parseInt(battle.total_loc, 10),
        participants: parseInt(battle.participants_count, 10),
        progressPercent: battle.target_loc > 0 ? Math.min(100, Math.round((battle.total_loc / battle.target_loc) * 100)) : 0,
        myTeamLoc: 0,
        myTeamParticipants: 0
      };

      if (myTeam?.team?.id) {
        const teamResult = await client.query(
          `SELECT COALESCE(SUM(udb.contribution_loc), 0) as team_loc,
                  COUNT(DISTINCT udb.user_id) as team_participants
           FROM user_daily_battles udb
           JOIN team_members tm ON tm.user_id = udb.user_id
           WHERE udb.battle_id = $1 AND tm.team_id = $2`,
          [battle.id, myTeam.team.id]
        );
        squadProgress.myTeamLoc = parseInt(teamResult.rows[0].team_loc, 10);
        squadProgress.myTeamParticipants = parseInt(teamResult.rows[0].team_participants, 10);
      }

      const bugMeta = BUG_TYPES.find(b => b.id === battle.bug_type) || { name: battle.bug_type, emoji: '🐛' };

      res.json({
        active: true,
        battle: {
          id: battle.id,
          bugType: battle.bug_type,
          bugName: bugMeta.name,
          bugEmoji: bugMeta.emoji,
          deadlineHours: battle.deadline_hours,
          severity: battle.severity,
          resetTime: battle.reset_time,
          status: battle.status,
          targetLoc: battle.target_loc,
          totalLoc: parseInt(battle.total_loc, 10),
          participants: parseInt(battle.participants_count, 10),
          createdAt: battle.created_at,
          endsAt: battle.ends_at,
          timeRemainingMs
        },
        myParticipation,
        squadProgress
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/daily-battle/join
 */
router.post('/join', async (req, res, next) => {
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

      const battleResult = await client.query(
        `SELECT id, status, ends_at FROM daily_battles WHERE status = 'active' ORDER BY created_at DESC LIMIT 1 FOR UPDATE`
      );
      if (battleResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'No active battle' });
      }

      const battle = battleResult.rows[0];
      if (new Date(battle.ends_at).getTime() <= Date.now()) {
        await client.query(`UPDATE daily_battles SET status = 'failed' WHERE id = $1`, [battle.id]);
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Battle already ended' });
      }

      const insertResult = await client.query(
        `INSERT INTO user_daily_battles (user_id, battle_id, joined_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id, battle_id) DO NOTHING
         RETURNING joined_at`,
        [userId, battle.id]
      );

      if (insertResult.rows.length > 0) {
        await client.query(
          `UPDATE daily_battles SET participants_count = participants_count + 1 WHERE id = $1`,
          [battle.id]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true, joinedAt: insertResult.rows[0]?.joined_at || null });
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
 * POST /api/daily-battle/contribute
 * Body: { loc: number }
 */
router.post('/contribute', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });

  const loc = Number(req.body?.loc);
  if (!Number.isFinite(loc) || loc <= 0 || !Number.isInteger(loc)) {
    return res.status(400).json({ error: 'loc must be a positive integer' });
  }
  if (loc > 100000) {
    return res.status(400).json({ error: 'loc exceeds maximum allowed contribution' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userId = await getUserId(client, telegramUser);
      if (!userId) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }

      const battleResult = await client.query(
        `SELECT id, status, ends_at, target_loc FROM daily_battles WHERE status = 'active' ORDER BY created_at DESC LIMIT 1 FOR UPDATE`
      );
      if (battleResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'No active battle' });
      }

      const battle = battleResult.rows[0];
      if (new Date(battle.ends_at).getTime() <= Date.now()) {
        await client.query(`UPDATE daily_battles SET status = 'failed' WHERE id = $1`, [battle.id]);
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Battle already ended' });
      }

      const userBattleResult = await client.query(
        `SELECT contribution_loc FROM user_daily_battles WHERE user_id = $1 AND battle_id = $2 FOR UPDATE`,
        [userId, battle.id]
      );
      if (userBattleResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Not joined to this battle' });
      }

      const currentContribution = parseInt(userBattleResult.rows[0].contribution_loc, 10);
      const newContribution = currentContribution + loc;

      await client.query(
        `UPDATE user_daily_battles SET contribution_loc = $3 WHERE user_id = $1 AND battle_id = $2`,
        [userId, battle.id, newContribution]
      );
      await client.query(
        `UPDATE daily_battles SET total_loc = total_loc + $2 WHERE id = $1`,
        [battle.id, loc]
      );

      // Check if target reached
      const updatedBattle = await client.query(
        `SELECT total_loc, target_loc FROM daily_battles WHERE id = $1`,
        [battle.id]
      );
      const totalLoc = parseInt(updatedBattle.rows[0].total_loc, 10);
      const targetLoc = parseInt(updatedBattle.rows[0].target_loc, 10);

      if (totalLoc >= targetLoc && battle.status === 'active') {
        await client.query(`UPDATE daily_battles SET status = 'completed' WHERE id = $1`, [battle.id]);
        await client.query(
          `UPDATE user_daily_battles SET success = true, completed_at = NOW() WHERE battle_id = $1 AND success IS NULL`,
          [battle.id]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true, contributionLoc: newContribution, totalLoc, targetLoc });
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
 * POST /api/daily-battle/claim
 */
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

      const userBattleResult = await client.query(
        `SELECT udb.*, db.severity, db.target_loc, db.status as battle_status, db.ends_at
         FROM user_daily_battles udb
         JOIN daily_battles db ON db.id = udb.battle_id
         WHERE udb.user_id = $1
         ORDER BY db.created_at DESC
         LIMIT 1
         FOR UPDATE OF udb`,
        [userId]
      );

      if (userBattleResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'No battle participation found' });
      }

      const row = userBattleResult.rows[0];
      if (row.claimed) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Reward already claimed' });
      }

      // Resolve battle status if still active and ended
      if (row.battle_status === 'active' && new Date(row.ends_at).getTime() <= Date.now()) {
        const battleLocResult = await client.query(
          `SELECT total_loc, target_loc FROM daily_battles WHERE id = $1`,
          [row.battle_id]
        );
        const totalLoc = parseInt(battleLocResult.rows[0].total_loc, 10);
        const targetLoc = parseInt(battleLocResult.rows[0].target_loc, 10);
        const newStatus = totalLoc >= targetLoc ? 'completed' : 'failed';
        await client.query(`UPDATE daily_battles SET status = $2 WHERE id = $1`, [row.battle_id, newStatus]);
        await client.query(
          `UPDATE user_daily_battles SET success = $2 WHERE battle_id = $1 AND success IS NULL`,
          [row.battle_id, newStatus === 'completed']
        );
        row.battle_status = newStatus;
        row.success = newStatus === 'completed';
      }

      if (row.battle_status === 'active') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Battle still active' });
      }

      const contributionLoc = parseInt(row.contribution_loc, 10);
      const targetLoc = parseInt(row.target_loc, 10);
      const severity = row.severity;

      let rewardPayload = null;
      let penaltyApplied = null;

      if (row.success) {
        const ratio = targetLoc > 0 ? contributionLoc / targetLoc : 0;
        rewardPayload = getRewardForSeverity(severity, ratio);

        // Normalize reward payload for applyReward
        const normalizedReward = {};
        if (typeof rewardPayload.energy === 'number') normalizedReward.energy = rewardPayload.energy;
        if (typeof rewardPayload.depressionRelief === 'number') normalizedReward.depressionRelief = rewardPayload.depressionRelief;
        if (typeof rewardPayload.commitsCurrent === 'number') normalizedReward.commitsCurrent = rewardPayload.commitsCurrent;

        await applyReward(client, userId, normalizedReward);

        // Apply coffee cups via inventory
        if (rewardPayload.coffeeCups > 0) {
          await client.query(
            `UPDATE progression
             SET inventory = COALESCE(inventory, '{}') || jsonb_build_object('coffee_cups', COALESCE((inventory->>'coffee_cups')::int, 0) + $2)
             WHERE user_id = $1`,
            [userId, rewardPayload.coffeeCups]
          );
        }
      } else {
        const penalty = getFailurePenalty(severity);
        await client.query(
          `UPDATE progression
           SET depression_level = LEAST($3, depression_level + $2),
               is_burnout = (depression_level + $2) >= $3,
               updated_at = NOW()
           WHERE user_id = $1`,
          [userId, penalty, DEPRESSION_SCALE.HEART_ATTACK_THRESHOLD]
        );
        penaltyApplied = { depressionIncrease: penalty };
      }

      await client.query(
        `UPDATE user_daily_battles
         SET claimed = true, claimed_at = NOW(), reward_payload = $3
         WHERE user_id = $1 AND battle_id = $2`,
        [userId, row.battle_id, JSON.stringify(rewardPayload || penaltyApplied)]
      );

      await client.query('COMMIT');
      res.json({
        success: true,
        battleStatus: row.battle_status,
        reward: rewardPayload,
        penalty: penaltyApplied,
        contributionLoc
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
export { getTargetLoc, getRewardForSeverity, getFailurePenalty };
