import { Router } from 'express';
import { pool } from '../index.js';
import { STAGE2 } from '../config/balance.js';
import {
  calculatePassLevel,
  claimLevelRewards,
  getClaimableRewards
} from '../utils/pass.js';
import { ensurePlayerLevel } from '../utils/vnext.js';

const router = Router();
const { PASS } = STAGE2;

function getSeasonStartDate() {
  const configured = process.env.STAGE2_PASS_SEASON_START_DATE || '2026-05-01';
  return new Date(`${configured}T00:00:00.000Z`);
}

function getDaysRemaining(now = new Date()) {
  const seasonEnd = new Date(getSeasonStartDate());
  seasonEnd.setUTCDate(seasonEnd.getUTCDate() + PASS.SEASON_DAYS);
  return Math.max(0, Math.ceil((seasonEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

async function ensureUserAndProgression(client, telegramUser) {
  const userResult = await client.query(
    `INSERT INTO users (telegram_id, username, first_name, last_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_id) DO UPDATE SET
       username = COALESCE(EXCLUDED.username, users.username),
       first_name = COALESCE(EXCLUDED.first_name, users.first_name),
       last_name = COALESCE(EXCLUDED.last_name, users.last_name),
       last_active = NOW()
     RETURNING id`,
    [
      telegramUser.id,
      telegramUser.username || null,
      telegramUser.first_name || null,
      telegramUser.last_name || null
    ]
  );
  const userId = userResult.rows[0].id;
  await client.query(
    `INSERT INTO progression (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
  await ensurePlayerLevel(client, userId);
  return userId;
}

function normalizePassState(passState = {}) {
  if (passState.seasonId === PASS.SEASON_ID) {
    return {
      seasonId: passState.seasonId,
      seasonStartDate: passState.seasonStartDate || getSeasonStartDate().toISOString().slice(0, 10),
      currentXp: Number(passState.currentXp || 0),
      claimedLevels: Array.isArray(passState.claimedLevels) ? passState.claimedLevels : [],
      premiumUnlocked: passState.premiumUnlocked === true
    };
  }

  return {
    seasonId: PASS.SEASON_ID,
    seasonStartDate: getSeasonStartDate().toISOString().slice(0, 10),
    currentXp: 0,
    claimedLevels: [],
    premiumUnlocked: false
  };
}

function buildPassPayload(passState) {
  const levelInfo = calculatePassLevel(passState);
  const claimableRewards = getClaimableRewards(passState);
  return {
    seasonId: PASS.SEASON_ID,
    daysRemaining: getDaysRemaining(),
    currentLevel: levelInfo.currentLevel,
    progressToNext: Math.round(levelInfo.progressToNext * 100) / 100,
    nextLevelXp: levelInfo.nextLevelXp,
    remainingXp: levelInfo.remainingXp,
    currentXp: passState.currentXp,
    premiumUnlocked: passState.premiumUnlocked === true,
    claimedLevels: passState.claimedLevels,
    claimableCount: claimableRewards.length,
    claimableRewards,
    levels: PASS.LEVELS.map((level) => ({
      ...level,
      freeReward: PASS.FREE_REWARDS[level.level] || null,
      premiumReward: PASS.PREMIUM_REWARDS[level.level] || null,
      claimed: passState.claimedLevels.includes(level.level),
      unlocked: level.level <= levelInfo.currentLevel
    }))
  };
}

function mergeInventory(current, reward) {
  const next = { ...(current || {}) };
  if (!reward) return next;

  if (reward.stars) next.stars = Number(next.stars || 0) + Number(reward.stars || 0);
  if (reward.skinFragment) next[`fragment_${reward.skinFragment}`] = Number(next[`fragment_${reward.skinFragment}`] || 0) + 1;
  if (reward.skin) next[`skin_${reward.skin}`] = 1;
  if (reward.title) next[`title_${reward.title}`] = 1;
  if (reward.animation) next[`animation_${reward.animation}`] = 1;
  return next;
}

function combineRewards(left, right) {
  const result = { ...(left || {}) };
  if (!right) return result;
  for (const [key, value] of Object.entries(right)) {
    if (typeof value === 'number') result[key] = Number(result[key] || 0) + value;
    else result[key] = value;
  }
  return result;
}

async function applyPassReward(client, userId, progression, reward) {
  if (!reward) return progression.inventory || {};

  const levelRow = await ensurePlayerLevel(client, userId);
  const maxEnergy = levelRow.resolved.maxEnergy;
  const inventory = mergeInventory(progression.inventory || {}, reward);

  if (Number(reward.xp || 0) > 0) {
    await client.query(
      `UPDATE player_levels
       SET xp_total = xp_total + $2
       WHERE user_id = $1`,
      [userId, Number(reward.xp || 0)]
    );
  }

  await client.query(
    `UPDATE progression
     SET energy = LEAST($2, energy + $3),
         depression_level = GREATEST(0, depression_level - $4),
         is_burnout = GREATEST(0, depression_level - $4) >= 100,
         inventory = $5
     WHERE user_id = $1`,
    [
      userId,
      maxEnergy,
      Number(reward.energy || 0),
      Number(reward.depressionRelief || 0),
      JSON.stringify(inventory)
    ]
  );

  return inventory;
}

router.get(['/', '/status'], async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  let client;
  try {
    client = await pool.connect();
    const userId = await ensureUserAndProgression(client, telegramUser);
    const result = await client.query(
      `SELECT pass_state
       FROM progression
       WHERE user_id = $1`,
      [userId]
    );
    const passState = normalizePassState(result.rows[0]?.pass_state || {});

    if (JSON.stringify(passState) !== JSON.stringify(result.rows[0]?.pass_state || {})) {
      await client.query(
        `UPDATE progression
         SET pass_state = $2
         WHERE user_id = $1`,
        [userId, JSON.stringify(passState)]
      );
    }

    const payload = buildPassPayload(passState);
    return res.json({
      ...payload,
      success: true,
      status: payload
    });
  } catch (err) {
    console.error('Pass GET error:', err);
    return res.status(500).json({ error: 'Технический сбой' });
  } finally {
    if (client) client.release();
  }
});

router.post(['/claim/:level', '/claim'], async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  const level = Number(req.params.level || req.body?.level);
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    return res.status(400).json({ error: 'Неверный уровень' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const userId = await ensureUserAndProgression(client, telegramUser);
    const result = await client.query(
      `SELECT pass_state, inventory
       FROM progression
       WHERE user_id = $1
       FOR UPDATE`,
      [userId]
    );
    const progression = result.rows[0] || {};
    let passState = normalizePassState(progression.pass_state || {});

    try {
      passState = claimLevelRewards(passState, level);
    } catch (claimErr) {
      await client.query('ROLLBACK');
      const message = claimErr.message === 'Already claimed'
        ? 'Награда уже получена'
        : 'Уровень не достигнут';
      return res.status(400).json({ error: message });
    }

    const reward = {
      free: PASS.FREE_REWARDS[level] || null,
      premium: passState.premiumUnlocked ? (PASS.PREMIUM_REWARDS[level] || null) : null
    };

    await applyPassReward(client, userId, progression, combineRewards(reward.free, reward.premium));
    await client.query(
      `UPDATE progression
       SET pass_state = $2
       WHERE user_id = $1`,
      [userId, JSON.stringify(passState)]
    );

    await client.query('COMMIT');

    return res.json({
      level,
      reward,
      claimedLevels: passState.claimedLevels,
      pass: buildPassPayload(passState)
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('Pass claim error:', err);
    return res.status(500).json({ error: 'Технический сбой' });
  } finally {
    if (client) client.release();
  }
});

export default router;
