import cron from 'node-cron';
import { pool } from '../index.js';
import { distributeDailySummaryRewards, buildChatMessage } from '../utils/dailySummary.js';
import { postToTelegramChat, sendPollToChat } from '../utils/telegram.js';

const ENABLE_CRON = process.env.ENABLE_DAILY_SUMMARY_CRON !== 'false';

async function runDailySummary() {
  const client = await pool.connect();
  try {
    console.log('[dailySummaryCron] Running daily summary distribution...');
    const result = await distributeDailySummaryRewards(client);

    if (result.alreadyDistributed) {
      console.log('[dailySummaryCron] Already distributed for', result.date);
      return;
    }

    console.log(`[dailySummaryCron] Distributed for ${result.date}: ${result.distributed} players`);

    if (result.distributed === 0) {
      return;
    }

    // Build chat message from top results
    const topResults = result.results.slice(0, 10);
    const message = buildChatMessage(topResults, result.date);

    // Find all users with bound work_chat_id who are in top results
    const userIds = topResults.map(r => r.userId);
    if (userIds.length === 0) return;

    const chatResult = await client.query(
      `SELECT user_id, (social_state->>'work_chat_id')::bigint AS chat_id
       FROM progression
       WHERE user_id = ANY($1::int[])
         AND social_state->>'work_chat_id' IS NOT NULL`,
      [userIds]
    );

    const chatMap = new Map(chatResult.rows.map(r => [r.user_id, r.chat_id]));

    // Post to each unique chat
    const postedChats = new Set();
    for (const entry of topResults) {
      const chatId = chatMap.get(entry.userId);
      if (chatId && !postedChats.has(chatId)) {
        postedChats.add(chatId);
        await postToTelegramChat(chatId, message);
      }
    }

    console.log(`[dailySummaryCron] Posted to ${postedChats.size} chat(s)`);

    // Phase 10: Send follow-up poll to each unique chat
    for (const chatId of postedChats) {
      try {
        await sendPollToChat(
          chatId,
          'Как прошел день?',
          ['Продуктивно', 'Выгорел', 'Нужен кофе']
        );
      } catch (pollErr) {
        console.error(`[dailySummaryCron] Poll send failed for chat ${chatId}:`, pollErr.message);
      }
    }
  } catch (err) {
    console.error('[dailySummaryCron] Error during daily summary:', err);
  } finally {
    client.release();
  }
}

export function startDailySummaryCron() {
  if (!ENABLE_CRON) {
    console.log('[dailySummaryCron] Cron disabled via ENABLE_DAILY_SUMMARY_CRON=false');
    return;
  }

  // Run every day at 18:00 UTC
  const task = cron.schedule('0 18 * * *', runDailySummary, {
    timezone: 'UTC',
    scheduled: true
  });

  console.log('[dailySummaryCron] Scheduled daily summary for 18:00 UTC');
  return task;
}

// Allow manual trigger for testing/admin
export { runDailySummary };
