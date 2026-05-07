-- Coder Survival — Economy Health Snapshot
-- One-stop query to sanity-check the live balance pass.
-- Run daily and diff the numbers.

WITH
energy_dist AS (
  SELECT
    ROUND(AVG(p.energy), 1) AS avg_energy,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.energy) AS median_energy,
    COUNT(*) FILTER (WHERE p.energy <= pl.max_energy * 0.25) AS low_energy_users
  FROM progression p
  JOIN player_levels pl ON pl.user_id = p.user_id
),
depression_dist AS (
  SELECT
    ROUND(AVG(p.depression), 1) AS avg_depression,
    COUNT(*) FILTER (WHERE p.depression >= 55) AS high_stress_users
  FROM progression p
),
commit_dist AS (
  SELECT
    ROUND(AVG(commits_total), 0) AS avg_total_commits,
    MAX(commits_total) AS max_total_commits
  FROM progression
),
rank_dist AS (
  SELECT
    rank,
    COUNT(*) AS players
  FROM player_levels
  GROUP BY rank
  ORDER BY rank
),
today_quests AS (
  SELECT
    COUNT(DISTINCT user_id) FILTER (WHERE completed) AS completed_any,
    COUNT(DISTINCT user_id) AS total_users
  FROM daily_quests
  WHERE quest_date = CURRENT_DATE
)
SELECT
  (SELECT COUNT(*) FROM users) AS total_users,
  (SELECT COUNT(*) FROM sessions WHERE DATE(started_at) = CURRENT_DATE - INTERVAL '1 day') AS yesterday_sessions,
  (SELECT dau FROM (SELECT COUNT(DISTINCT user_id) AS dau FROM sessions WHERE DATE(started_at) = CURRENT_DATE - INTERVAL '1 day') t) AS yesterday_dau,
  (SELECT avg_energy FROM energy_dist) AS avg_energy,
  (SELECT median_energy FROM energy_dist) AS median_energy,
  (SELECT low_energy_users FROM energy_dist) AS low_energy_users,
  (SELECT avg_depression FROM depression_dist) AS avg_depression,
  (SELECT high_stress_users FROM depression_dist) AS high_stress_users,
  (SELECT avg_total_commits FROM commit_dist) AS avg_total_commits,
  (SELECT max_total_commits FROM commit_dist) AS max_total_commits,
  (SELECT ROUND(completed_any * 100.0 / NULLIF(total_users, 0), 2) FROM today_quests) AS quest_any_completion_pct;

-- ─── Rank distribution (vertical table for readability) ──────────────────
SELECT * FROM rank_dist;
