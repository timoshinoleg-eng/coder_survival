import { Router } from 'express';
import { pool } from '../index.js';
import { PRESTIGE } from '../config/balance.js';
import { computePrestige, computeMu, applyPrestigeBonuses } from '../utils/prestige.js';

const router = Router();

const PRESTIGE_MIN_LOC = 1_000_000;

router.get('/preview', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const telegramId = telegramUser.id;

  let client;
  try {
    client = await pool.connect();

    const userResult = await client.query(
      'SELECT id FROM users WHERE telegram_id = $1',
      [telegramId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = userResult.rows[0].id;

    const progResult = await client.query(
      'SELECT lifetime_loc, prestige_count, mu_currency, commits_total FROM progression WHERE user_id = $1',
      [userId]
    );
    const prog = progResult.rows[0] || { lifetime_loc: 0, prestige_count: 0, mu_currency: 0, commits_total: 0 };
    const lifetimeLoc = Number(prog.lifetime_loc ?? prog.commits_total ?? 0);
    const prestigeCount = Number(prog.prestige_count ?? 0);
    const muCurrency = Number(prog.mu_currency ?? 0);

    const levelResult = await client.query(
      'SELECT xp_total, prestige_level, prestige_currency, prestige_shop_purchases FROM player_levels WHERE user_id = $1',
      [userId]
    );
    const levelRow = levelResult.rows[0] || { xp_total: 0, prestige_level: 0, prestige_currency: 0, prestige_shop_purchases: {} };
    const xpTotal = Number(levelRow.xp_total ?? 0);
    const oldPrestigeLevel = Number(levelRow.prestige_level ?? 0);

    const available = lifetimeLoc >= PRESTIGE_MIN_LOC;
    if (!available) {
      return res.json({
        available: false,
        lifetimeLoc,
        requiredLoc: PRESTIGE_MIN_LOC,
        prestigeCount,
        muCurrency,
        oldPrestigeLevel,
        oldPrestigeCurrency: Number(levelRow.prestige_currency ?? 0),
      });
    }

    const projectedMu = Math.floor(computeMu(lifetimeLoc));
    const deltaMu = Math.max(0, projectedMu - muCurrency);

    const oldPrestigeCurrencyEarned = computePrestige(lifetimeLoc);

    const bonusesThisPrestige = {
      passiveLocMult: 1 + 0.01 * deltaMu,
      clickPowerMult: 1 + 0.005 * deltaMu,
    };

    const effOldLvl = Math.min(PRESTIGE.MAX_PRESTIGE_LEVEL, oldPrestigeLevel + 1);
    const totalBonuses = {
      tapMult: 1 + PRESTIGE.BONUSES.TAP_MULT_PER_LEVEL * effOldLvl,
      energyRecoveryMult: 1 + PRESTIGE.BONUSES.ENERGY_RECOVERY_MULT_PER_LEVEL * effOldLvl,
      critAdd: PRESTIGE.BONUSES.CRIT_CHANCE_ADD_PER_LEVEL * effOldLvl,
      maxEnergyAdd: PRESTIGE.BONUSES.MAX_ENERGY_ADD_PER_LEVEL * effOldLvl,
      passiveLocMult: 1 + 0.01 * projectedMu,
      clickPowerMult: 1 + 0.005 * projectedMu,
    };

    return res.json({
      available: true,
      lifetimeLoc,
      prestigeCount,
      prestigeCountAfter: prestigeCount + 1,
      muCurrency,
      projectedMu,
      deltaMu,
      totalMu: projectedMu,
      bonusesThisPrestige,
      totalBonuses,
      oldPrestigeLevel,
      oldPrestigeCurrencyEarned,
      totalOldPrestigeCurrency: Number(levelRow.prestige_currency ?? 0) + oldPrestigeCurrencyEarned,
      willReset: ['xp_total', 'tier', 'commits_current', 'energy', 'generator_state', 'active_effects', 'event_state'],
      willKeep: ['commits_total', 'lifetime_loc', 'skins', 'inventory', 'streak', 'battle_pass', 'squads', 'mu_currency'],
    });
  } catch (err) {
    console.error('[Prestige] preview failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
});

router.post('/execute', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const telegramId = telegramUser.id;

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const userResult = await client.query(
      'SELECT id FROM users WHERE telegram_id = $1 FOR UPDATE',
      [telegramId]
    );
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = userResult.rows[0].id;

    const progResult = await client.query(
      'SELECT lifetime_loc, prestige_count, mu_currency, commits_total, streak_days FROM progression WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    const prog = progResult.rows[0];
    if (!prog) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Progression not found' });
    }

    const lifetimeLoc = Number(prog.lifetime_loc ?? prog.commits_total ?? 0);
    const prestigeCount = Number(prog.prestige_count ?? 0);
    const muCurrency = Number(prog.mu_currency ?? 0);

    if (lifetimeLoc < PRESTIGE_MIN_LOC) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Not enough lifetime LOC for prestige',
        requiredLoc: PRESTIGE_MIN_LOC,
        currentLoc: lifetimeLoc,
      });
    }

    const projectedMu = Math.floor(computeMu(lifetimeLoc));
    const deltaMu = Math.max(0, projectedMu - muCurrency);
    const newPrestigeCount = prestigeCount + 1;

    // Old prestige logic (keep for compatibility)
    const oldPrestigeCurrencyEarned = computePrestige(lifetimeLoc);
    const levelResult = await client.query(
      'SELECT prestige_level, prestige_currency FROM player_levels WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    const oldPrestigeLevel = Number(levelResult.rows[0]?.prestige_level ?? 0);
    const newOldPrestigeLevel = oldPrestigeLevel + 1;

    await client.query(
      `UPDATE player_levels
       SET prestige_level = $2,
           prestige_currency = prestige_currency + $3,
           xp_total = 0,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, newOldPrestigeLevel, oldPrestigeCurrencyEarned]
    );

    await client.query(
      `UPDATE progression
       SET prestige_level = $2,
           prestige_count = $3,
           mu_currency = $4,
           tier = 1,
           commits_current = 0,
           energy = 100,
           session_started_at = NOW(),
           active_effects = '{}',
           generator_state = '{}',
           event_state = '{}',
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, newOldPrestigeLevel, newPrestigeCount, projectedMu]
    );

    const updatedLevel = await client.query(
      'SELECT xp_total, prestige_level, prestige_currency, prestige_shop_purchases FROM player_levels WHERE user_id = $1',
      [userId]
    );
    const updatedProgression = await client.query(
      'SELECT tier, commits_total, commits_current, energy, prestige_level, streak_days, lifetime_loc, prestige_count, mu_currency FROM progression WHERE user_id = $1',
      [userId]
    );

    await client.query('COMMIT');

    const effOldLvl = Math.min(PRESTIGE.MAX_PRESTIGE_LEVEL, newOldPrestigeLevel);
    const bonuses = {
      tapMult: 1 + PRESTIGE.BONUSES.TAP_MULT_PER_LEVEL * effOldLvl,
      energyRecoveryMult: 1 + PRESTIGE.BONUSES.ENERGY_RECOVERY_MULT_PER_LEVEL * effOldLvl,
      critAdd: PRESTIGE.BONUSES.CRIT_CHANCE_ADD_PER_LEVEL * effOldLvl,
      maxEnergyAdd: PRESTIGE.BONUSES.MAX_ENERGY_ADD_PER_LEVEL * effOldLvl,
      depressionResist: Math.max(0, 1 - PRESTIGE.BONUSES.DEPRESSION_RESISTANCE_PER_LEVEL * effOldLvl),
      passiveLocMult: 1 + 0.01 * projectedMu,
      clickPowerMult: 1 + 0.005 * projectedMu,
    };

    return res.json({
      success: true,
      prestigeCount: newPrestigeCount,
      muEarned: deltaMu,
      totalMu: projectedMu,
      oldPrestigeLevel: newOldPrestigeLevel,
      oldPrestigeCurrencyEarned,
      totalOldPrestigeCurrency: Number(updatedLevel.rows[0].prestige_currency ?? 0),
      bonuses,
      newState: {
        xpTotal: Number(updatedLevel.rows[0].xp_total ?? 0),
        tier: Number(updatedProgression.rows[0].tier ?? 1),
        commitsTotal: Number(updatedProgression.rows[0].commits_total ?? 0),
        energy: Number(updatedProgression.rows[0].energy ?? 100),
        streakDays: Number(updatedProgression.rows[0].streak_days ?? 0),
        lifetimeLoc: Number(updatedProgression.rows[0].lifetime_loc ?? 0),
        prestigeCount: Number(updatedProgression.rows[0].prestige_count ?? 0),
        muCurrency: Number(updatedProgression.rows[0].mu_currency ?? 0),
      },
    });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    console.error('[Prestige] execute failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
});

