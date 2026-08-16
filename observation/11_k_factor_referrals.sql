-- 11_k_factor_referrals.sql — viral loop health by week.
-- activation = the invited user reached the anti-farm threshold (20 commits),
-- which is also the referral bind condition; K = activated invites per inviter.

WITH invites AS (
  SELECT
    r.referrer_id,
    date_trunc('week', r.created_at) AS invite_week,
    COUNT(*) AS invited,
    COUNT(*) FILTER (
      WHERE COALESCE(p.commits_total, 0) >= 20
    ) AS invited_activated
  FROM referrals r
  JOIN users invited ON invited.id = r.referred_id
  LEFT JOIN progression p ON p.user_id = r.referred_id
  GROUP BY r.referrer_id, date_trunc('week', r.created_at)
)
SELECT
  invite_week,
  COUNT(DISTINCT referrer_id) AS inviters,
  SUM(invited) AS total_invites,
  SUM(invited_activated) AS activated_invites,
  ROUND(
    1.0 * SUM(invited_activated) / NULLIF(COUNT(DISTINCT referrer_id), 0),
    2
  ) AS k_factor_activated_per_inviter
FROM invites
GROUP BY invite_week
ORDER BY invite_week DESC
LIMIT 12;
