-- Coder Survival — Stress v2 A/B Cohort Observation
-- Requires: users.feature_flags populated (backfilled by 010_backfill_stress_v2_cohort.sql)
-- Run against production PostgreSQL after connecting via YC console or psql.

-- ─── Cohort sizes (overall) ──────────────────────────────────────────────
SELECT
  CASE
    WHEN feature_flags ->> 'stress_v2' = 'true' THEN 'test'
    ELSE 'control'
  END AS stress_cohort,
  COUNT(*) AS user_count
FROM users
GROUP BY stress_cohort
ORDER BY stress_cohort;

-- ─── Current depression snapshot of users active on each of the last 7 days ──
-- NOTE: This is NOT a historical progression snapshot.
-- It answers: "for users who were active on day D, what is their CURRENT
-- depression/energy right now?" The schema does not store per-day progression
-- snapshots yet, so do not read this as a true daily historical trend.
SELECT
  CASE
    WHEN u.feature_flags ->> 'stress_v2' = 'true' THEN 'test'
    ELSE 'control'
  END AS stress_cohort,
  DATE(s.started_at) AS day,
  ROUND(AVG(p.depression_level), 2) AS current_avg_depression,
  ROUND(AVG(p.energy), 2) AS current_avg_energy,
  COUNT(DISTINCT s.user_id) AS active_users
FROM sessions s
JOIN users u ON u.id = s.user_id
JOIN progression p ON p.user_id = s.user_id
WHERE s.started_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY stress_cohort, DATE(s.started_at)
ORDER BY day DESC, stress_cohort;

-- ─── Current high-stress snapshot of users active on each of the last 7 days ──
-- Same caveat as above: this uses CURRENT progression, not day-specific state.
SELECT
  CASE
    WHEN u.feature_flags ->> 'stress_v2' = 'true' THEN 'test'
    ELSE 'control'
  END AS stress_cohort,
  DATE(s.started_at) AS day,
  COUNT(DISTINCT s.user_id) AS active_users,
  COUNT(DISTINCT s.user_id) FILTER (WHERE p.depression_level >= 20) AS current_high_stress_users,
  ROUND(
    COUNT(DISTINCT s.user_id) FILTER (WHERE p.depression_level >= 20) * 100.0
    / NULLIF(COUNT(DISTINCT s.user_id), 0),
    2
  ) AS current_pct_high_stress
FROM sessions s
JOIN users u ON u.id = s.user_id
JOIN progression p ON p.user_id = s.user_id
WHERE s.started_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY stress_cohort, DATE(s.started_at)
ORDER BY day DESC, stress_cohort;

-- ─── Context offer impressions by cohort (last 7 days) ───────────────────
SELECT
  CASE
    WHEN u.feature_flags ->> 'stress_v2' = 'true' THEN 'test'
    ELSE 'control'
  END AS stress_cohort,
  oi.offer_type,
  COUNT(*) AS impressions,
  COUNT(DISTINCT oi.user_id) AS unique_users
FROM offer_impressions oi
JOIN users u ON u.id = oi.user_id
WHERE oi.shown_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY stress_cohort, oi.offer_type
ORDER BY stress_cohort, impressions DESC;

-- ─── Energy starvation proxy by cohort ───────────────────────────────────
-- NOTE: This is a proxy metric, not a direct "energy = 0" measurement.
-- The heuristic (taps_count >= commits_earned + 10) approximates sessions
-- where the player was heavily energy-constrained.
-- Replace with direct energy=0 signal if/when session-level energy snapshots
-- become available in the schema.
SELECT
  CASE
    WHEN u.feature_flags ->> 'stress_v2' = 'true' THEN 'test'
    ELSE 'control'
  END AS stress_cohort,
  DATE(s.started_at) AS day,
  COUNT(DISTINCT s.user_id) AS active_users,
  COUNT(DISTINCT s.user_id) FILTER (WHERE s.taps_count >= s.commits_earned + 10) AS energy_starved_users,
  ROUND(
    COUNT(DISTINCT s.user_id) FILTER (WHERE s.taps_count >= s.commits_earned + 10) * 100.0
    / NULLIF(COUNT(DISTINCT s.user_id), 0),
    2
  ) AS starvation_pct
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.started_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY stress_cohort, DATE(s.started_at)
ORDER BY day DESC, stress_cohort;
