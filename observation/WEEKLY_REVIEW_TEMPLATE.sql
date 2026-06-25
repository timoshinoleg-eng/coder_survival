-- ============================================
-- Weekly Balance Review — Consolidated SQL Template
-- Run against production PostgreSQL
-- All queries are SELECT-only (safe for production)
-- Adjust INTERVAL '7 days' for custom date ranges
-- ============================================


-- ============================================
-- Section 1: Retention & Engagement
-- Source: 01_dau_retention.sql
-- ============================================

-- 1a. DAU by day (last 14 days)
SELECT
  DATE(started_at) AS day,
  COUNT(DISTINCT user_id) AS dau,
  COUNT(*) AS session_count,
  ROUND(AVG(taps_count), 1) AS avg_taps_per_session
FROM sessions
WHERE started_at >= CURRENT_DATE - INTERVAL '14 days'
GROUP BY DATE(started_at)
ORDER BY day DESC;

-- 1b. Average DAU for the week
SELECT 'avg_weekly_dau' AS metric,
  ROUND(AVG(dau), 0) AS value
FROM (
  SELECT DATE(started_at) AS day, COUNT(DISTINCT user_id) AS dau
  FROM sessions
  WHERE started_at >= CURRENT_DATE - INTERVAL '7 days'
  GROUP BY DATE(started_at)
) daily;

-- 1c. D1 Retention cohort (last 7 days)
WITH cohorts AS (
  SELECT id AS user_id, DATE(created_at) AS cohort_date
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
    COUNT(DISTINCT d1.user_id) * 100.0 / NULLIF(COUNT(DISTINCT c.user_id), 0), 2
  ) AS d1_retention_pct
FROM cohorts c
LEFT JOIN d1_active d1 ON d1.user_id = c.user_id
GROUP BY c.cohort_date
ORDER BY c.cohort_date DESC;

-- 1d. Average D1 retention across the week
SELECT 'avg_d1_retention' AS metric,
  ROUND(AVG(d1_retention_pct), 2) AS value
FROM (
  WITH cohorts AS (
    SELECT id AS user_id, DATE(created_at) AS cohort_date
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
    ROUND(
      COUNT(DISTINCT d1.user_id) * 100.0 / NULLIF(COUNT(DISTINCT c.user_id), 0), 2
    ) AS d1_retention_pct
  FROM cohorts c
  LEFT JOIN d1_active d1 ON d1.user_id = c.user_id
  GROUP BY c.cohort_date
) daily;

-- 1e. Sticky factor (yesterday DAU / total users)
SELECT 'sticky_factor' AS metric,
  ROUND(
    COUNT(DISTINCT user_id) FILTER (WHERE DATE(started_at) = CURRENT_DATE - INTERVAL '1 day') * 100.0
    / NULLIF((SELECT COUNT(*) FROM users), 0), 2
  ) AS value
FROM sessions;

-- 1f. Average taps per session this week
SELECT 'avg_taps_per_session' AS metric,
  ROUND(AVG(taps_count), 1) AS value
FROM sessions
WHERE started_at >= CURRENT_DATE - INTERVAL '7 days';


-- ============================================
-- Section 2: Economy Health
-- Source: 07_economy_health.sql, 08_stress_cohort_ab.sql
-- ============================================

-- 2a. Energy & depression snapshot
WITH energy_dist AS (
  SELECT
    ROUND(AVG(p.energy), 1) AS avg_energy,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.energy) AS median_energy,
    COUNT(*) FILTER (WHERE p.energy <= pl.max_energy * 0.25) AS low_energy_users
  FROM progression p
  JOIN player_levels pl ON pl.user_id = p.user_id
),
depression_dist AS (
  SELECT
    ROUND(AVG(p.depression_level), 2) AS avg_depression,
    COUNT(*) FILTER (WHERE p.depression_level >= 20) AS high_stress_users,
    ROUND(
      COUNT(*) FILTER (WHERE p.depression_level >= 20) * 100.0
      / NULLIF(COUNT(*), 0), 2
    ) AS high_stress_pct
  FROM progression p
)
SELECT
  (SELECT avg_energy FROM energy_dist) AS avg_energy,
  (SELECT median_energy FROM energy_dist) AS median_energy,
  (SELECT low_energy_users FROM energy_dist) AS low_energy_users,
  (SELECT avg_depression FROM depression_dist) AS avg_depression,
  (SELECT high_stress_users FROM depression_dist) AS high_stress_users,
  (SELECT high_stress_pct FROM depression_dist) AS high_stress_pct;

