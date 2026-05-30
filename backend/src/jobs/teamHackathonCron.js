import cron from 'node-cron';
import { pool } from '../index.js';
import { getWeekId, getHackathonTier, calculateHackathonTarget, buildHackathonFinalMessage } from '../utils/teamHackathon.js';
import { postToTelegramChat } from '../utils/telegram.js';

const ENABLE_CRON = process.env.ENABLE_TEAM_HACKATHON_CRON !== 'false';

async function runTeamHackathonFinal() {
  const client = await pool.connect();
  try {
    console.log('[teamHackathonCron] Running weekly team hackathon final post...');

    // Get all teams
    const teamsResult = await client.query(
      `SELECT t.id AS team_id, t.name AS team_name
       FROM teams t`
    );
    const teams = teamsResult.rows;
    if (teams.length === 0) {
      console.log('[teamHackathonCron] No teams found');
      return;
    }

    for (const team of teams) {
      const teamId = team.team_id;

      // Get team members
      const membersResult = await client.query(
        `SELECT tm.user_id, u.username, u.first_name, tm.last_active_at
         FROM team_members tm
         JOIN users u ON u.id = tm.user_id
         WHERE tm.team_id = $1
         ORDER BY tm.joined_at ASC`,
        [teamId]
      );
      const memberIds = membersResult.rows.map(r => r.user_id);
      if (memberIds.length === 0) continue;

      // Get hackathon states for current week
      const weekId = getWeekId(new Date(), 0);
      const statesResult = await client.query(
        `SELECT user_id, team_hackathon_state
         FROM progression
         WHERE user_id = ANY($1::int[])`,
        [memberIds]
      );

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
      progress = Object.values(contributions).reduce((sum, v) => sum + Number(v || 0), 0);

      const sevenDaysAgo = Date.now() - 7 * 86400000;
      const activeCount = membersResult.rows.filter(r => r.last_active_at && new Date(r.last_active_at).getTime() >= sevenDaysAgo).length;
      const target = calculateHackathonTarget(activeCount);
      const tier = getHackathonTier(progress, target);
      const success = tier === 'GOLD';

      const memberList = membersResult.rows.map(r => ({
        userId: r.user_id,
        username: r.username,
        firstName: r.first_name,
        contribution: contributions[String(r.user_id)] || 0
      }));

      const message = buildHackathonFinalMessage(team.team_name, progress, target, tier, memberList, success);

      // Post to each member's bound work chat
      const chatResult = await client.query(
        `SELECT DISTINCT (social_state->>'work_chat_id')::bigint AS chat_id
         FROM progression
         WHERE user_id = ANY($1::int[])
           AND social_state->>'work_chat_id' IS NOT NULL`,
        [memberIds]
      );

      for (const row of chatResult.rows) {
        if (row.chat_id) {
          await postToTelegramChat(row.chat_id, message);
        }
      }

      console.log(`[teamHackathonCron] Team "${team.team_name}": ${progress}/${target} (${tier || 'none'}) posted to ${chatResult.rows.length} chat(s)`);
    }
  } catch (err) {
    console.error('[teamHackathonCron] Error:', err);
  } finally {
    client.release();
  }
}

export function startTeamHackathonCron() {
  if (!ENABLE_CRON) {
    console.log('[teamHackathonCron] Cron disabled via ENABLE_TEAM_HACKATHON_CRON=false');
    return;
  }

  // Sunday 21:00 UTC
  const task = cron.schedule('0 21 * * 0', runTeamHackathonFinal, {
    timezone: 'UTC',
    scheduled: true
  });

  console.log('[teamHackathonCron] Scheduled weekly final post for Sunday 21:00 UTC');
  return task;
}

export { runTeamHackathonFinal };
