/**
 * Phase 2 state helpers for /api/state extension.
 * Provides: teamBattle, skins, achievements, crunchTime, referralChain
 */

const SKIN_PRESENTATION = {
  junior_default: {
    color: '#60a5fa',
    bgGradient: ['#30527e', '#1a3a5c'],
    emoji: '🙂',
  },
  legacy_archaeologist: {
    color: '#60a5fa',
    bgGradient: ['#1a3a5c', '#0f1b30'],
    emoji: '🏛️',
  },
  night_shift: {
    color: '#c084fc',
    bgGradient: ['#2d1a4a', '#1a0f2e'],
    emoji: '🌙',
  },
};

function mapSkinCatalogRow(row) {
  const presentation = SKIN_PRESENTATION[row.skin_id] || {};
  return {
    skinId: row.skin_id,
    name: row.name,
    description: row.description,
    rarity: row.rarity,
    unlockType: row.unlock_type,
    unlockPayload: row.unlock_payload || {},
    color: presentation.color || '#9eb6d2',
    bgGradient: presentation.bgGradient || ['#1f3552', '#10192d'],
    emoji: presentation.emoji || '🎭',
    isDefault: row.is_default === true,
  };
}

export async function getTeamBattleStatus(client, userId, teamId) {
  const seasonResult = await client.query(
    `SELECT id, season_number, end_date, target_commits, reward_payload
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
  let claimed = false;

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

  const claimResult = await client.query(
    `SELECT 1
     FROM team_battle_reward_claims
     WHERE season_id = $1 AND user_id = $2`,
    [season.id, userId]
  );
  claimed = claimResult.rows.length > 0;

  return {
    active: true,
    seasonId: season.id,
    seasonNumber: season.season_number,
    endDate: season.end_date,
    teamCommits,
    targetCommits: season.target_commits,
    teamRank,
    reward: season.reward_payload,
    claimed
  };
}

export async function getUserSkins(client, userId) {
  const catalogResult = await client.query(
    `SELECT
       skin_id,
       name,
       description,
       rarity,
       unlock_type,
       unlock_payload,
       unlock_type = 'default' AS is_default
     FROM skin_definitions
     ORDER BY
       CASE WHEN unlock_type = 'default' THEN 0 ELSE 1 END,
       id ASC`,
  );

  const defaultSkinIds = catalogResult.rows
    .filter((row) => row.is_default)
    .map((row) => row.skin_id);

  if (defaultSkinIds.length > 0) {
    await client.query(
      `INSERT INTO user_skins (user_id, skin_id, equipped)
       SELECT $1, sd.skin_id, FALSE
       FROM skin_definitions sd
       WHERE sd.unlock_type = 'default'
       ON CONFLICT (user_id, skin_id) DO NOTHING`,
      [userId],
    );
  }

  const result = await client.query(
    `SELECT us.skin_id, us.equipped
     FROM user_skins us
     WHERE us.user_id = $1`,
    [userId]
  );

  const equipped = result.rows.find(r => r.equipped)?.skin_id || null;
  const unlocked = result.rows.map(r => r.skin_id);
  const resolvedEquipped =
    equipped || defaultSkinIds[0] || unlocked[0] || null;

  if (!equipped && resolvedEquipped) {
    await client.query(
      `UPDATE user_skins
       SET equipped = (skin_id = $2)
       WHERE user_id = $1`,
      [userId, resolvedEquipped],
    );
  }

  return {
    equipped: resolvedEquipped,
    unlocked,
    catalog: catalogResult.rows.map(mapSkinCatalogRow),
  };
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

export async function getMemeTemplates(client) {
  const result = await client.query(
    `SELECT template_id, title, unlock_condition, asset_path
     FROM meme_templates
     ORDER BY id ASC`
  );
  return result.rows.map(r => ({
    id: r.template_id,
    title: r.title,
    unlockCondition: r.unlock_condition,
    assetPath: r.asset_path
  }));
}