-- 2b. Economy health one-liner
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
  (SELECT avg_energy FROM energy_dist) AS avg_energy,
  (SELECT median_energy FROM energy_dist) AS median_energy,
  (SELECT low_energy_users FROM energy_dist) AS low_energy_users,
  (SELECT avg_depression FROM depression_dist) AS avg_depression,
  (SELECT high_stress_users FROM depression_dist) AS high_stress_users,
  (SELECT avg_total_commits FROM commit_dist) AS avg_total_commits,
  (SELECT ROUND(completed_any * 100.0 / NULLIF(total_users, 0), 2) FROM today_quests) AS quest_any_completion_pct;

-- 2c. Energy starvation rate (proxy: taps >= commits_earned + 10)
SELECT 'energy_starvation_rate' AS metric,
  ROUND(
    COUNT(DISTINCT user_id) FILTER (
      WHERE taps_count >= commits_earned + 10
    ) * 100.0 / NULLIF(COUNT(DISTINCT user_id), 0), 2
  ) AS value
FROM sessions
WHERE started_at >= CURRENT_DATE - INTERVAL '7 days';

-- 2d. Rank distribution
SELECT rank, COUNT(*) AS players
FROM player_levels
GROUP BY rank
ORDER BY rank;


-- ============================================
-- Section 3: Monetization
-- Source: 06_shop_purchases.sql
-- ============================================

-- 3a. Purchase status funnel
SELECT
  item_type,
  status,
  COUNT(*) AS count,
  SUM(stars_amount) AS total_stars
FROM purchases
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY item_type, status
ORDER BY item_type, status;

-- 3b. Completed purchases by day
SELECT
  DATE(created_at) AS day,
  item_type,
  COUNT(*) AS completed,
  SUM(stars_amount) AS stars_revenue
FROM purchases
WHERE status = 'completed'
  AND created_at >= CURRENT_DATE - INTERVAL '14 days'
GROUP BY DATE(created_at), item_type
ORDER BY day DESC, item_type;

-- 3c. Revenue summary
SELECT
  'revenue_summary' AS metric,
  SUM(stars_amount) AS total_revenue,
  COUNT(DISTINCT user_id) AS paying_users,
  COUNT(*) AS total_completed_purchases
FROM purchases
WHERE status = 'completed'
  AND created_at >= CURRENT_DATE - INTERVAL '7 days';

-- 3d. ARPPU (average revenue per paying user)
WITH weekly_paying AS (
  SELECT user_id, SUM(stars_amount) AS weekly_stars
  FROM purchases
  WHERE status = 'completed'
    AND created_at >= CURRENT_DATE - INTERVAL '7 days'
  GROUP BY user_id
)
SELECT
  'arppu' AS metric,
  ROUND(AVG(weekly_stars), 1) AS value
FROM weekly_paying;

-- 3e. Revenue per user (lifetime paying stats)
WITH paying_users AS (
  SELECT
    user_id,
    COUNT(*) AS purchase_count,
    SUM(stars_amount) AS lifetime_stars
  FROM purchases
  WHERE status = 'completed'
  GROUP BY user_id
  HAVING COUNT(*) > 0
)
SELECT
  COUNT(*) AS paying_users,
  ROUND(AVG(purchase_count), 1) AS avg_purchases,
  ROUND(AVG(lifetime_stars), 1) AS avg_lifetime_stars,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY lifetime_stars) AS median_lifetime_stars
FROM paying_users;

-- 3f. Purchase completion rate (intent to confirm)
SELECT
  'purchase_completion_rate' AS metric,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'completed') * 100.0
    / NULLIF(COUNT(*), 0), 2
  ) AS value
FROM purchases
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days';


-- ============================================
-- Section 4: Offers
-- Source: 03_context_offers.sql
-- ============================================

-- 4a. Impressions by type
SELECT
  offer_type,
  COUNT(*) AS impressions,
  COUNT(DISTINCT user_id) AS unique_users
FROM offer_impressions
WHERE shown_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY offer_type
ORDER BY impressions DESC;

-- 4b. Total impressions
SELECT 'total_offer_impressions' AS metric,
  SUM(impressions) AS value
