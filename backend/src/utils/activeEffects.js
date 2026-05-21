/**
 * Active effects engine — manages temporary buffs/debuffs on progression.
 * Effects are stored in progression.active_effects JSONB.
 */

export function getActiveEffects(activeEffectsJson, now = new Date()) {
  const effects = activeEffectsJson || {};
  const result = {};
  for (const [key, effect] of Object.entries(effects)) {
    if (!effect || !effect.expiresAt) continue;
    if (new Date(effect.expiresAt).getTime() > now.getTime()) {
      result[key] = effect;
    }
  }
  return result;
}

export function pruneExpiredEffects(activeEffectsJson, now = new Date()) {
  const effects = activeEffectsJson || {};
  const result = {};
  for (const [key, effect] of Object.entries(effects)) {
    if (!effect || !effect.expiresAt) continue;
    if (new Date(effect.expiresAt).getTime() > now.getTime()) {
      result[key] = effect;
    }
  }
  return result;
}

export function addEffect(activeEffectsJson, key, payload, durationMinutes, now = new Date()) {
  const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
  return {
    ...(activeEffectsJson || {}),
    [key]: {
      ...payload,
      expiresAt: expiresAt.toISOString()
    }
  };
}

export function applyTapBoost(activeEffectsJson, baseCommits, now = new Date()) {
  const effects = getActiveEffects(activeEffectsJson, now);
  const boost = effects.tapBoost;
  if (boost && boost.percent) {
    return Math.round(baseCommits * (1 + boost.percent / 100));
  }
  return baseCommits;
}
