-- 10_retention_cohorts.sql — D1/D7/D30 retention by weekly signup cohort.
-- Read-only operator query (weekly balance review). Day N = the user had at
-- least one session on the Nth calendar day after signup (activity date match).

WITH cohorts AS (
  SELECT
    u.id,
    date_trunc('week', u.created_at) AS cohort_week
  FROM users u
),
activity AS (
  SELECT
    c.id,
    c.cohort_week,
    (s.started_at::date - MIN(u2.created_at)::date) AS day_index
  FROM cohorts c
  JOIN users u2 ON u2.id = c.id
  JOIN sessions s ON s.user_id = c.id
  GROUP BY c.id, c.cohort_week, s.started_at::date, u2.created_at::date
)
SELECT
  cohort_week,
  COUNT(DISTINCT id) AS cohort_size,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN day_index = 1 THEN id END) / COUNT(DISTINCT id), 1) AS d1_pct,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN day_index = 7 THEN id END) / COUNT(DISTINCT id), 1) AS d7_pct,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN day_index = 30 THEN id END) / COUNT(DISTINCT id), 1) AS d30_pct
FROM activity
WHERE day_index IN (0, 1, 7, 30)
GROUP BY cohort_week
ORDER BY cohort_week DESC
LIMIT 12;