FROM (
  SELECT COUNT(*) AS impressions
  FROM offer_impressions
  WHERE shown_at >= CURRENT_DATE - INTERVAL '7 days'
) t;

-- 4c. Dismiss rate by offer type
WITH impressions AS (
  SELECT user_id, offer_type, shown_at
  FROM offer_impressions
  WHERE shown_at >= CURRENT_DATE - INTERVAL '7 days'
),
dismisses AS (
  SELECT user_id, created_at, details->>'offerType' AS offer_type
  FROM audit_logs
  WHERE action = 'offer_dismiss'
    AND created_at >= CURRENT_DATE - INTERVAL '7 days'
)
SELECT
  i.offer_type,
  COUNT(DISTINCT i.user_id) AS impression_users,
  COUNT(DISTINCT d.user_id) AS dismiss_users,
  ROUND(
    COUNT(DISTINCT d.user_id) * 100.0 / NULLIF(COUNT(DISTINCT i.user_id), 0), 2
  ) AS dismiss_rate_pct
FROM impressions i
LEFT JOIN dismisses d
  ON i.user_id = d.user_id
 AND i.offer_type = d.offer_type
 AND d.created_at BETWEEN i.shown_at AND i.shown_at + INTERVAL '5 minutes'
GROUP BY i.offer_type
ORDER BY i.offer_type;

-- 4d. Average dismiss rate across all offers
SELECT 'avg_dismiss_rate' AS metric,
  ROUND(AVG(dismiss_rate_pct), 2) AS value
FROM (
  WITH impressions AS (
    SELECT user_id, offer_type, shown_at
    FROM offer_impressions
    WHERE shown_at >= CURRENT_DATE - INTERVAL '7 days'
  ),
  dismisses AS (
    SELECT user_id, created_at, details->>'offerType' AS offer_type
    FROM audit_logs
    WHERE action = 'offer_dismiss'
      AND created_at >= CURRENT_DATE - INTERVAL '7 days'
  )
  SELECT
    ROUND(
      COUNT(DISTINCT d.user_id) * 100.0 / NULLIF(COUNT(DISTINCT i.user_id), 0), 2
    ) AS dismiss_rate_pct
  FROM impressions i
  LEFT JOIN dismisses d
    ON i.user_id = d.user_id
   AND i.offer_type = d.offer_type
   AND d.created_at BETWEEN i.shown_at AND i.shown_at + INTERVAL '5 minutes'
  GROUP BY i.offer_type
) rates;

-- 4e. Offer-to-purchase proxy CTR
WITH offer_map(offer_type, item_id) AS (
  VALUES ('low_energy', 'energy_refill'),
         ('high_stress', 'depression_cure'),
         ('near_rank', 'tier_boost')
),
impressions AS (
  SELECT user_id, offer_type, shown_at
  FROM offer_impressions
  WHERE shown_at >= CURRENT_DATE - INTERVAL '7 days'
),
purchases AS (
  SELECT user_id, item_type, created_at
  FROM purchases
  WHERE status = 'completed'
    AND created_at >= CURRENT_DATE - INTERVAL '7 days'
)
SELECT
  om.offer_type,
  COUNT(DISTINCT i.user_id) AS impressions,
  COUNT(DISTINCT p.user_id) AS proxy_conversions,
  ROUND(
    COUNT(DISTINCT p.user_id) * 100.0 / NULLIF(COUNT(DISTINCT i.user_id), 0), 2
  ) AS proxy_ctr_pct
FROM offer_map om
LEFT JOIN impressions i ON i.offer_type = om.offer_type
LEFT JOIN purchases p
  ON p.user_id = i.user_id
 AND p.item_type = om.item_id
 AND p.created_at BETWEEN i.shown_at AND i.shown_at + INTERVAL '10 minutes'
GROUP BY om.offer_type
ORDER BY om.offer_type;

-- 4f. Average proxy CTR across offer types
SELECT 'avg_offer_ctr' AS metric,
  ROUND(AVG(proxy_ctr_pct), 2) AS value
