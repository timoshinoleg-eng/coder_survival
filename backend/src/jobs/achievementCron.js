import { pool } from '../index.js';
import { checkAchievementsForUser } from '../utils/achievementsEngine.js';

const BATCH_SIZE = 100;
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function startAchievementCron() {
  console.log('[AchievementCron] Starting...');
  runCron();
  setInterval(runCron, INTERVAL_MS);
}

async function runCron() {
  let client;
  try {
    client = await pool.connect();
    let processed = 0;
    let granted = 0;

    const usersResult = await client.query(
      `SELECT id FROM users WHERE updated_at > NOW() - INTERVAL '24 hours'`
    );

    const userIds = usersResult.rows.map((r) => r.id);

    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);

      for (const userId of batch) {
        const skinsResult = await client.query(
          `SELECT COUNT(*) as cnt FROM user_skins WHERE user_id = $1`,
          [userId]
        );
        const currentSkins = parseInt(skinsResult.rows[0].cnt, 10);

        const battlesResult = await client.query(
          `SELECT COUNT(DISTINCT battle_id) as cnt FROM team_battle_contributions WHERE user_id = $1`,
          [userId]
        );
        const currentBattles = parseInt(battlesResult.rows[0].cnt, 10);

        const { newlyEarned } = await checkAchievementsForUser(
          userId,
          ['skins_count', 'battle_count'],
          { currentSkins, currentBattles }
        );

        processed += 1;
        granted += newlyEarned.length;
      }
    }

    console.log(`[AchievementCron] Processed ${processed} users, granted ${granted} achievements`);
  } catch (err) {
    console.error('[AchievementCron] Error:', err.message);
  } finally {
    if (client) {
      client.release();
    }
  }
}
