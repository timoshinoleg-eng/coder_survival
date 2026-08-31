#!/usr/bin/env node
/**
 * phaseC_monitor.mjs — soft-launch cohort gating + duplicate-reward Red monitor.
 *
 * Phase C of the coder_survival release. Implements the 5m→15m→1h→24h→72h staged
 * rollout with an automatic HALT on any security / duplicate-reward Red, per the
 * release plan. Built on the B5 finding: reward idempotency is sound at code level,
 * so a divergence between granted rewards and consumed verified sessions is the
 * authoritative cheat/spoof signal.
 *
 * What it checks (all DB-side, no secrets needed beyond DATABASE_URL):
 *   1. duplicate_reward_divergence (RED): per (user, date), ad_rewards.count >
 *      # of ad_reward_sessions with status='used' that day → more rewards than
 *      consumed sessions → impossible by code → spoofing / regression.
 *   2. daily_cap_regression (RED): ad_rewards.count > MAX_ADS_PER_DAY (5) → the
 *      per-day cap the code enforces was bypassed.
 *   3. ledger_mismatch (AMBER): used_sessions > rewards_granted → session consumed
 *      but reward not recorded → data bug to investigate (not a security halt).
 *   4. watchlist: top users by session volume today (cheat triage aid).
 *
 * Cohort gating: with LAUNCH_TS set, it maps elapsed time to the cohort schedule
 * and reports whether to HALT or GO (and the next cohort to widen to).
 *
 * Exit codes: 0 = GO (no Red), 1 = HALT (Red found), 2 = usage/DB error.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node phaseC_monitor.mjs [--launch-ts ISO8601] [--json]
 *   (omit --launch-ts for a pure point-in-time health check, no cohort gating)
 */
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbUrl = process.env.DATABASE_URL;
const launchTs = process.argv.includes('--launch-ts')
  ? process.argv[process.argv.indexOf('--launch-ts') + 1]
  : process.env.LAUNCH_TS;
const asJson = process.argv.includes('--json');

const MAX_ADS_PER_DAY = Number(process.env.MAX_ADS_PER_DAY || 5);
// The enforced cap lives in backend/src/config/balance.js (DEFAULTS.ADS.maxPerDay=5).
// If this env override diverges, the monitor and the code disagree on daily_cap_regression.
if (MAX_ADS_PER_DAY !== 5) {
  console.error(`WARN: MAX_ADS_PER_DAY=${MAX_ADS_PER_DAY} but DEFAULTS.ADS.maxPerDay=5 — monitor/code diverge on daily_cap_regression.`);
}
const FALLBACK_COHORTS = '{"cohorts":[{"name":"5m","minutes":5},{"name":"15m","minutes":15},{"name":"1h","minutes":60},{"name":"24h","minutes":1440},{"name":"72h","minutes":4320}]}';
// resolve cohorts.json next to this script first, then cwd — so the harness works
// regardless of where it is invoked from.
const cohortsPath = [path.join(__dirname, 'cohorts.json'), path.resolve('cohorts.json')].find((p) => fs.existsSync(p));
const COHORTS = JSON.parse(cohortsPath ? fs.readFileSync(cohortsPath, 'utf8') : FALLBACK_COHORTS).cohorts;

function run(sql, params = []) {
  return pool.query(sql, params);
}

