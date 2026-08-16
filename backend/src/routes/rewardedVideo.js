import { Router } from 'express';
import { pool } from '../index.js';
import { STAGE2 } from '../config/balance.js';
import { evaluateFtueAdAvailability } from '../utils/adsPolicy.js';
import { ensurePlayerLevel } from '../utils/vnext.js';

const router = Router();
const { REWARDED_VIDEO } = STAGE2;

function getTimezoneOffset(req, fallback = 180) {
  const raw =
    req.body?.timezoneOffset ??
    req.query?.timezoneOffset ??
    req.headers['x-timezone-offset'] ??
    req.telegramUser?.user?.time_zone_offset;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getTodayDate(timezoneOffset = 180, now = new Date()) {
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
  return userId;
}

function normalizeVideoState(state = {}, today) {
  if (state.date === today) {
    return {
      date: today,
      countToday: Number(state.countToday || 0),
      lastWatchAt: state.lastWatchAt || null
    };
  }

  return {
    date: today,
    countToday: 0,
    lastWatchAt: null
  };
}

router.get('/status', async (req, res) => {
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
       `SELECT rewarded_video_state, energy, created_at
        FROM progression
        WHERE user_id = $1`,
      [userId]
    );
    const state = normalizeVideoState(result.rows[0]?.rewarded_video_state || {}, today);
    const ftue = evaluateFtueAdAvailability({
      createdAt: result.rows[0]?.created_at,
      adsClaimedToday: state.countToday,
      now: new Date()
    });
    return res.json({
      countToday: state.countToday,
      remainingToday: Math.max(0, REWARDED_VIDEO.DAILY_LIMIT - state.countToday),
      dailyLimit: REWARDED_VIDEO.DAILY_LIMIT,
      cooldownSeconds: REWARDED_VIDEO.COOLDOWN_MINUTES * 60,
      triggerEnergyPct: REWARDED_VIDEO.TRIGGER_ENERGY_PCT,
      buttonText: REWARDED_VIDEO.BUTTON_TEXT,
      adAvailability: ftue
    });
  } catch (err) {
    console.error('Rewarded video status error:', err);
    return res.status(500).json({ error: 'Технический сбой' });
  } finally {
    if (client) client.release();
  }
});

router.post('/complete', async (req, res) => {
  if (process.env.NODE_ENV !== 'qa') {
    return res.status(410).json({
      error: 'Legacy rewarded-video endpoint disabled; use /api/rewards/ad-session and /api/rewards/ad-claim',
    });
  }
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
       `SELECT rewarded_video_state, energy, created_at
        FROM progression
        WHERE user_id = $1
        FOR UPDATE`,
      [userId]
    );
    const progression = progressionResult.rows[0] || {};
    const state = normalizeVideoState(progression.rewarded_video_state || {}, today);
    const ftue = evaluateFtueAdAvailability({
      createdAt: progression.created_at,
      adsClaimedToday: state.countToday,
      now: new Date()
    });

    if (!ftue.allowed) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: ftue.reason === 'ftue_ads_blocked' ? 'Реклама пока недоступна в первые 30 минут' : 'В FTUE доступен только один рекламный просмотр',
        reason: ftue.reason,
        rule: ftue.rule
      });
    }

    if (state.countToday >= REWARDED_VIDEO.DAILY_LIMIT) {
      await client.query('ROLLBACK');
      return res.status(429).json({
        error: 'Дневной лимит исчерпан',
        remaining: 0,
        nextReset: '00:00'
      });
    }

    if (state.lastWatchAt) {
      const minutesSince = (Date.now() - new Date(state.lastWatchAt).getTime()) / (1000 * 60);
      if (minutesSince < REWARDED_VIDEO.COOLDOWN_MINUTES) {
        await client.query('ROLLBACK');
        return res.status(429).json({
          error: 'Перерыв между рекламой',
          cooldownSeconds: Math.ceil((REWARDED_VIDEO.COOLDOWN_MINUTES - minutesSince) * 60)
        });
      }
    }

    const levelRow = await ensurePlayerLevel(client, userId);
    const maxEnergy = levelRow.resolved.maxEnergy;
    const rewardEnergy = Math.floor(maxEnergy * REWARDED_VIDEO.REWARD_ENERGY_PCT);
    const newEnergy = Math.min(maxEnergy, Number(progression.energy || 0) + rewardEnergy);
    const nextState = {
      date: today,
      countToday: state.countToday + 1,
      lastWatchAt: new Date().toISOString()
    };

    await client.query(
      `UPDATE progression
       SET rewarded_video_state = $2,
           energy = $3
       WHERE user_id = $1`,
      [userId, JSON.stringify(nextState), newEnergy]
    );
    await client.query('COMMIT');

    return res.json({
      rewardEnergy,
      newEnergy,
      remainingToday: REWARDED_VIDEO.DAILY_LIMIT - nextState.countToday,
      cooldownSeconds: REWARDED_VIDEO.COOLDOWN_MINUTES * 60
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('Rewarded video error:', err);
    return res.status(500).json({ error: 'Технический сбой' });
  } finally {
    if (client) client.release();
  }
});

export default router;
