-- Coder Survival — Phase 2 Social / Events Metrics
-- Requires Phase 2 schema from backend/migrations/013_phase2_schema.sql.
-- These queries are safe to keep in repo before migration lands; run only after Phase 2 schema is applied.

-- 1. Team battle participation rate
SELECT
  s.season_number,
  COUNT(DISTINCT tbc.user_id) AS participating_users,
  COUNT(DISTINCT tbc.team_id) AS participating_teams,
  ROUND(AVG(tbc.commits_contributed), 2) AS avg_contribution,
  COUNT(DISTINCT tbc.user_id) FILTER (WHERE tbc.commits_contributed >= 1) AS users_with_progress
FROM team_battle_seasons s
LEFT JOIN team_battle_contributions tbc ON tbc.season_id = s.id
GROUP BY s.season_number
ORDER BY s.season_number DESC;

-- 2. Skin equip rate by rarity
SELECT
  sd.rarity,
  COUNT(*) AS unlocked_total,
  COUNT(*) FILTER (WHERE us.equipped = TRUE) AS equipped_total,
  ROUND(COUNT(*) FILTER (WHERE us.equipped = TRUE) * 100.0 / NULLIF(COUNT(*), 0), 2) AS equip_rate_pct
FROM user_skins us
JOIN skin_definitions sd ON sd.skin_id = us.skin_id
GROUP BY sd.rarity
ORDER BY sd.rarity;

-- 3. Meme shares per day (expects audit_logs.action = 'meme_share')
SELECT
  DATE(created_at) AS day,
  COUNT(*) AS meme_share_count,
  COUNT(DISTINCT user_id) AS unique_sharers
FROM audit_logs
WHERE action = 'meme_share'
GROUP BY DATE(created_at)
ORDER BY day DESC;

-- 4. Crunch Time DAU lift
WITH dau AS (
  SELECT
    DATE(s.started_at) AS day,
    COUNT(DISTINCT s.user_id) AS dau,
    MAX(CASE WHEN cte.id IS NOT NULL THEN 1 ELSE 0 END) AS crunch_active
  FROM sessions s
  LEFT JOIN crunch_time_events cte
    ON s.started_at >= cte.start_date
   AND s.started_at <= cte.end_date
   AND cte.status = 'active'
  GROUP BY DATE(s.started_at)
)
SELECT
  crunch_active,
  ROUND(AVG(dau), 2) AS avg_dau,
  COUNT(*) AS day_count
FROM dau
GROUP BY crunch_active;

-- 5. Referral chain conversion (3+ active friends)
WITH active_referrers AS (
  SELECT
    referrer_id,
    COUNT(*) FILTER (WHERE status IN ('completed', 'rewarded')) AS active_referrals
  FROM referrals
  GROUP BY referrer_id
)
SELECT
  COUNT(*) FILTER (WHERE active_referrals >= 3) AS reached_3,
  COUNT(*) FILTER (WHERE active_referrals >= 5) AS reached_5,
  COUNT(*) FILTER (WHERE active_referrals >= 10) AS reached_10,
  ROUND(COUNT(*) FILTER (WHERE active_referrals >= 3) * 100.0 / NULLIF(COUNT(*), 0), 2) AS reached_3_pct
FROM active_referrers;