let pool;
async function main() {
  if (!dbUrl) { console.error('ERROR: set DATABASE_URL.'); process.exit(2); }
  pool = new pg.Pool({ connectionString: dbUrl });

  const red = [];
  const amber = [];

  // 1+2: divergence + daily-cap regression
  // NOTE: ad_rewards.date (written via CURRENT_DATE) and used_at::date both resolve in the PG
  // session timezone. No SET TIME ZONE is configured anywhere in the backend, so the monitor
  // and the writer share the server default — keep it that way (no per-connection tz).
  const { rows: div } = await run(
    `SELECT ar.user_id,
            ar.date,
            ar.count                         AS rewards_granted,
            COALESCE(s.used_sessions, 0)      AS used_sessions
     FROM ad_rewards ar
     LEFT JOIN (
       SELECT user_id,
              (used_at::date) AS d,
              COUNT(*) FILTER (WHERE status = 'used') AS used_sessions
       FROM ad_reward_sessions
       GROUP BY user_id, (used_at::date)
     ) s ON s.user_id = ar.user_id AND s.d = ar.date
     WHERE ar.date >= CURRENT_DATE - INTERVAL '3 days'`,
  );
  for (const r of div) {
    if (r.rewards_granted > r.used_sessions) {
      red.push({ type: 'duplicate_reward_divergence', user: r.user_id, date: String(r.date), rewards: r.rewards_granted, used: r.used_sessions });
    }
    if (r.rewards_granted > MAX_ADS_PER_DAY) {
      red.push({ type: 'daily_cap_regression', user: r.user_id, date: String(r.date), rewards: r.rewards_granted, max: MAX_ADS_PER_DAY });
    }
    if (r.used_sessions > r.rewards_granted) {
      amber.push({ type: 'ledger_mismatch', user: r.user_id, date: String(r.date), rewards: r.rewards_granted, used: r.used_sessions });
    }
  }

  // 3b: catch used_sessions that have NO ad_rewards ledger row at all. A LEFT JOIN off `ar`
  // (above) silently hides these, suppressing both RED and AMBER — a blind spot that would
  // mask lost/missing reward ledger rows. Uses the same (used_at::date) expression as the
  // main query so the two stay timezone-consistent.
  const { rows: missingLedger } = await run(
    `SELECT s.user_id, s.d, s.used_sessions
     FROM (
       SELECT user_id,
              (used_at::date) AS d,
              COUNT(*) FILTER (WHERE status = 'used') AS used_sessions
       FROM ad_reward_sessions
       GROUP BY user_id, (used_at::date)
     ) s LEFT JOIN ad_rewards ar ON ar.user_id = s.user_id AND ar.date = s.d
     WHERE ar.user_id IS NULL AND s.used_sessions > 0
     ORDER BY s.d DESC, s.used_sessions DESC`,
  );
  for (const r of missingLedger) {
    amber.push({ type: 'ledger_mismatch', user: r.user_id, date: String(r.d), rewards: 0, used: r.used_sessions, reason: 'no_ad_rewards_row' });
  }

  // 4: watchlist — top session volume today
  const { rows: watch } = await run(
    `SELECT user_id, COUNT(*) AS sessions_today
     FROM ad_reward_sessions
     WHERE created_at >= CURRENT_DATE
     GROUP BY user_id
     ORDER BY 2 DESC
     LIMIT 10`,
  );

  await pool.end();

  // Cohort gating
  let cohort = null;
  if (launchTs) {
    const elapsedMin = (Date.now() - new Date(launchTs).getTime()) / 60000;
    const passed = COHORTS.filter((c) => c.minutes <= elapsedMin).length;
    const current = COHORTS[Math.min(passed, COHORTS.length - 1)].name;
    // `passed` = cohorts already fully observed; the next widen target is the following
    // cohort, not the current one (avoids next === current at launch before 5m elapses).
    const next = passed + 1 < COHORTS.length ? COHORTS[passed + 1].name : 'FULL (72h reached)';
    cohort = { launchTs, elapsedMin: Math.round(elapsedMin), observedCohorts: passed, currentCohort: current, nextCohort: next };
  }

  const verdict = red.length ? 'HALT' : 'GO';
  const out = { verdict, red, amber, watchlist: watch, cohort };

  if (asJson) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log('\n=== PHASE C SOFT-LAUNCH MONITOR ===');
    if (cohort) {
      console.log(`Launch: ${cohort.launchTs}  elapsed: ${cohort.elapsedMin} min`);
      console.log(`Cohort: now in "${cohort.currentCohort}" — next widen target: "${cohort.nextCohort}" (${cohort.observedCohorts} window(s) fully observed)`);
    } else {
      console.log('Launch timestamp not set — point-in-time health check only.');
    }
    console.log(`\nRED signals : ${red.length}`);
    red.forEach((r) => console.log(`  [RED] ${r.type} user=${r.user} date=${r.date} rewards=${r.rewards} used=${r.used ?? '-'} max=${r.max ?? '-'}`));
    console.log(`AMBER signals: ${amber.length}`);
    amber.forEach((r) => console.log(`  [AMBER] ${r.type} user=${r.user} date=${r.date} rewards=${r.rewards} used=${r.used}`));
    console.log('\nTOP SESSION VOLUME TODAY (cheat triage):');
    watch.forEach((w) => console.log(`  user=${w.user_id} sessions=${w.sessions_today}`));
    console.log(`\nVERDICT: ${verdict}` + (verdict === 'HALT' ? ' — DO NOT widen cohort; investigate Red before proceeding.' : ' — safe to observe / widen to next cohort.'));
  }

  process.exit(verdict === 'HALT' ? 1 : 0);
}

main().catch(async (e) => { console.error('Fatal:', e.message); try { await pool?.end(); } catch {} process.exit(2); });