router.get('/shop', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const telegramId = telegramUser.id;

  let client;
  try {
    client = await pool.connect();

    const userResult = await client.query(
      'SELECT id FROM users WHERE telegram_id = $1',
      [telegramId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = userResult.rows[0].id;

    const levelResult = await client.query(
      'SELECT prestige_currency, prestige_shop_purchases FROM player_levels WHERE user_id = $1',
      [userId]
    );
    const levelRow = levelResult.rows[0] || { prestige_currency: 0, prestige_shop_purchases: {} };
    const shopPurchases = levelRow.prestige_shop_purchases?.items || [];

    const items = Object.entries(PRESTIGE.SHOP).map(([key, item]) => ({
      key,
      id: item.id,
      cost: item.cost,
      desc: item.desc,
      purchased: shopPurchases.includes(item.id),
    }));

    return res.json({
      prestigeCurrency: Number(levelRow.prestige_currency ?? 0),
      items,
    });
  } catch (err) {
    console.error('[Prestige] shop read failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
});

router.post('/shop/buy', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const telegramId = telegramUser.id;

  const { itemKey } = req.body || {};
  if (!itemKey) {
    return res.status(400).json({ error: 'itemKey is required' });
  }

  const shopItem = PRESTIGE.SHOP[itemKey];
  if (!shopItem) {
    return res.status(404).json({ error: 'Shop item not found' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const userResult = await client.query(
      'SELECT id FROM users WHERE telegram_id = $1',
      [telegramId]
    );
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = userResult.rows[0].id;

    const levelResult = await client.query(
      'SELECT prestige_currency, prestige_shop_purchases FROM player_levels WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    const levelRow = levelResult.rows[0];
    if (!levelRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Player level row not found' });
    }

    const currency = Number(levelRow.prestige_currency ?? 0);
    if (currency < shopItem.cost) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Not enough prestige currency',
        required: shopItem.cost,
        available: currency,
      });
    }

    const shopPurchases = levelRow.prestige_shop_purchases || {};
    const items = shopPurchases.items || [];
    if (items.includes(shopItem.id)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Item already purchased' });
    }

    const newItems = [...items, shopItem.id];
    const newCurrency = currency - shopItem.cost;

    await client.query(
      `UPDATE player_levels
       SET prestige_currency = $2,
           prestige_shop_purchases = $3,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, newCurrency, JSON.stringify({ items: newItems })]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      itemId: shopItem.id,
      cost: shopItem.cost,
      prestigeCurrency: newCurrency,
      purchasedItems: newItems,
    });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    console.error('[Prestige] shop buy failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
});

export default router;
