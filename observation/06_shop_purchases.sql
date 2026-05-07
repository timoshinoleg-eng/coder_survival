-- Coder Survival — Shop & Purchase Observation
-- Uses: purchases, star_payments, audit_logs

-- ─── Purchase status funnel ──────────────────────────────────────────────
SELECT
  item_type,
  status,
  COUNT(*) AS count,
  SUM(stars_amount) AS total_stars
FROM purchases
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY item_type, status
ORDER BY item_type, status;

-- ─── Completed purchases by day ──────────────────────────────────────────
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

-- ─── Revenue per user (paying users only) ────────────────────────────────
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

-- ─── Conversion from purchase intent to completion ───────────────────────
-- This is a proxy: counts status transitions. A proper funnel needs
-- `purchase_attempt` audit log (not yet implemented).
SELECT
  DATE(created_at) AS day,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'completed') * 100.0
    / NULLIF(COUNT(*), 0),
    2
  ) AS completion_pct
FROM purchases
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY day DESC;
