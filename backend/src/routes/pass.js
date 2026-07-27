import { Router } from 'express';
import { pool } from '../index.js';
import { addPassXp, applyPassXpSourceMultiplier, calculateCappedCatchUpXp, claimPassReward, getActivePass, getPassStatus, getWeekendXpMultiplier, unlockPremiumPass, PASS } from '../utils/pass.js';
import { getXpSourcesAggregate } from '../utils/passXpLog.js';
import {
  PAYMENT_METHOD_UNAVAILABLE_CODE,
  requirePaymentsEnabled,
} from '../config/payments.js';

const router = Router();

/**
 * Currencies accepted by POST /upgrade.
 *
 * "stars" here is the IN-GAME soft currency (progression.stars, earned through
 * gameplay) — not Telegram Stars, and not real money.
 *
 * "ton" is deliberately absent. The previous implementation accepted it and
 * called unlockPremiumPass() while charging nothing at all, recording a
 * zero-amount "completed" purchase — a simulated payment success. TON stays
 * unavailable until real, verified on-chain settlement exists.
 */
const UPGRADE_PRICES = { stars: 499 };
const UNSETTLED_CURRENCIES = new Set(['ton']);

router.get(['/', '/status'], async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const userResult = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramUser.id]);
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = userResult.rows[0].id;
    const progressionResult = await client.query(
      `SELECT pass_state FROM progression WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    const passState = progressionResult.rows[0]?.pass_state || {};
    const now = new Date();
    const lastSeenAt = passState.lastSeenAt ? new Date(passState.lastSeenAt) : null;
    let catchUp = null;

    if (lastSeenAt && !Number.isNaN(lastSeenAt.getTime())) {
      const msSinceSeen = now.getTime() - lastSeenAt.getTime();
      if (msSinceSeen > 24 * 60 * 60 * 1000) {
        const pass = await getActivePass(client);
        if (pass) {
          const avgResult = await client.query(
            `SELECT COALESCE(SUM(amount), 0) AS xp_sum
             FROM pass_xp_log
             WHERE user_id = $1
               AND pass_id = $2
               AND created_at >= NOW() - INTERVAL '7 days'`,
            [userId, pass.id]
          );
          const avgDailyXP = Math.floor(Number(avgResult.rows[0]?.xp_sum || 0) / 7);
          const missedDays = Math.floor(msSinceSeen / 86400000);
          const catchUpXp = calculateCappedCatchUpXp(missedDays, avgDailyXP);
          if (catchUpXp > 0) {
            await addPassXp(client, userId, catchUpXp);
            catchUp = { missedDays, avgDailyXP, catchUpXp };
          }
        }
      }
    }

    await client.query(
      `UPDATE progression SET pass_state = $2 WHERE user_id = $1`,
      [userId, JSON.stringify({ ...passState, lastSeenAt: now.toISOString() })]
    );
    const passStatus = await getPassStatus(client, userId);
    await client.query('COMMIT');
    // Keep a consistent top-level shape even when there is no active pass, so
    // clients can always read catchUp / weekendDoubleXpActive.
    if (!passStatus) return res.json({ success: true, status: null, catchUp, weekendDoubleXpActive: getWeekendXpMultiplier(new Date()) > 1 });
    return res.json({ ...passStatus, success: true, status: passStatus, catchUp, weekendDoubleXpActive: getWeekendXpMultiplier(new Date()) > 1 });
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (_rollbackErr) {
        // Keep the original pass error as the response cause.
      }
    }
    console.error('Pass GET error:', err);
    return res.status(500).json({ error: 'Технический сбой' });
  } finally {
    if (client) client.release();
  }
});

router.post(['/claim/:level', '/claim'], async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  const level = Number(req.params.level || req.body?.level);
  if (!Number.isInteger(level) || level < 1 || level > PASS.MAX_LEVEL) {
    return res.status(400).json({ error: 'Неверный уровень' });
  }
  const track = req.body?.track || 'free';
  if (!['free', 'premium'].includes(track)) {
    return res.status(400).json({ error: 'Неверный трек' });
  }
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const userResult = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramUser.id]);
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = userResult.rows[0].id;
    const result = await claimPassReward(client, userId, level, track);
    if (result.status !== 200) {
      await client.query('ROLLBACK');
      return res.status(result.status).json({ error: result.error });
    }
    const passStatus = await getPassStatus(client, userId);
    await client.query('COMMIT');
    return res.json({ success: true, level, track, reward: result.reward, applied: result.applied, pass: passStatus });
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (_rollbackErr) {
        // Keep the original claim error as the response cause.
      }
    }
    console.error('Pass claim error:', err);
    return res.status(500).json({ error: 'Технический сбой' });
  } finally {
    if (client) client.release();
  }
});

/**
 * POST /api/pass/upgrade — unlock the premium sprint pass.
 *
 * Auth is checked first (preserving this route's existing 401 message) so the
 * payment state is not disclosed to anonymous callers. requirePaymentsEnabled
 * then gates the WHOLE route before pool.connect(), so while payments are
 * disabled there is no DB access and no premium unlock by any currency. Even
 * once payments are enabled, "ton" is refused below.
 */
router.post(
  '/upgrade',
  (req, res, next) => {
    if (!req.telegramUser?.user) {
      return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
    }
    return next();
  },
  requirePaymentsEnabled,
  async (req, res) => {
  const telegramUser = req.telegramUser?.user;

  const { currency = 'stars' } = req.body || {};

  // Refused even when payments are enabled: there is no verified TON settlement
  // path, so honouring it would grant premium for free.
  if (UNSETTLED_CURRENCIES.has(currency)) {
    return res.status(409).json({
      error: 'Оплата через TON недоступна: нет подтверждённого способа расчёта.',
      code: PAYMENT_METHOD_UNAVAILABLE_CODE,
      currency,
      supportedCurrencies: Object.keys(UPGRADE_PRICES),
    });
  }

  const price = UPGRADE_PRICES[currency];
  if (!price) {
    return res.status(400).json({
      error: `Неверная валюта. Доступны: ${Object.keys(UPGRADE_PRICES).join(', ')}`,
      supportedCurrencies: Object.keys(UPGRADE_PRICES),
    });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const userResult = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramUser.id]);
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = userResult.rows[0].id;

    const pass = await getActivePass(client);
    if (!pass) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Нет активного сезона' });
    }

    // Deduct the in-game soft currency. This is now unconditional: every
    // currency that reaches this point is priced in progression.stars, so there
    // is no longer any path that unlocks premium without charging for it.
    const starsResult = await client.query(
      `SELECT stars FROM progression WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    const currentStars = Number(starsResult.rows[0]?.stars || 0);
    if (currentStars < price) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Недостаточно Stars', required: price, available: currentStars });
    }
    await client.query(
      `UPDATE progression SET stars = stars - $2, updated_at = NOW() WHERE user_id = $1`,
      [userId, price]
    );

    const result = await unlockPremiumPass(client, userId);
    if (result.error) {
      await client.query('ROLLBACK');
      return res.status(result.status).json({ error: result.error });
    }

    await client.query(
      `INSERT INTO purchases (user_id, item_type, stars_amount, status)
       VALUES ($1, 'premium_pass', $2, 'completed')
       ON CONFLICT DO NOTHING`,
      [userId, price]
    );

    await client.query(
      `INSERT INTO audit_logs (user_id, action, context)
       VALUES ($1, 'pass_upgrade', $2)`,
      [userId, JSON.stringify({ passId: pass.id, currency, price, seasonNumber: pass.season_number })]
    );

    await client.query('COMMIT');

    const passStatus = await getPassStatus(client, userId);
    return res.json({
      success: true,
      upgraded: !result.alreadyOwned,
      alreadyOwned: result.alreadyOwned,
      currency,
      price,
      pass: passStatus
    });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    console.error('Pass upgrade error:', err);
    return res.status(500).json({ error: 'Технический сбой' });
  } finally {
    if (client) client.release();
  }
  },
);

router.get('/xp-sources', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  let client;
  try {
    client = await pool.connect();
    const userResult = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramUser.id]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userResult.rows[0].id;
    const pass = await getActivePass(client);
    if (!pass) return res.json({ quest: 0, minigame: 0, social: 0, tap: 0, other: 0 });
    const aggregates = await getXpSourcesAggregate(client, userId, pass.id);
    return res.json(aggregates);
  } catch (err) {
    console.error('Pass XP sources error:', err);
    return res.status(500).json({ error: 'Технический сбой' });
  } finally {
    if (client) client.release();
  }
});

export default router;
