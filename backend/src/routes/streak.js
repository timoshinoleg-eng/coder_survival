import { Router } from 'express';
import { pool } from '../index.js';
import { DEPRESSION_SCALE, LOGIN_STREAK_BONUS, STAGE2 } from '../config/balance.js';
import { addPassXp } from '../utils/pass.js';
import { processDailyLogin, starRecover, calculateRecoveryCost, shouldOfferStreakSaver } from '../utils/streak.js';
import { getProductById } from '../utils/shopCatalog.js';
import { ensurePlayerLevel } from '../utils/vnext.js';

const router = Router();

function getTimezoneOffset(req, fallback = 180) {
  const raw =
    req.body?.timezoneOffset ??
    req.query?.timezoneOffset ??
    req.headers['x-timezone-offset'] ??
    req.telegramUser?.user?.time_zone_offset;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getTodayDate(timezoneOffset = 180, now = new Date()) {
  const local = new Date(now.getTime() + timezoneOffset * 60000);
  return local.toISOString().slice(0, 10);
}

async function ensureUserAndProgression(client, telegramUser, timezoneOffset = 180) {
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
    `INSERT INTO progression (user_id, timezone_offset)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET
       timezone_offset = COALESCE(progression.timezone_offset, EXCLUDED.timezone_offset)`,
    [userId, timezoneOffset]
  );
  await ensurePlayerLevel(client, userId);
  return userId;
}

function normalizeProtection(protection = {}) {
  return {
    freeUsed: protection.freeUsed === true,
    starSavesUsed: Number(protection.starSavesUsed || 0),
    teamSaveAvailable: protection.teamSaveAvailable === true
  };
}

function normalizeStreakState(streakState = {}) {
  return {
    currentStreak: Number(streakState.currentStreak || 0),
    maxStreak: Number(streakState.maxStreak || 0),
    lastLoginDate: streakState.lastLoginDate || null,
    brokenStreak: streakState.brokenStreak != null ? Number(streakState.brokenStreak) : null,
    lastStreakSaveTimestamp: streakState.lastStreakSaveTimestamp || null,
    saverArmedForDate: streakState.saverArmedForDate || null,
    protection: normalizeProtection(streakState.protection)
  };
}

function getCalendar(streakState, todayDate) {
  const days = [];
  const today = new Date(`${todayDate}T00:00:00.000Z`);
  const lastLoginDate = streakState.lastLoginDate || null;
  const currentStreak = Number(streakState.currentStreak || 0);

  for (let offset = -6; offset <= 0; offset++) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() + offset);
    const dateString = date.toISOString().slice(0, 10);
    const daysAgo = Math.abs(offset);
    let status = 'future';

    if (dateString === todayDate) {
      status = lastLoginDate === todayDate ? 'done' : 'today';
    } else if (lastLoginDate && dateString <= lastLoginDate && daysAgo < currentStreak) {
      status = 'done';
    } else if (dateString < todayDate) {
      status = 'missed';
    }

    days.push({ date: dateString, status });
  }

  return days;
}

function mergeInventory(current, rewards) {
  const next = { ...(current || {}) };
  if (!rewards) return next;
  if (rewards.stars) next.stars = Number(next.stars || 0) + Number(rewards.stars || 0);
  if (rewards.skinFragment) next[`fragment_${rewards.skinFragment}`] = Number(next[`fragment_${rewards.skinFragment}`] || 0) + 1;
  if (rewards.skin) next[`skin_${rewards.skin}`] = 1;
  if (rewards.title) next[`title_${rewards.title}`] = 1;
  if (rewards.animation) next[`animation_${rewards.animation}`] = 1;
  return next;
}

function aggregateRewards(result) {
  const rewards = { ...(result.rewards?.daily || {}) };
  const milestone = result.rewards?.milestone || null;
  if (milestone) {
    for (const [key, value] of Object.entries(milestone)) {
      if (typeof value === 'number') rewards[key] = Number(rewards[key] || 0) + value;
      else rewards[key] = value;
    }
  }
  return rewards;
}

export function getLoginStreakBonus(currentStreak) {
  const day = Math.max(1, Math.min(7, Number(currentStreak || 1)));
  return {
    day,
    reward: { ...(LOGIN_STREAK_BONUS[day] || {}) }
  };
}

router.get('/', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  let client;
  try {
    client = await pool.connect();
    const timezoneOffset = getTimezoneOffset(req);
    const today = getTodayDate(timezoneOffset);
    const userId = await ensureUserAndProgression(client, telegramUser, timezoneOffset);
    const result = await client.query(
      `SELECT streak_state, energy
       FROM progression
       WHERE user_id = $1`,
      [userId]
    );
    const streakState = normalizeStreakState(result.rows[0]?.streak_state || {});
    const energy = Number(result.rows[0]?.energy || 0);

    const loggedInToday = streakState.lastLoginDate === today;
    const recoveryCost = calculateRecoveryCost(streakState.protection?.starSavesUsed || 0);
    const canRecover = !loggedInToday && (streakState.brokenStreak != null);

    const streakSaverOffer = shouldOfferStreakSaver({
      streakState,
      energy,
      todayDate: today,
      now: new Date(),
      timezoneOffsetMinutes: timezoneOffset
    })
      ? {
          type: 'streak_saver',
          productId: 'streak_saver',
          stars: getProductById('streak_saver')?.stars ?? 1,
          discountPercent: STAGE2.STREAK.SAVER.discountPercent,
          body: `Твой стрик ${streakState.currentStreak} дней под угрозой до локальной полуночи. Купи «Экстренный кофе» за 1⭐, чтобы сохранить его.`
        }
      : null;

    return res.json({
      currentStreak: streakState.currentStreak,
      maxStreak: streakState.maxStreak,
      lastLoginDate: streakState.lastLoginDate,
      loggedInToday,
      calendar: getCalendar(streakState, today),
      protection: streakState.protection,
      nextMilestone: STAGE2.STREAK.MILESTONES[streakState.currentStreak + 1] || null,
      brokenStreak: streakState.brokenStreak || null,
      recoveryCost,
      canRecover,
      streakSaverOffer
    });
  } catch (err) {
    console.error('Streak GET error:', err);
    return res.status(500).json({ error: 'Технический сбой' });
  } finally {
    if (client) client.release();
  }
});

