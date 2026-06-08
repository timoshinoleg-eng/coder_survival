import { applyReward } from './rewards.js';
import { STAGE2 } from '../config/balance.js';
import { getProductById } from './shopCatalog.js';

export const { PASS } = STAGE2;

/**
 * Sprint Pass v1 — compact battle pass.
 * One active season, 20 levels, XP from the normal tap XP curve.
 */

export function getPassRequiredXp(level) {
  const normalizedLevel = Number(level || 0);
  if (!Number.isInteger(normalizedLevel) || normalizedLevel < 1 || normalizedLevel > PASS.MAX_LEVEL) {
    return null;
  }
  const tiers = [
    { end: 10, xp: 100 },
    { end: 20, xp: 150 },
    { end: 30, xp: 200 },
    { end: 40, xp: 250 },
    { end: 50, xp: 300 },
  ];
  for (const tier of tiers) {
    if (normalizedLevel <= tier.end) return tier.xp;
  }
  return 300;
}

export function calculateCatchUpXp(missedDays, avgDailyXP) {
  const days = Math.max(0, Math.floor(Number(missedDays || 0)));
  const average = Math.max(0, Number(avgDailyXP || 0));
  return Math.floor(days * average * PASS.CATCH_UP.missedDayPercent);
}

export function calculateCappedCatchUpXp(missedDays, avgDailyXP) {
  const cappedDays = Math.min(PASS.CATCH_UP.catchUpCapDays || 3, Math.max(0, Math.floor(Number(missedDays || 0))));
  return calculateCatchUpXp(cappedDays, avgDailyXP);
}

export function getWeekendXpMultiplier(date = new Date()) {
  const day = date.getUTCDay();
  return day === 0 || day === 6 ? PASS.CATCH_UP.weekendMultiplier : 1;
}

export function applyPassXpSourceMultiplier(amount, source, date = new Date()) {
  const normalized = Math.max(0, Number(amount || 0));
  const weekendSources = new Set(['tap_xp', 'quest_xp', 'generator_xp', 'event_xp']);
  if (!weekendSources.has(source)) return normalized;
  return Math.floor(normalized * getWeekendXpMultiplier(date));
}

