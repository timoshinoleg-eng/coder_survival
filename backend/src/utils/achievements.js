/**
 * Legacy achievement compatibility wrapper.
 * The new achievements engine (achievementsEngine.js) uses a different schema.
 * This file prevents crashes in routes that still import these functions.
 */

export async function ensureAchievementRows(_client, _userId) {
  // New schema auto-creates rows on demand via ON CONFLICT DO NOTHING.
  // No pre-seeding required.
}

export async function checkAchievement(_client, _userId, _triggerType, _payload = {}) {
  // Legacy hardcoded achievements no longer exist in the new schema.
  // The new engine (achievementsEngine.js) handles achievements via DB-driven catalog.
  return [];
}

export function isNightSessionAt(dateLike) {
  if (!dateLike) {
    return false;
  }
  const hour = new Date(dateLike).getHours();
  return hour >= 22 || hour < 6;
}
