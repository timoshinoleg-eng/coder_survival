-- Migration 048: Add μ-currency prestige fields
-- Adds lifetime_loc, prestige_count, mu_currency to progression
-- Creates prestige_upgrades table for purchased μ upgrades

ALTER TABLE progression
  ADD COLUMN IF NOT EXISTS lifetime_loc BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prestige_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mu_currency INT NOT NULL DEFAULT 0;

-- Backfill lifetime_loc from commits_total for existing players
UPDATE progression
  SET lifetime_loc = commits_total
  WHERE lifetime_loc = 0 AND commits_total > 0;

-- Table for μ prestige upgrades
CREATE TABLE IF NOT EXISTS prestige_upgrades (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    upgrade_key VARCHAR(64) NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    purchased_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, upgrade_key)
);

CREATE INDEX IF NOT EXISTS idx_prestige_upgrades_user_id ON prestige_upgrades(user_id);
