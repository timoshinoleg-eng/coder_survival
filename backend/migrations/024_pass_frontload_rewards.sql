INSERT INTO pass_rewards (pass_id, level, required_xp, free_reward_payload, premium_reward_payload)
SELECT id, 1, 200, '{"energy":25}'::jsonb, '{"energy":50,"stars":10}'::jsonb
FROM sprint_passes WHERE is_active = true
ON CONFLICT (pass_id, level) DO UPDATE SET
  free_reward_payload = EXCLUDED.free_reward_payload,
  premium_reward_payload = EXCLUDED.premium_reward_payload;

INSERT INTO pass_rewards (pass_id, level, required_xp, free_reward_payload, premium_reward_payload)
SELECT id, 2, 215, '{"stars":5}'::jsonb, '{"stars":15,"skinFragment":1}'::jsonb
FROM sprint_passes WHERE is_active = true
ON CONFLICT (pass_id, level) DO UPDATE SET
  free_reward_payload = EXCLUDED.free_reward_payload,
  premium_reward_payload = EXCLUDED.premium_reward_payload;

INSERT INTO pass_rewards (pass_id, level, required_xp, free_reward_payload, premium_reward_payload)
SELECT id, 3, 230, '{"commitBoostPercent":5,"durationHours":24}'::jsonb, '{"commitBoostPercent":10,"durationHours":24}'::jsonb
FROM sprint_passes WHERE is_active = true
ON CONFLICT (pass_id, level) DO UPDATE SET
  free_reward_payload = EXCLUDED.free_reward_payload,
  premium_reward_payload = EXCLUDED.premium_reward_payload;
