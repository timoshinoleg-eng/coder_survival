-- Coder Survival — Context Offer Metrics
-- Uses: offer_impressions (007), offer_cooldowns, audit_logs
-- Note: offer_actions (click-through to shop) are NOT yet logged in backend.
--       CTR is approximated as (purchases of offer-matching items) / impressions.

-- ─── Impressions by type (last 7 days) ───────────────────────────────────
SELECT
  offer_type,
  COUNT(*) AS impressions,
  COUNT(DISTINCT user_id) AS unique_users
FROM offer_impressions
WHERE shown_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY offer_type
ORDER BY impressions DESC;

-- ─── Dismiss rate by offer type ──────────────────────────────────────────
-- Dismiss = audit_logs.action = 'offer_dismiss' within 5 min of impression
WITH impressions AS (
  SELECT
    user_id,
    offer_type,
    shown_at
  FROM offer_impressions
  WHERE shown_at >= CURRENT_DATE - INTERVAL '7 days'
),
dismisses AS (
  SELECT
    user_id,
    created_at,
    details->>'offerType' AS offer_type
  FROM audit_logs
  WHERE action = 'offer_dismiss'
    AND created_at >= CURRENT_DATE - INTERVAL '7 days'
)
SELECT
  i.offer_type,
  COUNT(DISTINCT i.user_id) AS impression_users,
  COUNT(DISTINCT d.user_id) AS dismiss_users,
  ROUND(
    COUNT(DISTINCT d.user_id) * 100.0 / NULLIF(COUNT(DISTINCT i.user_id), 0),
    2
  ) AS dismiss_rate_pct
FROM impressions i
LEFT JOIN dismisses d
  ON i.user_id = d.user_id
 AND i.offer_type = d.offer_type
 AND d.created_at BETWEEN i.shown_at AND i.shown_at + INTERVAL '5 minutes'
GROUP BY i.offer_type
ORDER BY i.offer_type;

-- ─── Offer-to-purchase proxy conversion ──────────────────────────────────
-- Maps offer_type -> shop item_id, counts purchases within 10 min of impression.
-- Requires purchase intent audit log for accuracy; this is a lower-bound proxy.
WITH offer_map(offer_type, item_id) AS (
  VALUES ('low_energy', 'energy_refill'),
         ('high_stress', 'depression_cure'),
         ('near_rank', 'tier_boost')
),
impressions AS (
  SELECT
    user_id,
    offer_type,
    shown_at
  FROM offer_impressions
  WHERE shown_at >= CURRENT_DATE - INTERVAL '7 days'
),
purchases AS (
  SELECT
    user_id,
    item_type,
    created_at
  FROM purchases
  WHERE status = 'completed'
    AND created_at >= CURRENT_DATE - INTERVAL '7 days'
)
SELECT
  om.offer_type,
  COUNT(DISTINCT i.user_id) AS impressions,
  COUNT(DISTINCT p.user_id) AS proxy_conversions,
  ROUND(
    COUNT(DISTINCT p.user_id) * 100.0 / NULLIF(COUNT(DISTINCT i.user_id), 0),
    2
  ) AS proxy_ctr_pct
FROM offer_map om
LEFT JOIN impressions i ON i.offer_type = om.offer_type
LEFT JOIN purchases p
  ON p.user_id = i.user_id
 AND p.item_type = om.item_id
 AND p.created_at BETWEEN i.shown_at AND i.shown_at + INTERVAL '10 minutes'
GROUP BY om.offer_type
ORDER BY om.offer_type;

-- ─── Offer fatigue: repeat impressions per user per day ──────────────────
SELECT
  DATE(shown_at) AS day,
  offer_type,
  ROUND(AVG(cnt), 1) AS avg_impressions_per_user,
  MAX(cnt) AS max_impressions_single_user
FROM (
  SELECT
    user_id,
    offer_type,
    DATE(shown_at) AS shown_at,
    COUNT(*) AS cnt
  FROM offer_impressions
  WHERE shown_at >= CURRENT_DATE - INTERVAL '7 days'
  GROUP BY user_id, offer_type, DATE(shown_at)
) sub
GROUP BY DATE(shown_at), offer_type
ORDER BY day DESC, offer_type;
