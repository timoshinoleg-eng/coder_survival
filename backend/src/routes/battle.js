import { Router } from 'express';
import { pool } from '../index.js';
import { BATTLE_REWARD_PREVIEW } from '../config/balance.js';
import { distributeBattleRewards } from '../utils/battleDistribution.js';
import { STAGE3 } from '../config/balance.js';
import {
  acceptBattle,
  canChallenge,
  createBattle,
  getActiveBattles,
  resolveBattle,
  upsertBattleInState
} from '../utils/battle.js';

const router = Router();
const { DAILY_BATTLE } = STAGE3;

async function getUserId(client, telegramUser) {
  const result = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramUser.id]);
  return result.rows[0]?.id || null;
}

function findBattle(state, battleId) {
  return getActiveBattles(state).find((battle) => battle.id === battleId) || null;
}

router.post('/challenge', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });

  const opponentId = Number(req.body?.opponentId);
  const stake = Number(req.body?.stake ?? DAILY_BATTLE.DEFAULT_STAKE);
  if (!Number.isInteger(opponentId) || opponentId <= 0) {
    return res.status(400).json({ error: 'Некорректный соперник' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const challengerId = await getUserId(client, telegramUser);
      if (!challengerId) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }
      if (challengerId === opponentId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Нельзя вызвать себя' });
      }

      const locked = await client.query(
        `SELECT user_id, energy, commits_total, battle_state
         FROM progression
         WHERE user_id = ANY($1::int[])
         ORDER BY user_id
         FOR UPDATE`,
        [[challengerId, opponentId]]
      );
      if (locked.rows.length !== 2) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Соперник не найден' });
      }

      const byId = new Map(locked.rows.map((row) => [Number(row.user_id), row]));
      const challenger = byId.get(challengerId);
      const opponent = byId.get(opponentId);
      if (!canChallenge(challenger.battle_state || {}, opponentId, challengerId)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Подожди 1 час перед новым вызовом' });
      }
      if (Number(challenger.energy) < stake || Number(opponent.energy) < stake) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Недостаточно энергии для ставки' });
      }

      const battle = createBattle(
        challengerId,
        opponentId,
        stake,
        Number(challenger.commits_total || 0),
        Number(opponent.commits_total || 0)
      );
      const challengerState = upsertBattleInState(challenger.battle_state || {}, battle);
      const opponentState = upsertBattleInState(opponent.battle_state || {}, battle);

      await client.query(
        `UPDATE progression
         SET energy = energy - $2,
             battle_state = $3
         WHERE user_id = $1 AND energy >= $2`,
        [challengerId, stake, JSON.stringify(challengerState)]
      );
      const opponentDebit = await client.query(
        `UPDATE progression
         SET energy = energy - $2,
             battle_state = $3
         WHERE user_id = $1 AND energy >= $2`,
        [opponentId, stake, JSON.stringify(opponentState)]
      );
      if (opponentDebit.rowCount !== 1) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Недостаточно энергии для ставки' });
      }

      await client.query('COMMIT');
      return res.json({ success: true, battle });
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

router.post('/accept', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });
  const { battleId } = req.body || {};
  if (!battleId) return res.status(400).json({ error: 'battleId is required' });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userId = await getUserId(client, telegramUser);
      if (!userId) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }

      const mineResult = await client.query(
        `SELECT battle_state FROM progression WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );
      const battle = findBattle(mineResult.rows[0]?.battle_state || {}, battleId);
      if (!battle || Number(battle.opponentId) !== userId) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Вызов не найден' });
      }
      if (battle.status !== DAILY_BATTLE.STATUSES.PENDING) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Вызов уже обработан' });
      }
      if (new Date(battle.expiresAt).getTime() <= Date.now()) {
        const expired = { ...battle, status: DAILY_BATTLE.STATUSES.EXPIRED, resolvedAt: new Date().toISOString() };
        const pairResult = await client.query(
          `SELECT user_id, battle_state
           FROM progression
           WHERE user_id = ANY($1::int[])
           ORDER BY user_id
           FOR UPDATE`,
          [[battle.challengerId, battle.opponentId]]
        );
        for (const row of pairResult.rows) {
          await client.query(
            `UPDATE progression SET battle_state = $2 WHERE user_id = $1`,
            [row.user_id, JSON.stringify(upsertBattleInState(row.battle_state || {}, expired))]
          );
        }
        await client.query('COMMIT');
        return res.status(409).json({ error: 'Вызов устарел' });
      }

      const pairResult = await client.query(
        `SELECT user_id, commits_total, battle_state
         FROM progression
         WHERE user_id = ANY($1::int[])
         ORDER BY user_id
         FOR UPDATE`,
        [[battle.challengerId, battle.opponentId]]
      );
      const byId = new Map(pairResult.rows.map((row) => [Number(row.user_id), row]));
      const accepted = acceptBattle(
        battle,
        Number(byId.get(Number(battle.challengerId))?.commits_total || 0),
        Number(byId.get(Number(battle.opponentId))?.commits_total || 0)
      );

      for (const row of pairResult.rows) {
        await client.query(
          `UPDATE progression SET battle_state = $2 WHERE user_id = $1`,
          [row.user_id, JSON.stringify(upsertBattleInState(row.battle_state || {}, accepted))]
        );
      }

      await client.query('COMMIT');
      return res.json({ success: true, battle: accepted });
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

router.get('/active', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const client = await pool.connect();
    try {
      const userId = await getUserId(client, telegramUser);
      if (!userId) return res.status(404).json({ error: 'User not found' });
      const result = await client.query(
        `SELECT battle_state FROM progression WHERE user_id = $1`,
        [userId]
      );
      return res.json({
        success: true,
        battles: getActiveBattles(result.rows[0]?.battle_state || {}),
        history: result.rows[0]?.battle_state?.history || [],
        userId,
        serverNow: new Date().toISOString()
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/resolve', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });
  const { battleId } = req.body || {};
  if (!battleId) return res.status(400).json({ error: 'battleId is required' });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userId = await getUserId(client, telegramUser);
      if (!userId) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }

      const mineResult = await client.query(
        `SELECT battle_state FROM progression WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );
      const battle = findBattle(mineResult.rows[0]?.battle_state || {}, battleId);
      if (!battle) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Бой не найден' });
      }
      if (battle.status !== DAILY_BATTLE.STATUSES.ACTIVE) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Бой ещё не активен' });
      }
      if (new Date(battle.expiresAt).getTime() > Date.now()) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Бой ещё не завершён' });
      }

      const pairResult = await client.query(
        `SELECT user_id, commits_total, battle_state
         FROM progression
         WHERE user_id = ANY($1::int[])
         ORDER BY user_id
         FOR UPDATE`,
        [[battle.challengerId, battle.opponentId]]
      );
      const byId = new Map(pairResult.rows.map((row) => [Number(row.user_id), row]));
      const resolved = resolveBattle(
        battle,
        Number(byId.get(Number(battle.challengerId))?.commits_total || 0),
        Number(byId.get(Number(battle.opponentId))?.commits_total || 0)
      );

      for (const row of pairResult.rows) {
        await client.query(
          `UPDATE progression SET battle_state = $2 WHERE user_id = $1`,
          [row.user_id, JSON.stringify(upsertBattleInState(row.battle_state || {}, resolved))]
        );
      }
      if (resolved.winnerId) {
        await client.query(
          `UPDATE progression
           SET energy = LEAST(100, energy + $2)
           WHERE user_id = $1`,
          [resolved.winnerId, resolved.stake * DAILY_BATTLE.REWARD_WINNER_MULTIPLIER]
        );
      } else {
        await client.query(
          `UPDATE progression
           SET energy = LEAST(100, energy + $2)
           WHERE user_id = ANY($1::int[])`,
          [[resolved.challengerId, resolved.opponentId], resolved.stake]
        );
      }

      await client.query('COMMIT');
      return res.json({ success: true, battle: resolved });
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
 * GET /api/battle/today
 * Lazy daily battle — no cron, computed on-the-fly from sessions today.
 * Returns top players, current user's position, and time until reset.
 */
