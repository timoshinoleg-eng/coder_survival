-- Coder Survival — Sprint Pass Observation
-- Uses: player_passes, pass_claims, sprint_passes (config), audit_logs

-- ─── Current level distribution ──────────────────────────────────────────
SELECT
  current_level,
  COUNT(*) AS players,
  ROUND(AVG(current_xp), 0) AS avg_xp,
  COUNT(*) FILTER (WHERE is_premium) AS premium_players,
  ROUND(
    COUNT(*) FILTER (WHERE is_premium) * 100.0 / NULLIF(COUNT(*), 0),
    2
  ) AS premium_pct
FROM player_passes
GROUP BY current_level
ORDER BY current_level;

-- ─── Level advancement velocity (XP gained per day, proxy) ───────────────
-- Uses pass_claims as a proxy for "reached level N on date"
WITH level_first_claim AS (
  SELECT
    user_id,
    level,
    MIN(claimed_at)::date AS reached_on
  FROM pass_claims
  GROUP BY user_id, level
)
SELECT
  level,
  COUNT(*) AS players_who_reached,
  AVG(
    EXTRACT(EPOCH FROM (reached_on - MIN(reached_on))) / 86400.0
  ) AS avg_days_from_first
FROM level_first_claim
GROUP BY level
ORDER BY level;

-- ─── Unclaimed rewards sitting on the table ──────────────────────────────
SELECT
  sp.level,
  sp.required_xp,
  COUNT(*) AS players_eligible,
  COUNT(*) FILTER (WHERE pp.is_premium) AS premium_eligible
FROM player_passes pp
JOIN sprint_passes sp
  ON sp.level > pp.current_level
  OR (sp.level = pp.current_level AND sp.required_xp > pp.current_xp)
-- This is approximate; a precise query needs the full XP-to-level mapping.
-- Simpler: count claims vs eligible levels.
GROUP BY sp.level, sp.required_xp
ORDER BY sp.level;

-- ─── Premium purchase timing (level at time of unlock) ───────────────────
SELECT
  al.details->>'userId' AS user_id,
  al.created_at,
  pp.current_level AS level_at_unlock,
  pp.current_xp AS xp_at_unlock
FROM audit_logs al
LEFT JOIN player_passes pp
  ON pp.user_id = (al.details->>'userId')::int
WHERE al.action = 'pass_premium_unlock'
ORDER BY al.created_at DESC
LIMIT 50;
