import { applyReward } from './rewards.js';

/**
 * Sprint Pass v1 — compact battle pass.
 * One active season, 20 levels, XP from the normal tap XP curve.
 */

export async function getActivePass(client) {
  const result = await client.query(
    `SELECT id, season_number, season_name, start_date, end_date
     FROM sprint_passes
     WHERE is_active = TRUE
       AND start_date <= CURRENT_DATE
       AND end_date >= CURRENT_DATE
     ORDER BY season_number DESC
     LIMIT 1`
  );
  return result.rows[0] || null;
}

export async function getPassRewards(client, passId) {
  const result = await client.query(
    `SELECT level, required_xp, free_reward_payload, premium_reward_payload
     FROM pass_rewards
     WHERE pass_id = $1
     ORDER BY level ASC`,
    [passId]
  );
  return result.rows;
}

export async function ensurePlayerPass(client, userId, passId) {
  const result = await client.query(
    `INSERT INTO player_passes (user_id, pass_id, current_level, current_xp)
     VALUES ($1, $2, 1, 0)
     ON CONFLICT (user_id, pass_id) DO NOTHING
     RETURNING *`,
    [userId, passId]
  );
  if (result.rows.length > 0) return result.rows[0];

  const existing = await client.query(
    `SELECT * FROM player_passes WHERE user_id = $1 AND pass_id = $2`,
    [userId, passId]
  );
  return existing.rows[0] || null;
}

export async function addPassXp(client, userId, xpAmount) {
  const pass = await getActivePass(client);
  if (!pass || xpAmount <= 0) return null;

  let playerPass = await ensurePlayerPass(client, userId, pass.id);

  // Simple level-up loop
  let leveledUp = false;
  let newLevel = playerPass.current_level;
  let newXp = playerPass.current_xp + xpAmount;

  const rewards = await getPassRewards(client, pass.id);
  const maxLevel = rewards.length > 0 ? Math.max(...rewards.map(r => r.level)) : 20;

  while (newLevel < maxLevel) {
    const rewardDef = rewards.find(r => r.level === newLevel);
    const required = rewardDef ? rewardDef.required_xp : 30;
    if (newXp < required) break;
    newXp -= required;
    newLevel += 1;
    leveledUp = true;
  }

  // Cap XP at max level
  if (newLevel >= maxLevel) {
    newLevel = maxLevel;
    newXp = 0;
  }

  const result = await client.query(
    `UPDATE player_passes
     SET current_level = $3,
         current_xp = $4,
         updated_at = NOW()
     WHERE user_id = $1 AND pass_id = $2
     RETURNING *`,
    [userId, pass.id, newLevel, newXp]
  );

  return {
    pass,
    playerPass: result.rows[0],
    leveledUp,
    rewards
  };
}

export async function getPassStatus(client, userId) {
  const pass = await getActivePass(client);
  if (!pass) return null;

  const playerPass = await ensurePlayerPass(client, userId, pass.id);
  const rewards = await getPassRewards(client, pass.id);

  const claimedResult = await client.query(
    `SELECT level, track FROM pass_claims WHERE user_id = $1 AND pass_id = $2`,
    [userId, pass.id]
  );
  const claimed = new Set(claimedResult.rows.map(r => `${r.level}:${r.track}`));

  return normalizePassStatus({
    pass,
    playerPass,
    rewards: rewards.map(r => ({
      level: r.level,
      requiredXp: r.required_xp,
      freeReward: r.free_reward_payload,
      premiumReward: r.premium_reward_payload,
      freeClaimed: claimed.has(`${r.level}:free`),
      premiumClaimed: claimed.has(`${r.level}:premium`),
      unlocked: r.level <= playerPass.current_level
    }))
  });
}

export async function claimPassReward(client, userId, level, track) {
  const pass = await getActivePass(client);
  if (!pass) {
    return { error: 'No active pass', status: 404 };
  }

  const playerPass = await ensurePlayerPass(client, userId, pass.id);
  if (level > playerPass.current_level) {
    return { error: 'Level not reached', status: 409 };
  }

  const rewards = await getPassRewards(client, pass.id);
  const rewardDef = rewards.find(r => r.level === level);
  if (!rewardDef) {
    return { error: 'Invalid level', status: 400 };
  }

  if (track === 'premium' && !playerPass.is_premium) {
    return { error: 'Premium not purchased', status: 403 };
  }

  const existing = await client.query(
    `SELECT 1 FROM pass_claims WHERE user_id = $1 AND pass_id = $2 AND level = $3 AND track = $4`,
    [userId, pass.id, level, track]
  );
  if (existing.rows.length > 0) {
    return { error: 'Already claimed', status: 409 };
  }

  const payload = track === 'premium' ? rewardDef.premium_reward_payload : rewardDef.free_reward_payload;
  const rewardResult = await applyReward(client, userId, payload);

  await client.query(
    `INSERT INTO pass_claims (user_id, pass_id, level, track)
     VALUES ($1, $2, $3, $4)`,
    [userId, pass.id, level, track]
  );

  // Audit hook
  await client.query(
    `INSERT INTO audit_logs (user_id, action, context)
     VALUES ($1, 'pass_claim', $2)`,
    [userId, JSON.stringify({ passId: pass.id, level, track, rewardApplied: rewardResult.applied })]
  );

  return {
    reward: payload,
    applied: rewardResult.applied,
    status: 200
  };
}

export async function unlockPremiumPass(client, userId) {
  const pass = await getActivePass(client);
  if (!pass) {
    return { error: 'No active pass', status: 404 };
  }

  const playerPass = await ensurePlayerPass(client, userId, pass.id);
  if (playerPass.is_premium) {
    return { pass, alreadyOwned: true, status: 200 };
  }

  const result = await client.query(
    `UPDATE player_passes
     SET is_premium = TRUE,
         updated_at = NOW()
     WHERE user_id = $1 AND pass_id = $2
     RETURNING *`,
    [userId, pass.id]
  );

  await client.query(
    `INSERT INTO audit_logs (user_id, action, context)
     VALUES ($1, 'pass_premium_unlock', $2)`,
    [userId, JSON.stringify({ passId: pass.id, seasonNumber: pass.season_number })]
  );

  return {
    pass,
    playerPass: result.rows[0],
    alreadyOwned: false,
    status: 200
  };
}

export function normalizePassStatus(status) {
  if (!status) return null;

  return {
    pass: status.pass ? {
      id: status.pass.id,
      seasonNumber: status.pass.season_number,
      seasonName: status.pass.season_name,
      startDate: status.pass.start_date,
      endDate: status.pass.end_date
    } : null,
    playerPass: status.playerPass ? {
      id: status.playerPass.id,
      userId: status.playerPass.user_id,
      passId: status.playerPass.pass_id,
      currentLevel: status.playerPass.current_level,
      currentXp: status.playerPass.current_xp,
      isPremium: status.playerPass.is_premium,
      createdAt: status.playerPass.created_at,
      updatedAt: status.playerPass.updated_at
    } : null,
    rewards: status.rewards || []
  };
}
