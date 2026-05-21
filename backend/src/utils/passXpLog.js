const UNDEFINED_TABLE = '42P01';

let passXpLogAvailable = null;

export async function logPassXp(client, userId, passId, source, amount, context = null) {
  if (!passId || amount <= 0) return null;
  if (!(await hasPassXpLogTable(client))) return null;

  try {
    const result = await client.query(
      `INSERT INTO pass_xp_log (user_id, pass_id, source, amount, context)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING *`,
      [userId, passId, source, amount, context ? JSON.stringify(context) : null]
    );
    return result.rows[0];
  } catch (error) {
    if (isMissingPassXpLog(error)) {
      passXpLogAvailable = null;
      return null;
    }
    throw error;
  }
}

export async function getXpSourcesAggregate(client, userId, passId) {
  const defaults = { quest: 0, minigame: 0, social: 0, tap: 0, other: 0 };
  if (!(await hasPassXpLogTable(client))) return defaults;

  const result = await client.query(
    `SELECT source, COALESCE(SUM(amount), 0)::int as total
     FROM pass_xp_log
     WHERE user_id = $1 AND pass_id = $2
     GROUP BY source`,
    [userId, passId]
  );
  for (const row of result.rows) {
    defaults[row.source] = row.total;
  }
  return defaults;
}

export function getMiniGameXpPlaceholder() {
  // Phase 6: replace with real mini-game XP
  return 0;
}

async function hasPassXpLogTable(client) {
  if (passXpLogAvailable === true) return true;

  const result = await client.query(`SELECT to_regclass('public.pass_xp_log') AS table_name`);
  const exists = Boolean(result.rows[0]?.table_name);
  if (exists) {
    passXpLogAvailable = true;
  }
  return exists;
}

function isMissingPassXpLog(error) {
  return error?.code === UNDEFINED_TABLE && String(error.message || '').includes('pass_xp_log');
}
