import { Router } from 'express';
import { pool } from '../index.js';
import { PRESTIGE } from '../config/balance.js';
import { computePrestige, applyPrestigeBonuses } from '../utils/prestige.js';

const router = Router();

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

    const levelResult = await client.query(
      'SELECT xp_total, prestige_level, prestige_currency, prestige_shop_purchases FROM player_levels WHERE user_id = $1',
      [userId]
    );
    const levelRow = levelResult.rows[0] || { xp_total: 0, prestige_level: 0, prestige_currency: 0, prestige_shop_purchases: {} };
    const xpTotal = Number(levelRow.xp_total ?? 0);
    const prestigeLevel = Number(levelRow.prestige_level ?? 0);

    const available = xpTotal >= PRESTIGE.THRESHOLD_XP;
    if (!available) {
      return res.json({
        available: false,
        currentXp: xpTotal,
        requiredXp: PRESTIGE.THRESHOLD_XP,
        prestigeLevel,
        prestigeCurrency: Number(levelRow.prestige_currency ?? 0),
      });
    }

    const progressionResult = await client.query(
      'SELECT commits_total FROM progression WHERE user_id = $1',
      [userId]
    );
    const commitsTotal = Number(progressionResult.rows[0]?.commits_total ?? 0);
    const prestigeCurrencyEarned = computePrestige(commitsTotal);

    const bonusesThisPrestige = {
      tapMult: 1 + PRESTIGE.BONUSES.TAP_MULT_PER_LEVEL,
      energyRecoveryMult: 1 + PRESTIGE.BONUSES.ENERGY_RECOVERY_MULT_PER_LEVEL,
      critAdd: PRESTIGE.BONUSES.CRIT_CHANCE_ADD_PER_LEVEL,
      maxEnergyAdd: PRESTIGE.BONUSES.MAX_ENERGY_ADD_PER_LEVEL,
      depressionResist: Math.max(0, 1 - PRESTIGE.BONUSES.DEPRESSION_RESISTANCE_PER_LEVEL),
    };

    return res.json({
      available: true,
      prestigeLevel,
      prestigeLevelAfter: prestigeLevel + 1,
      prestigeCurrencyEarned,
      totalPrestigeCurrency: Number(levelRow.prestige_currency ?? 0) + prestigeCurrencyEarned,
      bonusesThisPrestige,
      bonuses: [
        { name: 'Tap multiplier', detail: `x${(1 + PRESTIGE.BONUSES.TAP_MULT_PER_LEVEL * Math.min(PRESTIGE.MAX_PRESTIGE_LEVEL, prestigeLevel + 1)).toFixed(2)}` },
        { name: 'Energy recovery speed', detail: `${Math.round(PRESTIGE.BONUSES.ENERGY_RECOVERY_MULT_PER_LEVEL * 100)}% faster` },
        { name: 'Crit chance', detail: `+${Math.round(PRESTIGE.BONUSES.CRIT_CHANCE_ADD_PER_LEVEL * 100)}%` },
        { name: 'Max energy', detail: `+${PRESTIGE.BONUSES.MAX_ENERGY_ADD_PER_LEVEL}` },
        { name: 'Depression resistance', detail: `${Math.round(PRESTIGE.BONUSES.DEPRESSION_RESISTANCE_PER_LEVEL * 100)}% less depression gain` },
      ],
      willReset: ['xp_total', 'tier', 'commits_current', 'energy', 'generator_state', 'active_effects', 'event_state'],
      willKeep: ['commits_total', 'skins', 'inventory', 'streak', 'battle_pass', 'squads'],
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

    const levelResult = await client.query(
      'SELECT xp_total, prestige_level, prestige_currency FROM player_levels WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    const levelRow = levelResult.rows[0];
    if (!levelRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Player level row not found' });
    }

    const xpTotal = Number(levelRow.xp_total ?? 0);
    const prestigeLevel = Number(levelRow.prestige_level ?? 0);

    if (xpTotal < PRESTIGE.THRESHOLD_XP) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Not enough XP for prestige',
        requiredXp: PRESTIGE.THRESHOLD_XP,
        currentXp: xpTotal,
      });
    }

    const progressionResult = await client.query(
      'SELECT commits_total FROM progression WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    const commitsTotal = Number(progressionResult.rows[0]?.commits_total ?? 0);
    const prestigeCurrencyEarned = computePrestige(commitsTotal);
    const newPrestigeLevel = prestigeLevel + 1;

    await client.query(
      `UPDATE player_levels
       SET prestige_level = $2,
           prestige_currency = prestige_currency + $3,
           xp_total = 0,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, newPrestigeLevel, prestigeCurrencyEarned]
    );

    await client.query(
      `UPDATE progression
       SET prestige_level = $2,
           tier = 1,
           commits_current = 0,
           energy = 100,
           session_started_at = NOW(),
           active_effects = '{}',
           generator_state = '{}',
           event_state = '{}',
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, newPrestigeLevel]
    );

    const updatedLevel = await client.query(
      'SELECT xp_total, prestige_level, prestige_currency, prestige_shop_purchases FROM player_levels WHERE user_id = $1',
      [userId]
    );
    const updatedProgression = await client.query(
      'SELECT tier, commits_total, commits_current, energy, prestige_level, streak_days FROM progression WHERE user_id = $1',
      [userId]
    );

    await client.query('COMMIT');

    const effLvl = Math.min(PRESTIGE.MAX_PRESTIGE_LEVEL, newPrestigeLevel);
    const bonuses = {
      tapMult: 1 + PRESTIGE.BONUSES.TAP_MULT_PER_LEVEL * effLvl,
      energyRecoveryMult: 1 + PRESTIGE.BONUSES.ENERGY_RECOVERY_MULT_PER_LEVEL * effLvl,
      critAdd: PRESTIGE.BONUSES.CRIT_CHANCE_ADD_PER_LEVEL * effLvl,
      maxEnergyAdd: PRESTIGE.BONUSES.MAX_ENERGY_ADD_PER_LEVEL * effLvl,
      depressionResist: Math.max(0, 1 - PRESTIGE.BONUSES.DEPRESSION_RESISTANCE_PER_LEVEL * effLvl),
    };

    return res.json({
      success: true,
      prestigeLevel: newPrestigeLevel,
      prestigeCurrencyEarned,
      totalPrestigeCurrency: Number(updatedLevel.rows[0].prestige_currency ?? 0),
      bonuses,
      newState: {
        xpTotal: Number(updatedLevel.rows[0].xp_total ?? 0),
        tier: Number(updatedProgression.rows[0].tier ?? 1),
        commitsTotal: Number(updatedProgression.rows[0].commits_total ?? 0),
        energy: Number(updatedProgression.rows[0].energy ?? 100),
        streakDays: Number(updatedProgression.rows[0].streak_days ?? 0),
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
