-- Stage 4 balance tuning pass.
-- Align live event/pass/quest economy with the tuned source-of-truth.

UPDATE events
SET target_commits = 650,
    reward_payload = '{"energy": 80, "commitsCurrent": 60, "depressionRelief": 15}'::jsonb
WHERE is_active = TRUE;

WITH tuned_rewards(level, required_xp, free_reward_payload, premium_reward_payload) AS (
  VALUES
    (1, 20, '{"energy": 10}'::jsonb, '{"energy": 20}'::jsonb),
    (2, 20, '{"commitsCurrent": 15}'::jsonb, '{"commitsCurrent": 30}'::jsonb),
    (3, 25, '{"energy": 10}'::jsonb, '{"energy": 20}'::jsonb),
    (4, 25, '{"commitsCurrent": 15}'::jsonb, '{"commitsCurrent": 30, "depressionRelief": 10}'::jsonb),
    (5, 30, '{"energy": 15, "commitsCurrent": 20}'::jsonb, '{"energy": 30, "commitsCurrent": 40}'::jsonb),
    (6, 30, '{"energy": 10}'::jsonb, '{"energy": 20}'::jsonb),
    (7, 35, '{"commitsCurrent": 20}'::jsonb, '{"commitsCurrent": 40}'::jsonb),
    (8, 35, '{"energy": 10}'::jsonb, '{"energy": 20, "depressionRelief": 10}'::jsonb),
    (9, 40, '{"commitsCurrent": 20}'::jsonb, '{"energy": 30}'::jsonb),
    (10, 45, '{"energy": 20, "commitsCurrent": 30}'::jsonb, '{"energy": 40, "commitsCurrent": 50}'::jsonb),
    (11, 45, '{"energy": 10}'::jsonb, '{"energy": 20}'::jsonb),
    (12, 50, '{"commitsCurrent": 20}'::jsonb, '{"commitsCurrent": 45}'::jsonb),
    (13, 50, '{"energy": 15}'::jsonb, '{"energy": 25, "depressionRelief": 10}'::jsonb),
    (14, 55, '{"commitsCurrent": 25}'::jsonb, '{"commitsCurrent": 45}'::jsonb),
    (15, 60, '{"energy": 20, "commitsCurrent": 35}'::jsonb, '{"energy": 50, "commitsCurrent": 60}'::jsonb),
    (16, 60, '{"energy": 15}'::jsonb, '{"energy": 30}'::jsonb),
    (17, 65, '{"commitsCurrent": 25}'::jsonb, '{"commitsCurrent": 50}'::jsonb),
    (18, 70, '{"energy": 20}'::jsonb, '{"energy": 40, "depressionRelief": 15}'::jsonb),
    (19, 75, '{"commitsCurrent": 30}'::jsonb, '{"commitsCurrent": 60}'::jsonb),
    (20, 80, '{"energy": 30, "commitsCurrent": 50}'::jsonb, '{"energy": 80, "commitsCurrent": 100, "depressionRelief": 25}'::jsonb)
)
UPDATE pass_rewards pr
SET required_xp = tuned.required_xp,
    free_reward_payload = tuned.free_reward_payload,
    premium_reward_payload = tuned.premium_reward_payload
FROM tuned_rewards tuned,
     sprint_passes sp
WHERE pr.pass_id = sp.id
  AND sp.is_active = TRUE
  AND pr.level = tuned.level;
