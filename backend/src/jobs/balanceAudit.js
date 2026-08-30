import { pool } from '../index.js';
import { DEPRESSION_SCALE } from '../config/balance.js';

const AUDIT_INTERVAL_MS = 5 * 60 * 1000;
const MAX_POSSIBLE_ENERGY = 220;
const MAX_COMMITS_PER_TAP = 8;
const MAX_TAPS_PER_DAY = 10000;
const MAX_COMMITS_PER_DAY = MAX_TAPS_PER_DAY * MAX_COMMITS_PER_TAP;
const SUSPICIOUS_COMMITS_MULTIPLIER = 1.05;

async function runBalanceAudit() {
  let client;
  try {
    client = await pool.connect();

    const violations = [];

    const energyViolations = await client.query(
      `SELECT p.user_id, p.energy, p.depression_level, p.commits_current, p.commits_total
       FROM progression p
       WHERE p.energy > $1`,
      [MAX_POSSIBLE_ENERGY]
    );

    for (const row of energyViolations.rows) {
      violations.push({
        userId: row.user_id,
        type: 'energy_overflow',
        details: { energy: row.energy, maxAllowed: MAX_POSSIBLE_ENERGY }
      });
    }

    const depressionViolations = await client.query(
      `SELECT user_id, depression_level
       FROM progression
       WHERE depression_level < 0 OR depression_level > $1`,
      [DEPRESSION_SCALE.MAX]
    );

    for (const row of depressionViolations.rows) {
      violations.push({
        userId: row.user_id,
        type: 'depression_out_of_range',
        details: { depression_level: row.depression_level }
      });
    }

    const afflictionInconsistency = await client.query(
      `SELECT user_id, depression_level, burnout_affliction
       FROM progression
       WHERE (depression_level >= 100 AND burnout_affliction = FALSE)
          OR (depression_level < 100 AND burnout_affliction = TRUE)`
    );

    for (const row of afflictionInconsistency.rows) {
      violations.push({
        userId: row.user_id,
        type: 'burnout_affliction_inconsistent',
        details: { depression_level: row.depression_level, burnout_affliction: row.burnout_affliction }
      });
    }

    const commitViolations = await client.query(
      `SELECT p.user_id, p.commits_total,
              COALESCE(rl.tap_count, 0) AS recent_taps
       FROM progression p
       LEFT JOIN rate_limit_ip rl ON rl.tap_date = CURRENT_DATE
       WHERE p.commits_total > $1`,
      [MAX_COMMITS_PER_DAY * SUSPICIOUS_COMMITS_MULTIPLIER * 30]
    );

    for (const row of commitViolations.rows) {
      violations.push({
        userId: row.user_id,
        type: 'commits_total_suspicious',
        details: { commits_total: row.commits_total, maxExpected: MAX_COMMITS_PER_DAY * 30 }
      });
    }

    if (violations.length === 0) {
      return;
    }

    // Parameterized multi-row insert — no row data is interpolated into SQL.
    // Fixes sql-injection (code-scanning alert #113) on this query.
    const placeholders = violations.map((_, i) => {
      const b = i * 3 + 1;
      return `(${b}, 'balance_audit_violation', ${b + 1}::jsonb, NOW())`;
    }).join(', ');

    const params = [];
    for (const v of violations) {
      params.push(Number(v.userId));
      params.push(JSON.stringify({ type: v.type, ...v.details }));
    }

    await client.query(
      `INSERT INTO audit_logs (user_id, action, context, created_at)
       VALUES ${placeholders}`,
      params
    );

    console.warn('[BalanceAudit] Нарушения обнаружены:', violations.length, 'записей');
    for (const v of violations) {
      console.warn(`[BalanceAudit] user_id=${v.userId} type=${v.type}`, v.details);
    }
  } catch (err) {
    console.error('[BalanceAudit] Ошибка сверки балансов:', err.message);
  } finally {
    if (client) client.release();
  }
}

export function startBalanceAuditJob() {
  console.log(`[BalanceAudit] Запущен (каждые ${AUDIT_INTERVAL_MS / 60000} мин)`);
  setInterval(runBalanceAudit, AUDIT_INTERVAL_MS);
}
