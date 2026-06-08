export async function getUserActiveLanguage(client, userId) {
  const result = await client.query(
    `SELECT pl.slug, pl.name, pl.display_name, pl.effect_type, pl.effect_value, pl.icon, pl.theme_color, pl.unlock_level, pl.unlock_achievement_slug
     FROM programming_languages pl
     JOIN user_languages ul ON ul.language_slug = pl.slug
     WHERE ul.user_id = $1 AND ul.is_active = TRUE
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function getAllLanguages(client, userId) {
  const allResult = await client.query(
    `SELECT slug, name, display_name, unlock_level, unlock_achievement_slug, effect_type, effect_value, description, icon, theme_color
     FROM programming_languages
     ORDER BY unlock_level ASC`
  );

  const unlockedResult = await client.query(
    `SELECT language_slug, unlocked_at, is_active
     FROM user_languages
     WHERE user_id = $1`,
    [userId]
  );

  const unlockedMap = new Map();
  for (const row of unlockedResult.rows) {
    unlockedMap.set(row.language_slug, row);
  }

  return allResult.rows.map((lang) => ({
    ...lang,
    unlocked: unlockedMap.has(lang.slug),
    unlockedAt: unlockedMap.get(lang.slug)?.unlocked_at || null,
    isActive: unlockedMap.get(lang.slug)?.is_active || false,
  }));
}

export async function getUserLanguages(client, userId) {
  const result = await client.query(
    `SELECT pl.slug, pl.name, pl.display_name, pl.effect_type, pl.effect_value, pl.description, pl.icon, pl.theme_color, pl.unlock_level, ul.unlocked_at, ul.is_active
     FROM user_languages ul
     JOIN programming_languages pl ON pl.slug = ul.language_slug
     WHERE ul.user_id = $1
     ORDER BY ul.unlocked_at ASC`,
    [userId]
  );
  return result.rows;
}

export async function unlockLanguageIfEligible(client, userId, languageSlug, currentRank = 1) {
  const langResult = await client.query(
    `SELECT unlock_level, unlock_achievement_slug
     FROM programming_languages
     WHERE slug = $1`,
    [languageSlug]
  );
  if (langResult.rows.length === 0) return { unlocked: false, reason: 'Language not found' };

  const lang = langResult.rows[0];

  const alreadyUnlocked = await client.query(
    `SELECT 1 FROM user_languages WHERE user_id = $1 AND language_slug = $2`,
    [userId, languageSlug]
  );
  if (alreadyUnlocked.rows.length > 0) return { unlocked: true, reason: 'Already unlocked' };

  let eligible = currentRank >= lang.unlock_level;

  if (!eligible && lang.unlock_achievement_slug) {
    const achResult = await client.query(
      `SELECT 1 FROM user_achievements ua
       JOIN achievements a ON a.id = ua.achievement_id
       WHERE ua.user_id = $1 AND a.slug = $2`,
      [userId, lang.unlock_achievement_slug]
    );
    eligible = achResult.rows.length > 0;
  }

  if (!eligible) return { unlocked: false, reason: 'Requirements not met' };

  await client.query(
    `INSERT INTO user_languages (user_id, language_slug, is_active)
     VALUES ($1, $2, FALSE)
     ON CONFLICT (user_id, language_slug) DO NOTHING`,
    [userId, languageSlug]
  );

  return { unlocked: true, reason: 'Unlocked' };
}

export async function setActiveLanguage(client, userId, languageSlug) {
  await client.query(
    `UPDATE user_languages
     SET is_active = FALSE
     WHERE user_id = $1`,
    [userId]
  );

  const result = await client.query(
    `UPDATE user_languages
     SET is_active = TRUE
     WHERE user_id = $1 AND language_slug = $2
     RETURNING language_slug`,
    [userId, languageSlug]
  );

  return result.rows[0] || null;
}

export function getLanguageEffectMultipliers(activeLanguage) {
  const defaults = {
    clickPowerMult: 1,
    passiveLocMult: 1,
    depressionResistMult: 1,
    coffeeDropChanceAdd: 0,
    themeColor: '#0f3460',
    icon: null,
    slug: null,
  };

  if (!activeLanguage) return defaults;

  const effectValue = Number(activeLanguage.effect_value || 0);
  const effectType = activeLanguage.effect_type;

  return {
    clickPowerMult: effectType === 'click_power' ? 1 + effectValue : 1,
    passiveLocMult: effectType === 'passive_loc' ? 1 + effectValue : 1,
    depressionResistMult: effectType === 'depression_resist' ? 1 - effectValue : 1,
    coffeeDropChanceAdd: effectType === 'coffee_drop_chance' ? effectValue : 0,
    themeColor: activeLanguage.theme_color || defaults.themeColor,
    icon: activeLanguage.icon || defaults.icon,
    slug: activeLanguage.slug || defaults.slug,
  };
}
