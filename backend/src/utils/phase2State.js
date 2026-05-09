/**
 * Phase 2 state helpers for /api/state extension.
 * Provides: teamBattle, skins, achievements, crunchTime, referralChain, isDead
 */

export async function getTeamBattleStatus(client, userId, teamId) {
  const seasonResult = await client.query(
    `SELECT id, season_number, target_commits, reward_payload
     FROM team_battle_seasons
     WHERE status = 'active'
     ORDER BY start_date DESC
     LIMIT 1`
  );

  if (seasonResult.rows.length === 0) {
    return null;
  }

  const season = seasonResult.rows[0];

  let teamCommits = 0;
  let teamRank = null;

  if (teamId) {
    const contribResult = await client.query(
      `SELECT COALESCE(SUM(commits_contributed), 0) as total
       FROM team_battle_contributions
       WHERE season_id = $1 AND team_id = $2`,
      [season.id, teamId]
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
    const idx = rankResult.rows.findIndex(r => r.team_id === teamId);
    teamRank = idx >= 0 ? idx + 1 : null;
  }

  return {
    active: true,
    seasonNumber: season.season_number,
    teamCommits,
    targetCommits: season.target_commits,
    teamRank,
    reward: season.reward_payload
  };
}

export async function getUserSkins(client, userId) {
  const result = await client.query(
    `SELECT us.skin_id, us.equipped, sd.name, sd.description, sd.rarity
     FROM user_skins us
     JOIN skin_definitions sd ON sd.skin_id = us.skin_id
     WHERE us.user_id = $1`,
    [userId]
  );

  const equipped = result.rows.find(r => r.equipped)?.skin_id || null;
  const unlocked = result.rows.map(r => r.skin_id);

  return { equipped, unlocked };
}

export async function getUserAchievements(client, userId) {
  const result = await client.query(
    `SELECT
       a.achievement_id,
       a.name,
       a.description,
       a.target_value,
       a.reward_payload,
       COALESCE(ua.progress_value, 0) as progress_value,
       COALESCE(ua.completed, FALSE) as completed,
       COALESCE(ua.claimed, FALSE) as claimed
     FROM achievements a
     LEFT JOIN user_achievements ua
       ON ua.achievement_id = a.achievement_id AND ua.user_id = $1
     ORDER BY a.id ASC`,
    [userId]
  );

  return result.rows.map(r => ({
    id: r.achievement_id,
    name: r.name,
    description: r.description,
    target: r.target_value,
    progress: r.progress_value,
    completed: r.completed,
    claimed: r.claimed,
    reward: r.reward_payload
  }));
}

export async function getActiveCrunchTime(client) {
  const result = await client.query(
    `SELECT id, start_date, end_date, commit_multiplier, depression_multiplier, reward_payload
     FROM crunch_time_events
     WHERE status = 'active'
       AND start_date <= NOW()
       AND end_date >= NOW()
     ORDER BY start_date DESC
     LIMIT 1`
  );

  if (result.rows.length === 0) {
    return null;
  }

  const e = result.rows[0];
  return {
    active: true,
    endsAt: e.end_date.toISOString(),
    commitMultiplier: parseFloat(e.commit_multiplier),
    depressionMultiplier: parseFloat(e.depression_multiplier),
    reward: e.reward_payload
  };
}

export async function getReferralChain(client, userId) {
  const activeResult = await client.query(
    `SELECT COUNT(*) as cnt
     FROM referrals
     WHERE referrer_id = $1
       AND status = 'completed'`,
    [userId]
  );
  const activeReferrals = parseInt(activeResult.rows[0].cnt, 10);

  const milestones = [3, 5, 10];
  const nextMilestone = milestones.find(m => m > activeReferrals) || null;

  return {
    activeReferrals,
    nextMilestone,
    milestoneReward: nextMilestone ? { energy: nextMilestone * 10 } : null
  };
}

export function getDeathState(progression) {
  const isDead = progression?.depression_level >= 100;
  if (!isDead) {
    return { isDead: false, death: null };
  }
  return {
    isDead: true,
    death: {
      canRespawn: true,
      respawnCost: { energy: 50 }
    }
  };
}
