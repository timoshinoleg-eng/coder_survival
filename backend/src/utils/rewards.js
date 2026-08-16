import { ensurePlayerLevel, addPlayerXp } from './vnext.js';
import { updateTeamProgress } from './teams.js';
import { DEPRESSION_SCALE } from '../config/balance.js';

/**
 * Shared reward applicator.
 * Supports:
 *   - energy: adds energy capped to maxEnergy
 *   - commitsCurrent: adds to progression.commits_current
 *   - depressionRelief: subtracts from depression_level
 *   - xpTotal: adds player XP
 *   - skin: unlocks a skin in user_skins
 *   - skinFragment: adds a skin fragment to progression.skin_fragments
 *   - avatarFrame: adds an avatar frame to progression.avatar_frames
 *   - muCurrency: adds μ-currency to progression.mu_currency
 *   - stars: adds stars (tracked in player inventory/purchases context)
 *   - title: grants a title badge
 *   - inventory.coffee_coins: adds earned Coffee Coins
 *
 * This is the single place to apply non-shop rewards so that
 * event / pass / team / quest rewards stay consistent.
 */
export async function applyReward(client, userId, rewardPayload) {
  if (!rewardPayload || Object.keys(rewardPayload).length === 0) {
    return { applied: false };
  }

  const levelRow = await ensurePlayerLevel(client, userId);
  const maxEnergy = levelRow.resolved.maxEnergy;
  const updates = [];

  if (typeof rewardPayload.energy === 'number') {
    await client.query(
      `UPDATE progression
       SET energy = LEAST($3, energy + $2),
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, rewardPayload.energy, maxEnergy]
    );
    updates.push({ type: 'energy', value: rewardPayload.energy });
  }

  const coffeeCoins = Number(rewardPayload.inventory?.coffee_coins || 0);
  if (Number.isInteger(coffeeCoins) && coffeeCoins > 0) {
    await client.query(
      `UPDATE progression
       SET inventory = jsonb_set(
         COALESCE(inventory, '{}'::jsonb),
         '{coffee_coins}',
         to_jsonb(COALESCE((inventory->>'coffee_coins')::int, 0) + $2),
         TRUE
       ),
       updated_at = NOW()
       WHERE user_id = $1`,
      [userId, coffeeCoins]
    );
    updates.push({ type: 'inventory', key: 'coffee_coins', value: coffeeCoins });
  }

  if (typeof rewardPayload.commitsCurrent === 'number') {
    const commitsDelta = Number(rewardPayload.commitsCurrent);
    await client.query(
      `UPDATE progression
       SET commits_current = commits_current + $2,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, commitsDelta]
    );
    await updateTeamProgress(client, userId, commitsDelta);
    updates.push({ type: 'commitsCurrent', value: commitsDelta });
  }

  if (typeof rewardPayload.xpTotal === 'number') {
    const xpDelta = Number(rewardPayload.xpTotal);
    await addPlayerXp(client, userId, xpDelta);
    updates.push({ type: 'xpTotal', value: xpDelta });
  }

  if (typeof rewardPayload.depressionRelief === 'number') {
    await client.query(
      `UPDATE progression
       SET depression_level = GREATEST(0, depression_level - $2),
            is_burnout = GREATEST(0, depression_level - $2) >= $3,
            updated_at = NOW()
        WHERE user_id = $1`,
      [userId, rewardPayload.depressionRelief, DEPRESSION_SCALE.HEART_ATTACK_THRESHOLD]
    );
    updates.push({ type: 'depressionRelief', value: rewardPayload.depressionRelief });
  }

  if (typeof rewardPayload.skin === 'string') {
    await client.query(
      `INSERT INTO user_skins (user_id, skin_id, equipped, unlocked_at)
       VALUES ($1, $2, FALSE, NOW())
       ON CONFLICT (user_id, skin_id) DO NOTHING`,
      [userId, rewardPayload.skin]
    );
    updates.push({ type: 'skin', value: rewardPayload.skin });
  }

  if (rewardPayload.skinFragment) {
    const fragmentKey = typeof rewardPayload.skinFragment === 'string'
      ? rewardPayload.skinFragment
      : 'unknown_fragment';
    await client.query(
      `UPDATE progression
       SET skin_fragments = jsonb_set(
         COALESCE(skin_fragments, '{}'),
         ARRAY[$2],
         to_jsonb(COALESCE((skin_fragments->>$2)::int, 0) + 1)
       ),
       updated_at = NOW()
       WHERE user_id = $1`,
      [userId, fragmentKey]
    );
    updates.push({ type: 'skinFragment', value: fragmentKey });
  }

  if (typeof rewardPayload.avatarFrame === 'string') {
    await client.query(
      `UPDATE progression
       SET avatar_frames = CASE
         WHEN avatar_frames IS NULL THEN jsonb_build_array($2)
         WHEN NOT avatar_frames @> jsonb_build_array($2) THEN avatar_frames || jsonb_build_array($2)
         ELSE avatar_frames
       END,
       updated_at = NOW()
       WHERE user_id = $1`,
      [userId, rewardPayload.avatarFrame]
    );
    updates.push({ type: 'avatarFrame', value: rewardPayload.avatarFrame });
  }

  if (typeof rewardPayload.muCurrency === 'number') {
    const muDelta = Number(rewardPayload.muCurrency);
    await client.query(
      `UPDATE progression
       SET mu_currency = mu_currency + $2,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, muDelta]
    );
    updates.push({ type: 'muCurrency', value: muDelta });
  }

  if (typeof rewardPayload.stars === 'number') {
    const starsDelta = Number(rewardPayload.stars);
    await client.query(
      `UPDATE progression
       SET stars = stars + $2,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, starsDelta]
    );
    updates.push({ type: 'stars', value: starsDelta });
  }

  if (typeof rewardPayload.booster === 'string') {
    const boosterSlug = rewardPayload.booster;
    const defResult = await client.query(
      `SELECT slug, duration_sec, permanent FROM booster_definitions WHERE slug = $1`,
      [boosterSlug]
    );
    if (defResult.rows.length > 0) {
      const def = defResult.rows[0];
      if (def.permanent) {
        await client.query(
          `INSERT INTO user_boosters (user_id, booster_slug, purchased_at, expires_at, uses_remaining)
           VALUES ($1, $2, NOW(), NULL, NULL)
           ON CONFLICT (user_id, booster_slug) DO NOTHING`,
          [userId, boosterSlug]
        );
      } else {
        const durationHours = Number(rewardPayload.boosterDurationHours || (def.duration_sec ? def.duration_sec / 3600 : 24));
        const expiresAt = new Date(Date.now() + durationHours * 3600000).toISOString();
        let usesRemaining = null;
        if (boosterSlug === 'stackoverflow_premium') usesRemaining = 10;
        await client.query(
          `INSERT INTO user_boosters (user_id, booster_slug, purchased_at, expires_at, uses_remaining)
           VALUES ($1, $2, NOW(), $3, $4)
           ON CONFLICT (user_id, booster_slug) DO UPDATE SET
             purchased_at = EXCLUDED.purchased_at,
             expires_at = EXCLUDED.expires_at,
             uses_remaining = EXCLUDED.uses_remaining`,
          [userId, boosterSlug, expiresAt, usesRemaining]
        );
      }
      updates.push({ type: 'booster', value: boosterSlug });
    }
  }

  if (typeof rewardPayload.title === 'string') {
    await client.query(
      `UPDATE progression
       SET pass_state = jsonb_set(
         COALESCE(pass_state, '{}'),
         '{title}',
         to_jsonb($2::text)
       ),
       updated_at = NOW()
       WHERE user_id = $1`,
      [userId, rewardPayload.title]
    );
    updates.push({ type: 'title', value: rewardPayload.title });
  }

  return { applied: updates.length > 0, updates };
}