FROM (
  WITH offer_map(offer_type, item_id) AS (
    VALUES ('low_energy', 'energy_refill'),
           ('high_stress', 'depression_cure'),
           ('near_rank', 'tier_boost')
  ),
  impressions AS (
    SELECT user_id, offer_type, shown_at
    FROM offer_impressions
    WHERE shown_at >= CURRENT_DATE - INTERVAL '7 days'
  ),
  purchases AS (
    SELECT user_id, item_type, created_at
    FROM purchases
    WHERE status = 'completed'
      AND created_at >= CURRENT_DATE - INTERVAL '7 days'
  )
  SELECT
    ROUND(
      COUNT(DISTINCT p.user_id) * 100.0 / NULLIF(COUNT(DISTINCT i.user_id), 0), 2
    ) AS proxy_ctr_pct
  FROM offer_map om
  LEFT JOIN impressions i ON i.offer_type = om.offer_type
  LEFT JOIN purchases p
    ON p.user_id = i.user_id
   AND p.item_type = om.item_id
   AND p.created_at BETWEEN i.shown_at AND i.shown_at + INTERVAL '10 minutes'
  GROUP BY om.offer_type
) ctrs;

-- 4g. Offer fatigue: avg impressions per user per day
SELECT
  DATE(shown_at) AS day,
  offer_type,
  ROUND(AVG(cnt), 1) AS avg_impressions_per_user,
  MAX(cnt) AS max_impressions_single_user
FROM (
  SELECT
    user_id, offer_type, DATE(shown_at) AS shown_at, COUNT(*) AS cnt
  FROM offer_impressions
  WHERE shown_at >= CURRENT_DATE - INTERVAL '7 days'
  GROUP BY user_id, offer_type, DATE(shown_at)
) sub
GROUP BY DATE(shown_at), offer_type
ORDER BY day DESC, offer_type;


-- ============================================
-- Section 5: Quests & Pass
-- Source: 02_daily_quests.sql, 05_sprint_pass.sql
-- ============================================

-- 5a. Per-quest completion rate (last 7 days)
SELECT
  quest_type,
  target_value,
  COUNT(*) FILTER (WHERE completed) AS completed,
  COUNT(*) AS total,
  ROUND(
    COUNT(*) FILTER (WHERE completed) * 100.0 / NULLIF(COUNT(*), 0), 2
  ) AS completion_pct
FROM daily_quests
WHERE quest_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY quest_type, target_value
ORDER BY quest_type;

-- 5b. Daily full-clear rate
SELECT
  quest_date,
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
    ) * 100.0 / NULLIF(COUNT(DISTINCT user_id), 0), 2
  ) AS full_clear_pct
FROM daily_quests
WHERE quest_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY quest_date
ORDER BY quest_date DESC;

-- 5c. Average full-clear rate for the week
SELECT 'avg_full_clear_rate' AS metric,
  ROUND(AVG(full_clear_pct), 2) AS value
FROM (
  SELECT
    quest_date,
    ROUND(
      COUNT(DISTINCT user_id) FILTER (
        WHERE user_id IN (
          SELECT user_id FROM daily_quests d2
          WHERE d2.quest_date = daily_quests.quest_date
          GROUP BY user_id
          HAVING COUNT(*) FILTER (WHERE completed) = 3
        )
      ) * 100.0 / NULLIF(COUNT(DISTINCT user_id), 0), 2
    ) AS full_clear_pct
  FROM daily_quests
  WHERE quest_date >= CURRENT_DATE - INTERVAL '7 days'
  GROUP BY quest_date
) daily;

-- 5d. Claim timing
SELECT
  quest_type,
  COUNT(*) AS claimed_count,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (claimed_at - completed_at)) / 60.0), 1
  ) AS avg_minutes_to_claim
FROM daily_quests
WHERE claimed
  AND completed_at IS NOT NULL
  AND claimed_at IS NOT NULL
  AND quest_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY quest_type;

