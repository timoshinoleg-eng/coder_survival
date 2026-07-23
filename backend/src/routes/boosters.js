import { Router } from 'express';
import { pool } from '../index.js';
import { addEffect, getActiveEffects } from '../utils/activeEffects.js';
import { checkAchievement } from '../utils/achievements.js';

const router = Router();

// Must match the prestige eligibility gate in routes/prestige.js. The
// `git_push_force` booster performs a full prestige reset (and grants a μ boost);
// without this gate a player could buy prestige progression for a flat Stars
// cost, bypassing the 1,000,000 lifetime-LOC requirement that normal prestige
// enforces.
const PRESTIGE_MIN_LOC = 1_000_000;

function buildExpiresAt(durationSec) {
  if (!durationSec || durationSec <= 0) return null;
  return new Date(Date.now() + durationSec * 1000).toISOString();
}

async function getOrCreateUser(client, telegramId) {
  const userResult = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramId]);
  if (userResult.rows.length === 0) return null;
  return userResult.rows[0].id;
}

async function applyBoosterEffect(client, userId, def, prog) {
  const effect = def.effect_json || {};
  const result = {};
  switch (def.slug) {
    case 'espresso': {
      await client.query(
        `UPDATE progression SET depression_level = GREATEST(0, depression_level - $2), updated_at = NOW() WHERE user_id = $1`,
        [userId, 20]
      );
      const updatedEffects = addEffect(prog.active_effects || {}, 'espresso', { clickSpeedMult: 2.0 }, def.duration_sec / 60);
      await client.query(`UPDATE progression SET active_effects = $2 WHERE user_id = $1`, [userId, JSON.stringify(updatedEffects)]);
      result.depressionDelta = -20;
      result.clickSpeedMult = 2.0;
      break;
    }
    case 'red_bull_mode': {
      await client.query(
        `UPDATE progression SET energy = LEAST(energy + 3, 1000), updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );
      const updatedEffects = addEffect(prog.active_effects || {}, 'red_bull_mode', { infiniteEnergy: true, maxEnergyAdd: 3 }, def.duration_sec / 60);
      await client.query(`UPDATE progression SET active_effects = $2 WHERE user_id = $1`, [userId, JSON.stringify(updatedEffects)]);
      result.infiniteEnergy = true;
      result.maxEnergyAdd = 3;
      break;
    }
    case 'git_push_force': {
      const newPrestigeCount = (prog.prestige_count || 0) + 1;
      const newPrestigeLevel = (prog.prestige_level || 0) + 1;
      await client.query(
        `UPDATE progression
         SET tier = 1,
             commits_current = 0,
             energy = 100,
             session_started_at = NOW(),
             active_effects = '{}',
             generator_state = '{}',
             event_state = '{}',
             prestige_count = $2,
             prestige_level = $3,
             git_push_force_mu_boost = COALESCE(git_push_force_mu_boost, 0) + 50,
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId, newPrestigeCount, newPrestigeLevel]
      );
      await client.query(
        `UPDATE player_levels
         SET prestige_level = COALESCE(prestige_level, 0) + 1,
             xp_total = 0,
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId]
      );
      result.prestigeReset = true;
      result.muBoostNextCycle = 50;
      break;
    }
    case 'stackoverflow_premium': {
      result.usesRemaining = 10;
      break;
    }
    case 'dark_theme': {
      await client.query(
        `INSERT INTO user_skins (user_id, skin_id, equipped, unlocked_at)
         VALUES ($1, 'dark_theme', false, NOW())
         ON CONFLICT (user_id, skin_id) DO NOTHING`,
        [userId]
      );
      result.skinGranted = 'dark_theme';
      break;
    }
    case 'mechanical_keyboard': {
      const updatedEffects = { ...(prog.active_effects || {}), mechanical_keyboard: { locPerClickMult: 1.25, uniqueAnimation: true } };
      await client.query(`UPDATE progression SET active_effects = $2 WHERE user_id = $1`, [userId, JSON.stringify(updatedEffects)]);
      result.locPerClickMult = 1.25;
      break;
    }
    case 'no_ads_pass': {
      const updatedEffects = addEffect(prog.active_effects || {}, 'no_ads_pass', { noInterstitials: true, rewardedMult: 2 }, def.duration_sec / 60);
      await client.query(`UPDATE progression SET active_effects = $2 WHERE user_id = $1`, [userId, JSON.stringify(updatedEffects)]);
      result.noInterstitials = true;
      result.rewardedMult = 2;
      break;
    }
    case 'senior_developer': {
      const updatedEffects = addEffect(prog.active_effects || {}, 'senior_developer', { passiveLOC: 500, autoRefactor: true }, def.duration_sec / 60);
      await client.query(`UPDATE progression SET active_effects = $2 WHERE user_id = $1`, [userId, JSON.stringify(updatedEffects)]);
      result.passiveLOC = 500;
      result.autoRefactor = true;
      break;
    }
    default:
      break;
  }
  return result;
}

router.get('/', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });
  const client = await pool.connect();
  try {
    const userId = await getOrCreateUser(client, telegramUser.id);
    if (!userId) return res.status(404).json({ error: 'User not found' });
    const defs = await client.query('SELECT * FROM booster_definitions ORDER BY stars_cost ASC');
    const userBoosters = await client.query(
      `SELECT * FROM user_boosters WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId]
    );
    const starsResult = await client.query('SELECT stars FROM progression WHERE user_id = $1', [userId]);
    const stars = Number(starsResult.rows[0]?.stars || 0);
    const activeMap = new Map();
    for (const ub of userBoosters.rows) {
      activeMap.set(ub.booster_slug, ub);
    }
    const boosters = defs.rows.map(def => {
      const active = activeMap.get(def.slug);
      return {
        slug: def.slug,
        name: def.name,
        starsCost: def.stars_cost,
        durationSec: def.duration_sec,
        effectJson: def.effect_json,
        permanent: def.permanent,
        owned: !!active,
        activeUntil: active?.expires_at ?? null,
        usesRemaining: active?.uses_remaining ?? null,
      };
    });
    res.json({ success: true, stars, boosters });
  } catch (err) {
    console.error('[Boosters] GET failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

router.post('/purchase', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });
  const { boosterSlug } = req.body || {};
  if (!boosterSlug) return res.status(400).json({ error: 'boosterSlug is required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userId = await getOrCreateUser(client, telegramUser.id);
    if (!userId) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'User not found' }); }
    const defResult = await client.query('SELECT * FROM booster_definitions WHERE slug = $1', [boosterSlug]);
    if (defResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Booster not found' }); }
    const def = defResult.rows[0];
    const progResult = await client.query(
      `SELECT stars, active_effects, depression_level, energy, commits_current, tier, commits_total, lifetime_loc, prestige_count, prestige_level, mu_currency, generator_state, event_state, streak_days, inventory
       FROM progression WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    if (progResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Progression not found' }); }
    const prog = progResult.rows[0];
    const stars = Number(prog.stars || 0);
    if (stars < def.stars_cost) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Not enough stars', required: def.stars_cost, available: stars }); }
    // Economy guard: git_push_force triggers a prestige reset — enforce the same
    // lifetime-LOC gate as a normal prestige so it cannot be bought around.
    if (def.slug === 'git_push_force') {
      const lifetimeLoc = Number(prog.lifetime_loc ?? prog.commits_total ?? 0);
      if (lifetimeLoc < PRESTIGE_MIN_LOC) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Not enough lifetime LOC for prestige', requiredLoc: PRESTIGE_MIN_LOC, lifetimeLoc });
      }
    }
    await client.query('UPDATE progression SET stars = stars - $2 WHERE user_id = $1', [userId, def.stars_cost]);
    if (def.permanent) {
      const existing = await client.query('SELECT 1 FROM user_boosters WHERE user_id = $1 AND booster_slug = $2', [userId, boosterSlug]);
      if (existing.rows.length > 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Already owned' }); }
      await client.query(
        `INSERT INTO user_boosters (user_id, booster_slug, purchased_at, expires_at, uses_remaining) VALUES ($1, $2, NOW(), NULL, NULL)`,
        [userId, boosterSlug]
      );
    } else {
      const expiresAt = buildExpiresAt(def.duration_sec);
      let usesRemaining = null;
      if (def.slug === 'stackoverflow_premium') usesRemaining = 10;
      if (expiresAt || usesRemaining !== null) {
        await client.query(
          `INSERT INTO user_boosters (user_id, booster_slug, purchased_at, expires_at, uses_remaining) VALUES ($1, $2, NOW(), $3, $4)
           ON CONFLICT (user_id, booster_slug) DO UPDATE SET
             purchased_at = EXCLUDED.purchased_at,
             expires_at = EXCLUDED.expires_at,
             uses_remaining = EXCLUDED.uses_remaining`,
          [userId, boosterSlug, expiresAt, usesRemaining]
        );
      }
    }
    const effectResult = await applyBoosterEffect(client, userId, def, prog);
    await checkAchievement(client, userId, 'purchase_booster', { boosterSlug });
    await client.query('COMMIT');
    res.json({ success: true, boosterSlug, starsLeft: stars - def.stars_cost, effect: effectResult });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Boosters] purchase failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

router.post('/activate', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });
  const { boosterSlug } = req.body || {};
  if (!boosterSlug) return res.status(400).json({ error: 'boosterSlug is required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userId = await getOrCreateUser(client, telegramUser.id);
    if (!userId) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'User not found' }); }
    const ubResult = await client.query(
      `SELECT * FROM user_boosters WHERE user_id = $1 AND booster_slug = $2 AND (expires_at IS NULL OR expires_at > NOW()) FOR UPDATE`,
      [userId, boosterSlug]
    );
    if (ubResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Booster not owned or expired' }); }
    const ub = ubResult.rows[0];
    if (ub.uses_remaining !== null && ub.uses_remaining <= 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'No uses remaining' }); }
    const defResult = await client.query('SELECT * FROM booster_definitions WHERE slug = $1', [boosterSlug]);
    const def = defResult.rows[0];
    let effectResult = {};
    if (def.slug === 'stackoverflow_premium') {
      await client.query(
        `UPDATE progression SET commits_current = commits_current + $2, depression_level = GREATEST(0, depression_level - $3), updated_at = NOW() WHERE user_id = $1`,
        [userId, 50, 10]
      );
      effectResult = { commitsDelta: 50, depressionDelta: -10 };
    }
    const newUses = ub.uses_remaining !== null ? ub.uses_remaining - 1 : null;
    if (newUses !== null && newUses <= 0) {
      await client.query('DELETE FROM user_boosters WHERE id = $1', [ub.id]);
    } else if (newUses !== null) {
      await client.query('UPDATE user_boosters SET uses_remaining = $2 WHERE id = $1', [ub.id, newUses]);
    }
    await client.query('COMMIT');
    res.json({ success: true, boosterSlug, usesRemaining: newUses, effect: effectResult });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Boosters] activate failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

export default router;
