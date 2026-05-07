-- Coder Survival — Daily Active Users & Retention
-- Run against production PostgreSQL after connecting via YC console or psql.
-- These queries use existing tables only; no schema changes required.

-- ─── DAU by day (last 14 days) ───────────────────────────────────────────
SELECT
  DATE(started_at) AS day,
  COUNT(DISTINCT user_id) AS dau,
  COUNT(*) AS session_count,
  ROUND(AVG(taps_count), 1) AS avg_taps_per_session
FROM sessions
WHERE started_at >= CURRENT_DATE - INTERVAL '14 days'
GROUP BY DATE(started_at)
ORDER BY day DESC;

-- ─── D1 Retention cohort (last 7 days) ───────────────────────────────────
-- Definition: user who had a session on day 1 after creation
WITH cohorts AS (
  SELECT
    id AS user_id,
    DATE(created_at) AS cohort_date
  FROM users
  WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
),
d1_active AS (
  SELECT DISTINCT user_id
  FROM sessions
  WHERE DATE(started_at) = DATE(
    SELECT created_at FROM users u2 WHERE u2.id = sessions.user_id
  ) + INTERVAL '1 day'
)
SELECT
  c.cohort_date,
  COUNT(DISTINCT c.user_id) AS cohort_size,
  COUNT(DISTINCT d1.user_id) AS d1_returned,
  ROUND(
    COUNT(DISTINCT d1.user_id) * 100.0 / NULLIF(COUNT(DISTINCT c.user_id), 0),
    2
  ) AS d1_retention_pct
FROM cohorts c
LEFT JOIN d1_active d1 ON d1.user_id = c.user_id
GROUP BY c.cohort_date
ORDER BY c.cohort_date DESC;

-- ─── Sticky factor (DAU / total registered users) ────────────────────────
SELECT
  COUNT(DISTINCT user_id) FILTER (WHERE DATE(started_at) = CURRENT_DATE - INTERVAL '1 day') AS yesterday_dau,
  (SELECT COUNT(*) FROM users) AS total_users,
  ROUND(
    COUNT(DISTINCT user_id) FILTER (WHERE DATE(started_at) = CURRENT_DATE - INTERVAL '1 day') * 100.0
    / NULLIF((SELECT COUNT(*) FROM users), 0),
    2
  ) AS sticky_factor_pct
FROM sessions;
