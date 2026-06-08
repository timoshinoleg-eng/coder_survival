-- Migration 052: Season Pass v2 — 50 levels, Premium track, season metadata

-- 1. Add season theme to sprint_passes (season metadata)
ALTER TABLE sprint_passes
  ADD COLUMN IF NOT EXISTS theme VARCHAR(64) DEFAULT 'default';

-- 2. Add avatar_frames storage to progression for pass rewards
ALTER TABLE progression
  ADD COLUMN IF NOT EXISTS avatar_frames JSONB DEFAULT '[]'::jsonb;

-- 3. Add skin_fragments inventory storage to progression
ALTER TABLE progression
  ADD COLUMN IF NOT EXISTS skin_fragments JSONB DEFAULT '{}'::jsonb;

-- 4. Update active season with a theme
UPDATE sprint_passes
  SET theme = 'neon_code'
  WHERE is_active = TRUE;

-- 5. Seed / upsert 50 level rewards for the active season
-- XP curve: 1-10=100, 11-20=150, 21-30=200, 31-40=250, 41-50=300 (total 10,000)
WITH season AS (
  SELECT id FROM sprint_passes WHERE is_active = TRUE LIMIT 1
),
rewards(level, required_xp, free_reward, premium_reward) AS (VALUES
  (1,  100, '{"energy": 15}'::jsonb,                                 '{"energy": 30, "commitsCurrent": 10}'::jsonb),
  (2,  100, '{"energy": 15}'::jsonb,                                 '{"energy": 30, "commitsCurrent": 10}'::jsonb),
  (3,  100, '{"commitsCurrent": 15}'::jsonb,                         '{"energy": 40, "commitsCurrent": 15}'::jsonb),
  (4,  100, '{"energy": 20}'::jsonb,                                 '{"energy": 40, "commitsCurrent": 20}'::jsonb),
  (5,  100, '{"energy": 25, "commitsCurrent": 20}'::jsonb,          '{"energy": 50, "commitsCurrent": 40, "skinFragment": "pass_common_1"}'::jsonb),
  (6,  150, '{"energy": 20}'::jsonb,                                 '{"energy": 50, "depressionRelief": 5}'::jsonb),
  (7,  150, '{"commitsCurrent": 20}'::jsonb,                         '{"energy": 60, "commitsCurrent": 30, "booster": "espresso"}'::jsonb),
  (8,  150, '{"energy": 20}'::jsonb,                                 '{"energy": 60, "commitsCurrent": 30}'::jsonb),
  (9,  150, '{"commitsCurrent": 25}'::jsonb,                         '{"energy": 70, "depressionRelief": 5}'::jsonb),
  (10, 150, '{"energy": 30, "stars": 5}'::jsonb,                    '{"energy": 80, "stars": 15, "skin": "pass_junior_hoodie"}'::jsonb),
  (11, 200, '{"energy": 25}'::jsonb,                                 '{"energy": 70, "commitsCurrent": 40}'::jsonb),
  (12, 200, '{"commitsCurrent": 30}'::jsonb,                         '{"energy": 70, "commitsCurrent": 40}'::jsonb),
  (13, 200, '{"energy": 25}'::jsonb,                                 '{"energy": 80, "depressionRelief": 10}'::jsonb),
  (14, 200, '{"commitsCurrent": 30}'::jsonb,                         '{"energy": 80, "commitsCurrent": 50, "booster": "red_bull_mode"}'::jsonb),
  (15, 200, '{"energy": 35, "skinFragment": "pass_rare_1"}'::jsonb, '{"energy": 100, "avatarFrame": "gold_coder", "stars": 10}'::jsonb),
  (16, 250, '{"energy": 30}'::jsonb,                                 '{"energy": 90, "commitsCurrent": 60}'::jsonb),
  (17, 250, '{"commitsCurrent": 35}'::jsonb,                         '{"energy": 90, "commitsCurrent": 60}'::jsonb),
  (18, 250, '{"energy": 30}'::jsonb,                                 '{"energy": 100, "depressionRelief": 15}'::jsonb),
  (19, 250, '{"commitsCurrent": 35}'::jsonb,                         '{"energy": 100, "commitsCurrent": 70}'::jsonb),
  (20, 250, '{"energy": 40, "stars": 10}'::jsonb,                   '{"energy": 120, "stars": 25, "skin": "pass_middle_blazer", "muCurrency": 1}'::jsonb),
  (21, 300, '{"energy": 35}'::jsonb,                                 '{"energy": 100, "commitsCurrent": 80}'::jsonb),
  (22, 300, '{"commitsCurrent": 40}'::jsonb,                         '{"energy": 100, "commitsCurrent": 80}'::jsonb),
  (23, 300, '{"energy": 35}'::jsonb,                                 '{"energy": 110, "depressionRelief": 15}'::jsonb),
  (24, 300, '{"commitsCurrent": 40}'::jsonb,                         '{"energy": 110, "commitsCurrent": 90}'::jsonb),
  (25, 300, '{"energy": 45, "stars": 10}'::jsonb,                   '{"energy": 130, "avatarFrame": "sprint_master", "stars": 15}'::jsonb),
  (26, 350, '{"energy": 40}'::jsonb,                                 '{"energy": 120, "commitsCurrent": 100}'::jsonb),
  (27, 350, '{"commitsCurrent": 45}'::jsonb,                         '{"energy": 120, "commitsCurrent": 100}'::jsonb),
  (28, 350, '{"energy": 40}'::jsonb,                                 '{"energy": 130, "depressionRelief": 20, "booster": "stackoverflow_premium"}'::jsonb),
  (29, 350, '{"commitsCurrent": 45}'::jsonb,                         '{"energy": 130, "commitsCurrent": 100}'::jsonb),
  (30, 350, '{"energy": 50, "stars": 15}'::jsonb,                   '{"energy": 150, "stars": 30, "skin": "pass_senior_cape"}'::jsonb),
  (31, 400, '{"energy": 45}'::jsonb,                                 '{"energy": 140, "commitsCurrent": 110}'::jsonb),
  (32, 400, '{"commitsCurrent": 50}'::jsonb,                         '{"energy": 140, "commitsCurrent": 110}'::jsonb),
  (33, 400, '{"energy": 45}'::jsonb,                                 '{"energy": 150, "depressionRelief": 20}'::jsonb),
  (34, 400, '{"commitsCurrent": 50}'::jsonb,                         '{"energy": 150, "commitsCurrent": 120}'::jsonb),
  (35, 400, '{"energy": 55, "skinFragment": "pass_epic_1"}'::jsonb, '{"energy": 170, "avatarFrame": "bug_hunter", "muCurrency": 2, "stars": 20}'::jsonb),
  (36, 450, '{"energy": 50}'::jsonb,                                 '{"energy": 160, "commitsCurrent": 130}'::jsonb),
  (37, 450, '{"commitsCurrent": 55}'::jsonb,                         '{"energy": 160, "commitsCurrent": 130}'::jsonb),
  (38, 450, '{"energy": 50}'::jsonb,                                 '{"energy": 170, "depressionRelief": 25}'::jsonb),
  (39, 450, '{"commitsCurrent": 55}'::jsonb,                         '{"energy": 170, "commitsCurrent": 140}'::jsonb),
  (40, 450, '{"energy": 60, "stars": 20}'::jsonb,                   '{"energy": 200, "stars": 40, "skin": "pass_lead_armor"}'::jsonb),
  (41, 500, '{"energy": 55}'::jsonb,                                 '{"energy": 180, "commitsCurrent": 150}'::jsonb),
  (42, 500, '{"commitsCurrent": 60}'::jsonb,                         '{"energy": 180, "commitsCurrent": 150, "booster": "no_ads_pass"}'::jsonb),
  (43, 500, '{"energy": 55}'::jsonb,                                 '{"energy": 190, "depressionRelief": 25}'::jsonb),
  (44, 500, '{"commitsCurrent": 60}'::jsonb,                         '{"energy": 190, "commitsCurrent": 160}'::jsonb),
  (45, 500, '{"energy": 65, "stars": 25}'::jsonb,                   '{"energy": 220, "avatarFrame": "cto_glow", "muCurrency": 3, "stars": 25}'::jsonb),
  (46, 550, '{"energy": 60}'::jsonb,                                 '{"energy": 200, "commitsCurrent": 170}'::jsonb),
  (47, 550, '{"commitsCurrent": 65}'::jsonb,                         '{"energy": 200, "commitsCurrent": 170}'::jsonb),
  (48, 550, '{"energy": 60, "depressionRelief": 10}'::jsonb,       '{"energy": 220, "depressionRelief": 30}'::jsonb),
  (49, 550, '{"commitsCurrent": 65, "depressionRelief": 10}'::jsonb, '{"energy": 220, "commitsCurrent": 180}'::jsonb),
  (50, 550, '{"energy": 100, "stars": 30, "skin": "season_hero"}'::jsonb, '{"energy": 300, "stars": 100, "skin": "legendary_architect", "muCurrency": 5, "title": "Season Legend"}'::jsonb)
)
INSERT INTO pass_rewards (pass_id, level, required_xp, free_reward_payload, premium_reward_payload)
SELECT s.id, r.level, r.required_xp, r.free_reward, r.premium_reward
FROM season s
CROSS JOIN rewards r
ON CONFLICT (pass_id, level) DO UPDATE SET
  required_xp = EXCLUDED.required_xp,
  free_reward_payload = EXCLUDED.free_reward_payload,
  premium_reward_payload = EXCLUDED.premium_reward_payload;

-- 6. Ensure active season end_date is at least 30 days from start_date
UPDATE sprint_passes
  SET end_date = GREATEST(end_date, start_date + INTERVAL '29 days')
  WHERE is_active = TRUE;