export async function getActivePass(client) {
  const result = await client.query(
    `SELECT id, season_number, season_name, start_date, end_date, theme
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

export function calculatePassLevel(passState = {}) {
  let remaining = Number(passState.currentXp || 0);
  let level = 0;
  let nextReq = 0;

  for (const passLevel of PASS.LEVELS) {
    if (remaining >= passLevel.requiredXp) {
      remaining -= passLevel.requiredXp;
      level = passLevel.level;
    } else {
      nextReq = passLevel.requiredXp;
      break;
    }
  }

  if (level >= PASS.MAX_LEVEL) {
    return {
      currentLevel: PASS.MAX_LEVEL,
      progressToNext: 1.0,
      nextLevelXp: 0,
      remainingXp: remaining
    };
  }

  return {
    currentLevel: level,
    progressToNext: nextReq > 0 ? remaining / nextReq : 1.0,
    nextLevelXp: nextReq,
    remainingXp: remaining
  };
}

export function addPassXp(passStateOrClient, amountOrUserId, maybeXpAmount) {
  if (passStateOrClient?.query && typeof amountOrUserId !== 'undefined') {
    return addDbPassXp(passStateOrClient, amountOrUserId, maybeXpAmount);
  }

  const passState = passStateOrClient || {};
  const amount = Number(amountOrUserId || 0);
  const before = calculatePassLevel(passState);
  const newXp = Number(passState.currentXp || 0) + amount;
  const nextState = {
    seasonId: passState.seasonId || PASS.SEASON_ID,
    seasonStartDate: passState.seasonStartDate || process.env.STAGE2_PASS_SEASON_START_DATE || '2026-05-01',
    currentXp: newXp,
    claimedLevels: Array.isArray(passState.claimedLevels) ? passState.claimedLevels : [],
    premiumUnlocked: passState.premiumUnlocked === true
  };
  const after = calculatePassLevel(nextState);

  return {
    newState: nextState,
    leveledUp: after.currentLevel > before.currentLevel,
    newLevel: after.currentLevel,
    levelsGained: after.currentLevel - before.currentLevel
  };
}

export function getClaimableRewards(passState = {}) {
  const { currentLevel } = calculatePassLevel(passState);
  const claimed = new Set(passState.claimedLevels || []);
  const premium = passState.premiumUnlocked === true;
  const result = [];

  for (let level = 1; level <= currentLevel; level++) {
    if (!claimed.has(level)) {
      result.push({
        level,
        free: PASS.FREE_REWARDS[level] || null,
        premium: premium ? (PASS.PREMIUM_REWARDS[level] || null) : null
      });
    }
  }

  return result;
}

export function claimLevelRewards(passState = {}, level) {
  const { currentLevel } = calculatePassLevel(passState);
  if (level > currentLevel) throw new Error('Level not reached');

  const claimed = new Set(passState.claimedLevels || []);
  if (claimed.has(level)) throw new Error('Already claimed');

  claimed.add(level);
  return {
    seasonId: passState.seasonId || PASS.SEASON_ID,
    seasonStartDate: passState.seasonStartDate || process.env.STAGE2_PASS_SEASON_START_DATE || '2026-05-01',
    currentXp: Number(passState.currentXp || 0),
    premiumUnlocked: passState.premiumUnlocked === true,
    claimedLevels: Array.from(claimed).sort((left, right) => left - right)
  };
}

async function addDbPassXp(client, userId, xpAmount) {
  const pass = await getActivePass(client);
  if (!pass || xpAmount <= 0) return null;

  let playerPass = await ensurePlayerPass(client, userId, pass.id);

  // Simple level-up loop
  let leveledUp = false;
  let newLevel = playerPass.current_level;
  let newXp = playerPass.current_xp + xpAmount;

  const rewards = await getPassRewards(client, pass.id);
  const maxLevel = rewards.length > 0 ? Math.max(...rewards.map(r => r.level)) : PASS.MAX_LEVEL;

  while (newLevel < maxLevel) {
    const rewardDef = rewards.find(r => r.level === newLevel);
    const required = rewardDef ? rewardDef.required_xp : getPassRequiredXp(newLevel);
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
         current_xp = $4
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

  const payload = track === 'premium' ? rewardDef.premium_reward_payload : rewardDef.free_reward_payload;
  const claimResult = await client.query(
    `INSERT INTO pass_claims (user_id, pass_id, level, track)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, pass_id, level, track) DO NOTHING
     RETURNING id`,
    [userId, pass.id, level, track]
  );
  if (claimResult.rows.length === 0) {
    return { error: 'Already claimed', status: 409 };
  }

  const rewardResult = await applyReward(client, userId, payload);

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
     SET is_premium = TRUE
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

  const currentLevel = status.playerPass?.current_level || 0;
  const currentXp = status.playerPass?.current_xp || 0;
  const nextReward = (status.rewards || []).find(r => r.level === currentLevel);
  const nextLevelXp = nextReward ? nextReward.requiredXp : getPassRequiredXp(currentLevel) || 0;
  const remainingXp = nextLevelXp > 0 ? nextLevelXp - currentXp : 0;

  const daysRemaining = status.pass?.end_date
    ? Math.max(0, Math.ceil((new Date(status.pass.end_date).getTime() - Date.now()) / 86400000))
    : 0;

  return {
    pass: status.pass ? {
      id: status.pass.id,
      seasonNumber: status.pass.season_number,
      seasonName: status.pass.season_name,
      startDate: status.pass.start_date,
      endDate: status.pass.end_date,
      theme: status.pass.theme,
      daysRemaining,
      refund: {
        totalRefundPercent: PASS.CATCH_UP.premiumTrackRefundPercent,
        currencySplit: PASS.CATCH_UP.premiumTrackRefundCurrencySplit,
        distribution: PASS.CATCH_UP.premiumTrackRefundDistribution,
      },
    } : null,
    playerPass: status.playerPass ? {
      id: status.playerPass.id,
      userId: status.playerPass.user_id,
      passId: status.playerPass.pass_id,
      currentLevel: status.playerPass.current_level,
      currentXp: status.playerPass.current_xp,
      isPremium: status.playerPass.is_premium,
      createdAt: status.playerPass.created_at,
      nextLevelXp,
      remainingXp
    } : null,
    rewards: status.rewards || [],
    premiumPassProduct: getProductById('premium_pass')
  };
}
