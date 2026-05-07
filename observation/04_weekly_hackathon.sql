-- Coder Survival — Weekly Hackathon (Event) Observation
-- Uses: events, event_contributions, audit_logs

-- ─── Current event progress snapshot ─────────────────────────────────────
SELECT
  e.id AS event_id,
  e.type,
  e.target_commits AS target,
  e.start_date,
  e.end_date,
  COUNT(ec.user_id) AS participants,
  COUNT(ec.user_id) FILTER (WHERE ec.claimed) AS claimed,
  ROUND(
    COUNT(ec.user_id) FILTER (WHERE ec.claimed) * 100.0
    / NULLIF(COUNT(ec.user_id), 0),
    2
  ) AS completion_pct,
  ROUND(AVG(ec.commits_contributed), 0) AS avg_commits,
  MAX(ec.commits_contributed) AS max_commits
FROM events e
LEFT JOIN event_contributions ec ON ec.event_id = e.id
WHERE e.end_date >= CURRENT_DATE
GROUP BY e.id, e.type, e.target_commits, e.start_date, e.end_date;

-- ─── Historical completion rates ─────────────────────────────────────────
SELECT
  e.id AS event_id,
  e.type,
  e.start_date,
  e.target_commits,
  COUNT(ec.user_id) AS participants,
  COUNT(ec.user_id) FILTER (WHERE ec.claimed) AS completed,
  ROUND(
    COUNT(ec.user_id) FILTER (WHERE ec.claimed) * 100.0
    / NULLIF(COUNT(ec.user_id), 0),
    2
  ) AS completion_pct
FROM events e
LEFT JOIN event_contributions ec ON ec.event_id = e.id
GROUP BY e.id, e.type, e.start_date, e.target_commits
ORDER BY e.start_date DESC
LIMIT 10;

-- ─── Commit distribution (are users close to target or far?) ─────────────
SELECT
  CASE
    WHEN commits_contributed >= target_commits THEN 'reached_target'
    WHEN commits_contributed >= target_commits * 0.75 THEN '75_99_pct'
    WHEN commits_contributed >= target_commits * 0.50 THEN '50_74_pct'
    WHEN commits_contributed >= target_commits * 0.25 THEN '25_49_pct'
    ELSE 'under_25_pct'
  END AS progress_bucket,
  COUNT(*) AS users
FROM event_contributions ec
JOIN events e ON e.id = ec.event_id
WHERE e.end_date >= CURRENT_DATE
GROUP BY 1
ORDER BY MIN(commits_contributed) DESC;

-- ─── Drop-off proxy: users who stalled (no recent tap sessions) ──────────
-- Assumes active players have a session in the last 3 days.
SELECT
  COUNT(DISTINCT ec.user_id) AS event_participants,
  COUNT(DISTINCT ec.user_id) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.user_id = ec.user_id
        AND s.started_at >= CURRENT_DATE - INTERVAL '3 days'
    )
  ) AS still_active,
  COUNT(DISTINCT ec.user_id) FILTER (
    WHERE NOT EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.user_id = ec.user_id
        AND s.started_at >= CURRENT_DATE - INTERVAL '3 days'
    )
  ) AS likely_dropped_off
FROM event_contributions ec
JOIN events e ON e.id = ec.event_id
WHERE e.end_date >= CURRENT_DATE;
