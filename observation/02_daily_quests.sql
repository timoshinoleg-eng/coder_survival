-- Coder Survival — Daily Quest Observation
-- Uses: daily_quests (now with completed_at / claimed_at from 007 migration)

-- ─── Per-quest completion rate today ─────────────────────────────────────
SELECT
  quest_type,
  target_value,
  COUNT(*) FILTER (WHERE completed) AS completed,
  COUNT(*) AS total,
  ROUND(
    COUNT(*) FILTER (WHERE completed) * 100.0 / NULLIF(COUNT(*), 0),
    2
  ) AS completion_pct
FROM daily_quests
WHERE quest_date = CURRENT_DATE
GROUP BY quest_type, target_value
ORDER BY quest_type;

-- ─── Full-clear rate by date (all 3 quests completed + claimed) ──────────
SELECT
  quest_date,
  COUNT(DISTINCT user_id) FILTER (WHERE completed) AS users_with_any_complete,
  COUNT(DISTINCT user_id) AS users_with_quests,
  COUNT(DISTINCT user_id) FILTER (
    WHERE user_id IN (
      SELECT user_id FROM daily_quests d2
      WHERE d2.quest_date = daily_quests.quest_date
      GROUP BY user_id
      HAVING COUNT(*) FILTER (WHERE completed) = 3
    )
  ) AS full_clear_users,
  ROUND(
    COUNT(DISTINCT user_id) FILTER (
      WHERE user_id IN (
        SELECT user_id FROM daily_quests d2
        WHERE d2.quest_date = daily_quests.quest_date
        GROUP BY user_id
        HAVING COUNT(*) FILTER (WHERE completed) = 3
      )
    ) * 100.0
    / NULLIF(COUNT(DISTINCT user_id), 0),
    2
  ) AS full_clear_pct
FROM daily_quests
WHERE quest_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY quest_date
ORDER BY quest_date DESC;

-- ─── Claim timing (how long between completion and claim) ────────────────
SELECT
  quest_type,
  COUNT(*) AS claimed_count,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (claimed_at - completed_at)) / 60.0),
    1
  ) AS avg_minutes_to_claim
FROM daily_quests
WHERE claimed
  AND completed_at IS NOT NULL
  AND claimed_at IS NOT NULL
  AND quest_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY quest_type;

-- ─── Bottleneck: which quest completes last? ─────────────────────────────
WITH last_completion AS (
  SELECT
    user_id,
    quest_date,
    MAX(completed_at) AS last_completed_at
  FROM daily_quests
  WHERE completed
    AND quest_date >= CURRENT_DATE - INTERVAL '3 days'
  GROUP BY user_id, quest_date
)
SELECT
  dq.quest_type,
  COUNT(*) AS times_last
FROM daily_quests dq
JOIN last_completion lc
  ON dq.user_id = lc.user_id
 AND dq.quest_date = lc.quest_date
 AND dq.completed_at = lc.last_completed_at
GROUP BY dq.quest_type
ORDER BY times_last DESC;
