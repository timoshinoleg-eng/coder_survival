-- Migration 062: reconcile production Sprint Pass to the 20-level runtime contract.
--
-- 052_season_pass.sql historically seeded 50 levels. The runtime contract is now
-- 20 levels, so an already-migrated production database needs an explicit forward
-- migration; changing 052 alone would not affect databases that already ran it.
--
-- Preserve historical claim rows/reward audit history. Only the active pass
-- configuration and player progression cursor are reconciled.

WITH level_curve(level, required_xp) AS (VALUES
  (1, 20),
  (2, 20),
  (3, 25),
  (4, 25),
  (5, 30),
  (6, 30),
  (7, 35),
  (8, 35),
  (9, 40),
  (10, 45),
  (11, 45),
  (12, 50),
  (13, 50),
  (14, 55),
  (15, 60),
  (16, 60),
  (17, 65),
  (18, 70),
  (19, 75),
  (20, 80)
), active_passes AS (
  SELECT id
  FROM sprint_passes
  WHERE is_active = TRUE
)
UPDATE pass_rewards pr
SET required_xp = curve.required_xp
FROM level_curve curve, active_passes ap
WHERE pr.pass_id = ap.id
  AND pr.level = curve.level;

WITH active_passes AS (
  SELECT id
  FROM sprint_passes
  WHERE is_active = TRUE
)
DELETE FROM pass_rewards pr
USING active_passes ap
WHERE pr.pass_id = ap.id
  AND pr.level > 20;

-- Defensive repair for accounts that may have advanced to or above the new cap
-- before this migration. Rewards already claimed remain recorded in pass_claims;
-- we do not attempt to reverse grants. Level 20 is terminal, so it must not retain
-- a partial XP cursor toward a now-nonexistent level 21.
WITH active_passes AS (
  SELECT id
  FROM sprint_passes
  WHERE is_active = TRUE
)
UPDATE player_passes pp
SET current_level = 20,
    current_xp = 0
FROM active_passes ap
WHERE pp.pass_id = ap.id
  AND pp.current_level >= 20;
