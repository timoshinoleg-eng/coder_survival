-- Migration 050: Coffee Coin cosmetic sink (no gameplay bonuses)
-- Earned Coffee Coins can unlock this visual-only skin; it must never modify taps,
-- energy recovery, leaderboard scoring, or anti-cheat state.

INSERT INTO skin_definitions (skin_id, name, description, rarity, unlock_type, unlock_payload)
VALUES (
  'coffee_debugger',
  'Кофейный дебаггер',
  'Чистая косметика: кофе выглядит увереннее, баги — не слабее.',
  'rare',
  'coffee_coin',
  '{"coffeeCoins": 3}'::jsonb
)
ON CONFLICT (skin_id) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    rarity = EXCLUDED.rarity,
    unlock_type = EXCLUDED.unlock_type,
    unlock_payload = EXCLUDED.unlock_payload;
