-- migrations/051_boosters.sql
-- Boosters system: definitions, user inventory, and stars wallet

-- Stars wallet on progression
ALTER TABLE progression
ADD COLUMN IF NOT EXISTS stars INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS git_push_force_mu_boost INTEGER NOT NULL DEFAULT 0;

-- Booster definitions
CREATE TABLE IF NOT EXISTS booster_definitions (
    slug VARCHAR(32) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    stars_cost INTEGER NOT NULL,
    duration_sec INTEGER,
    effect_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    permanent BOOLEAN NOT NULL DEFAULT FALSE
);

-- User boosters inventory / active boosters
CREATE TABLE IF NOT EXISTS user_boosters (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    booster_slug VARCHAR(32) NOT NULL REFERENCES booster_definitions(slug) ON DELETE CASCADE,
    purchased_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    uses_remaining INTEGER,
    UNIQUE(user_id, booster_slug)
);

CREATE INDEX IF NOT EXISTS idx_user_boosters_user_id ON user_boosters(user_id);
CREATE INDEX IF NOT EXISTS idx_user_boosters_expires ON user_boosters(expires_at) WHERE expires_at IS NOT NULL;

-- Seed boosters
INSERT INTO booster_definitions (slug, name, stars_cost, duration_sec, effect_json, permanent)
VALUES
  ('espresso', 'Espresso', 10, 300, '{"depressionDelta": -20, "clickSpeedMult": 2.0}', false),
  ('red_bull_mode', 'Red Bull Mode', 25, 1800, '{"maxEnergyAdd": 3, "infiniteEnergy": true}', false),
  ('git_push_force', 'Git Push --Force', 50, 0, '{"prestigeResetNoLoss": true, "muBoostPercent": 50}', false),
  ('stackoverflow_premium', 'StackOverflow Premium', 75, 0, '{"autoBugFixSec": 10}', false),
  ('dark_theme', 'Dark Theme', 100, NULL, '{"cosmeticSkin": "dark_ide"}', true),
  ('mechanical_keyboard', 'Mechanical Keyboard', 150, NULL, '{"locPerClickMult": 1.25, "uniqueAnimation": true}', true),
  ('no_ads_pass', 'No-Ads Pass', 200, 604800, '{"noInterstitials": true, "rewardedMult": 2}', false),
  ('senior_developer', 'Senior Developer', 500, 2592000, '{"passiveLOC": 500, "autoRefactor": true}', false)
ON CONFLICT (slug) DO NOTHING;