router.post('/claim', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const timezoneOffset = getTimezoneOffset(req);
    const today = getTodayDate(timezoneOffset);
    const userId = await ensureUserAndProgression(client, telegramUser, timezoneOffset);
    const progressionResult = await client.query(
      `SELECT streak_state, pass_state, inventory
       FROM progression
       WHERE user_id = $1
       FOR UPDATE`,
      [userId]
    );
    const progression = progressionResult.rows[0] || {};
    const streakState = normalizeStreakState(progression.streak_state || {});
    const result = processDailyLogin(streakState, today);

    if (result.status === 'already_logged_in') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Награда сегодня уже получена' });
    }

    const rewards = aggregateRewards(result);
    const loginStreakBonus = getLoginStreakBonus(result.streakState.currentStreak);
    rewards.energy = Number(rewards.energy || 0) + Number(loginStreakBonus.reward.energy || 0);
    rewards.depressionRelief = Number(rewards.depressionRelief || 0) + Number(loginStreakBonus.reward.depressionRelief || 0);

    let passState = progression.pass_state || {};
    let passUpdate = null;
    if (Number(rewards.passXp || 0) > 0) {
      passUpdate = addPassXp(passState, Number(rewards.passXp || 0));
      passState = passUpdate.newState;
    }

    if (Number(rewards.xp || 0) > 0) {
      await client.query(
        `UPDATE player_levels
         SET xp_total = xp_total + $2
         WHERE user_id = $1`,
        [userId, Number(rewards.xp || 0)]
      );
    }

    const levelRow = await ensurePlayerLevel(client, userId);
    const inventory = mergeInventory(progression.inventory || {}, rewards);
    await client.query(
      `UPDATE progression
       SET streak_state = $2,
           pass_state = $3,
           energy = LEAST($4, energy + $5),
           depression_level = GREATEST(0, depression_level - $6),
           is_burnout = GREATEST(0, depression_level - $6) >= $8,
           inventory = $7
       WHERE user_id = $1`,
      [
        userId,
        JSON.stringify(result.streakState),
        JSON.stringify(passState),
        levelRow.resolved.maxEnergy,
        Number(rewards.energy || 0),
        Number(rewards.depressionRelief || 0),
        JSON.stringify(inventory),
        DEPRESSION_SCALE.HEART_ATTACK_THRESHOLD
      ]
    );

    await client.query(
      `INSERT INTO audit_logs (user_id, action, context)
       VALUES ($1, 'daily_login_claim', $2::jsonb)`,
      [
        userId,
        JSON.stringify({
          streak: result.streakState.currentStreak,
          bonusDay: loginStreakBonus.day,
          bonus: loginStreakBonus.reward
        })
      ]
    );

    await client.query('COMMIT');

    return res.json({
      status: result.status,
      currentStreak: result.streakState.currentStreak,
      rewards,
      loginStreakBonus,
      passUpdate,
      brokenStreak: result.brokenStreak || null,
      missedDays: result.missedDays || 0,
      calendar: getCalendar(result.streakState, today)
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('Streak claim error:', err);
    return res.status(500).json({ error: 'Технический сбой' });
  } finally {
    if (client) client.release();
  }
});

router.post('/recover', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const timezoneOffset = getTimezoneOffset(req);
    const today = getTodayDate(timezoneOffset);
    const userId = await ensureUserAndProgression(client, telegramUser, timezoneOffset);

    const progressionResult = await client.query(
      `SELECT streak_state, inventory
       FROM progression
       WHERE user_id = $1
       FOR UPDATE`,
      [userId]
    );
    const progression = progressionResult.rows[0] || {};
    const streakState = normalizeStreakState(progression.streak_state || {});
    const inventory = progression.inventory || {};

    if (streakState.lastLoginDate === today) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Сегодня уже заходил — восстановление не нужно' });
    }

    if (streakState.brokenStreak == null) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Серия не прервана — восстановление не нужно' });
    }

    const starsAvailable = Number(inventory.stars || 0);
    const recovery = starRecover(streakState, today, starsAvailable);

    if (!recovery.success) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: recovery.reason === 'not_enough_stars'
          ? 'Не хватает Stars'
          : recovery.reason === 'not_broken'
            ? 'Серия не прервана'
            : 'Восстановление невозможно',
        reason: recovery.reason,
        cost: recovery.cost
      });
    }

    const newInventory = { ...inventory, stars: starsAvailable - recovery.cost };
    await client.query(
      `UPDATE progression
       SET streak_state = $2,
           inventory = $3
       WHERE user_id = $1`,
      [userId, JSON.stringify(recovery.newState), JSON.stringify(newInventory)]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      currentStreak: recovery.newState.currentStreak,
      cost: recovery.cost,
      remainingStars: newInventory.stars,
      calendar: getCalendar(recovery.newState, today)
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('Streak recover error:', err);
    return res.status(500).json({ error: 'Технический сбой' });
  } finally {
    if (client) client.release();
  }
});

export default router;