router.get('/today', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;

  try {
    const client = await pool.connect();
    try {
      const topResult = await client.query(`
        SELECT 
          u.id,
          u.telegram_id,
          u.username,
          u.first_name,
          COALESCE(SUM(s.commits_earned), 0) as commits_today
        FROM users u
        LEFT JOIN sessions s ON s.user_id = u.id AND s.started_at >= CURRENT_DATE
        GROUP BY u.id, u.telegram_id, u.username, u.first_name
        HAVING COALESCE(SUM(s.commits_earned), 0) > 0
        ORDER BY commits_today DESC
        LIMIT 10
      `);

      const topPlayers = topResult.rows.map((row, idx) => ({
        rank: idx + 1,
        userId: row.id,
        telegramId: row.telegram_id,
        username: row.username,
        firstName: row.first_name,
        commitsToday: parseInt(row.commits_today, 10)
      }));

      let myPosition = null;
      if (telegramUser) {
        const userResult = await client.query(
          `SELECT id FROM users WHERE telegram_id = $1`,
          [telegramUser.id]
        );
        if (userResult.rows.length > 0) {
          const myUserId = userResult.rows[0].id;
          const allResult = await client.query(`
            SELECT 
              u.id,
              u.telegram_id,
              u.username,
              u.first_name,
              COALESCE(SUM(s.commits_earned), 0) as commits_today
            FROM users u
            LEFT JOIN sessions s ON s.user_id = u.id AND s.started_at >= CURRENT_DATE
            GROUP BY u.id, u.telegram_id, u.username, u.first_name
            HAVING COALESCE(SUM(s.commits_earned), 0) > 0
            ORDER BY commits_today DESC
          `);

          const idx = allResult.rows.findIndex(r => r.id === myUserId);
          if (idx >= 0) {
            const around = 2;
            const start = Math.max(0, idx - around);
            const end = Math.min(allResult.rows.length, idx + around + 1);
            myPosition = {
              rank: idx + 1,
              commitsToday: parseInt(allResult.rows[idx].commits_today, 10),
              players: allResult.rows.slice(start, end).map((r, i) => ({
                rank: start + i + 1,
                userId: r.id,
                telegramId: r.telegram_id,
                username: r.username,
                firstName: r.first_name,
                commitsToday: parseInt(r.commits_today, 10),
                isMe: r.id === myUserId
              }))
            };
          }
        }
      }

      const now = new Date();
      const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const timeUntilReset = Math.max(0, midnight.getTime() - now.getTime());

      res.json({
        topPlayers,
        myPosition,
        timeUntilReset,
        rewardPreview: BATTLE_REWARD_PREVIEW
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/battle/distribute
 * Admin/cron-only: distribute yesterday's battle rewards.
 * Protected by BOT_BACKEND_SECRET header.
 */
const BOT_BACKEND_SECRET = process.env.BOT_BACKEND_SECRET;

router.post('/distribute', async (req, res, next) => {
  const headerSecret = req.get('X-Bot-Backend-Secret');
  if (!BOT_BACKEND_SECRET || headerSecret !== BOT_BACKEND_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { date } = req.body || {};

  try {
    const client = await pool.connect();
    try {
      const result = await distributeBattleRewards(client, date ? new Date(date) : null);
      res.json({
        success: true,
        ...result
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