-- 5e. Bottleneck: which quest completes last
WITH last_completion AS (
  SELECT user_id, quest_date, MAX(completed_at) AS last_completed_at
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

-- 5f. Sprint pass level distribution
SELECT
  current_level,
  COUNT(*) AS players,
  ROUND(AVG(current_xp), 0) AS avg_xp,
  COUNT(*) FILTER (WHERE is_premium) AS premium_players,
  ROUND(
    COUNT(*) FILTER (WHERE is_premium) * 100.0 / NULLIF(COUNT(*), 0), 2
  ) AS premium_pct
FROM player_passes
GROUP BY current_level
ORDER BY current_level;

-- 5g. Premium conversion rate
SELECT 'premium_conversion_rate' AS metric,
  ROUND(
    COUNT(*) FILTER (WHERE is_premium) * 100.0 / NULLIF(COUNT(*), 0), 2
  ) AS value
FROM player_passes;


-- ============================================
-- Section 6: Events & Social
-- Source: 04_weekly_hackathon.sql, 09_phase2_metrics.sql
-- ============================================

-- 6a. Current hackathon progress
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
    / NULLIF(COUNT(ec.user_id), 0), 2
  ) AS completion_pct,
  ROUND(AVG(ec.commits_contributed), 0) AS avg_commits,
  MAX(ec.commits_contributed) AS max_commits
FROM events e
LEFT JOIN event_contributions ec ON ec.event_id = e.id
WHERE e.end_date >= CURRENT_DATE
GROUP BY e.id, e.type, e.target_commits, e.start_date, e.end_date;

-- 6b. Hackathon completion rate
SELECT 'hackathon_completion_rate' AS metric,
  ROUND(
    COUNT(ec.user_id) FILTER (WHERE ec.claimed) * 100.0
    / NULLIF(COUNT(ec.user_id), 0), 2
  ) AS value
FROM events e
LEFT JOIN event_contributions ec ON ec.event_id = e.id
WHERE e.end_date >= CURRENT_DATE;

-- 6c. Hackathon commit distribution
SELECT
  CASE
    WHEN ec.commits_contributed >= e.target_commits THEN 'reached_target'
    WHEN ec.commits_contributed >= e.target_commits * 0.75 THEN '75_99_pct'
    WHEN ec.commits_contributed >= e.target_commits * 0.50 THEN '50_74_pct'
    WHEN ec.commits_contributed >= e.target_commits * 0.25 THEN '25_49_pct'
    ELSE 'under_25_pct'
  END AS progress_bucket,
  COUNT(*) AS users
FROM event_contributions ec
JOIN events e ON e.id = ec.event_id
WHERE e.end_date >= CURRENT_DATE
GROUP BY 1
ORDER BY MIN(ec.commits_contributed) DESC;

-- 6d. Drop-off proxy: event participants who stalled
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

-- 6e. Team battle participation (Phase 2)
SELECT
  s.season_number,
  COUNT(DISTINCT tbc.user_id) AS participating_users,
  COUNT(DISTINCT tbc.team_id) AS participating_teams,
  ROUND(AVG(tbc.commits_contributed), 2) AS avg_contribution
FROM team_battle_seasons s
LEFT JOIN team_battle_contributions tbc ON tbc.season_id = s.id
GROUP BY s.season_number
ORDER BY s.season_number DESC;

-- 6f. Team average size (Phase 2)
SELECT
  tbc.team_id,
  COUNT(DISTINCT tbc.user_id) AS team_size,
  SUM(tbc.commits_contributed) AS total_commits
FROM team_battle_contributions tbc
JOIN team_battle_seasons s ON s.id = tbc.season_id
WHERE s.season_number = (
  SELECT MAX(season_number) FROM team_battle_seasons
)
GROUP BY tbc.team_id
ORDER BY total_commits DESC;

-- 6g. Referral chain conversion (Phase 2)
WITH active_referrers AS (
  SELECT
    referrer_id,
    COUNT(*) FILTER (WHERE status IN ('completed', 'rewarded')) AS active_referrals
  FROM referrals
  GROUP BY referrer_id
)
SELECT
  COUNT(*) AS total_referrers,
  COUNT(*) FILTER (WHERE active_referrals >= 1) AS reached_1,
  COUNT(*) FILTER (WHERE active_referrals >= 3) AS reached_3,
  COUNT(*) FILTER (WHERE active_referrals >= 5) AS reached_5,
  COUNT(*) FILTER (WHERE active_referrals >= 10) AS reached_10,
  ROUND(COUNT(*) FILTER (WHERE active_referrals >= 3) * 100.0 / NULLIF(COUNT(*), 0), 2) AS reached_3_pct
FROM active_referrers;

-- 6h. Meme shares per day (Phase 2)
SELECT
  DATE(created_at) AS day,
  COUNT(*) AS meme_share_count,
  COUNT(DISTINCT user_id) AS unique_sharers
FROM audit_logs
WHERE action = 'meme_share'
  AND created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY day DESC;
