import { getActivePass } from './pass.js';

export async function logPassXp(client, userId, passId, source, amount, context = null) {
  if (!passId || amount <= 0) return null;
  const result = await client.query(
    `INSERT INTO pass_xp_log (user_id, pass_id, source, amount, context)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING *`,
    [userId, passId, source, amount, context ? JSON.stringify(context) : null]
  );
  return result.rows[0];
}

export async function getXpSourcesAggregate(client, userId, passId) {
  const result = await client.query(
    `SELECT source, COALESCE(SUM(amount), 0)::int as total
     FROM pass_xp_log
     WHERE user_id = $1 AND pass_id = $2
     GROUP BY source`,
    [userId, passId]
  );
  const defaults = { quest: 0, minigame: 0, social: 0, tap: 0, other: 0 };
  for (const row of result.rows) {
    defaults[row.source] = row.total;
  }
  return defaults;
}

export function getMiniGameXpPlaceholder() {
  // Phase 6: replace with real mini-game XP
  return 0;
}
