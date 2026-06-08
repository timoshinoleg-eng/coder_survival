import cron from 'node-cron';
import { pool } from '../index.js';
import { generateDailyBattle } from '../routes/dailyBattle.js';

const ENABLE_CRON = process.env.ENABLE_DAILY_BATTLE_CRON !== 'false';

async function closeActiveBattle(client) {
  const activeResult = await client.query(
    `SELECT id, total_loc, target_loc, status FROM daily_battles WHERE status = 'active' ORDER BY created_at DESC LIMIT 1 FOR UPDATE`
  );
  if (activeResult.rows.length === 0) return null;

  const battle = activeResult.rows[0];
  const success = parseInt(battle.total_loc, 10) >= parseInt(battle.target_loc, 10);
  const newStatus = success ? 'completed' : 'failed';

  await client.query(
    `UPDATE daily_battles SET status = $2 WHERE id = $1`,
    [battle.id, newStatus]
  );
  await client.query(
    `UPDATE user_daily_battles
     SET success = $2, completed_at = NOW()
     WHERE battle_id = $1 AND success IS NULL`,
    [battle.id, success]
  );

  return { battleId: battle.id, status: newStatus, success };
}

async function createNewBattle(client) {
  const battle = generateDailyBattle();
  const result = await client.query(
    `INSERT INTO daily_battles (battle_date, bug_type, deadline_hours, severity, reset_time, status, target_loc, ends_at)
     VALUES (CURRENT_DATE, $1, $2, $3, $4, 'active', $5, $6)
     RETURNING id`,
    [battle.bugType, battle.deadlineHours, battle.severity, battle.resetTime, battle.targetLoc, battle.endsAt]
  );
  return { battleId: result.rows[0].id, ...battle };
}

async function runDailyBattleReset() {
  const client = await pool.connect();
  try {
    console.log('[dailyBattleCron] Running daily battle reset...');
    await client.query('BEGIN');

    const closed = await closeActiveBattle(client);
    if (closed) {
      console.log(`[dailyBattleCron] Closed battle ${closed.battleId} as ${closed.status}`);
    }

    const created = await createNewBattle(client);
    console.log(`[dailyBattleCron] Created battle ${created.battleId}: ${created.bugEmoji} ${created.bugName} (${created.severity}, ${created.deadlineHours}h)`);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[dailyBattleCron] Error during daily battle reset:', err);
  } finally {
    client.release();
  }
}

export function startDailyBattleCron() {
  if (!ENABLE_CRON) {
    console.log('[dailyBattleCron] Cron disabled via ENABLE_DAILY_BATTLE_CRON=false');
    return;
  }

  // Run at 10:00 UTC and 19:00 UTC every day
  const task10 = cron.schedule('0 10 * * *', runDailyBattleReset, {
    timezone: 'UTC',
    scheduled: true
  });

  const task19 = cron.schedule('0 19 * * *', runDailyBattleReset, {
    timezone: 'UTC',
    scheduled: true
  });

  console.log('[dailyBattleCron] Scheduled daily battles for 10:00 UTC and 19:00 UTC');
  return { task10, task19 };
}

// Allow manual trigger for testing/admin
export { runDailyBattleReset };
