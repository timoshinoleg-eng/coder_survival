import cron from 'node-cron';
import { pool } from '../index.js';

/**
 * Retention cleanup for append-only / rolling tables.
 * Keeps audit_logs, sessions, offer_impressions and rate_limit_ip from
 * growing unbounded. Leaderboard today/week aggregates read from sessions,
 * so its retention window must stay >= leaderboard horizon (7 days + buffer).
 *
 * Env overrides (days): RETENTION_AUDIT_LOGS_DAYS (default 90),
 * RETENTION_SESSIONS_DAYS (default 30), RETENTION_OFFER_IMPRESSIONS_DAYS (60),
 * RETENTION_RATE_LIMIT_IP_DAYS (default 3).
 */
const TASKS = [
  {
    name: 'audit_logs',
    sql: `DELETE FROM audit_logs WHERE created_at < NOW() - ($1 || ' days')::interval`,
    days: Number(process.env.RETENTION_AUDIT_LOGS_DAYS || 90)
  },
  {
    name: 'sessions',
    sql: `DELETE FROM sessions WHERE started_at < NOW() - ($1 || ' days')::interval`,
    days: Number(process.env.RETENTION_SESSIONS_DAYS || 30)
  },
  {
    name: 'offer_impressions',
    sql: `DELETE FROM offer_impressions WHERE shown_at < NOW() - ($1 || ' days')::interval`,
    days: Number(process.env.RETENTION_OFFER_IMPRESSIONS_DAYS || 60)
  },
  {
    name: 'rate_limit_ip',
    sql: `DELETE FROM rate_limit_ip WHERE tap_date < CURRENT_DATE - ($1 || ' days')::interval`,
    days: Number(process.env.RETENTION_RATE_LIMIT_IP_DAYS || 3)
  }
];

async function runCleanup() {
  for (const task of TASKS) {
    try {
      const result = await pool.query(task.sql, [task.days]);
      if (result.rowCount > 0) {
        console.log(`[RetentionCleanup] ${task.name}: removed ${result.rowCount} rows (older than ${task.days}d)`);
      }
    } catch (err) {
      console.error(`[RetentionCleanup] ${task.name} failed:`, err.message);
    }
  }
}

export function startRetentionCleanupCron() {
  // 04:20 UTC — low-traffic window for the RU audience.
  cron.schedule('20 4 * * *', runCleanup);
  console.log('[RetentionCleanup] Started (daily 04:20 UTC)');
}
