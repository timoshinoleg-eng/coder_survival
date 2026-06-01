-- PP-18: Prestige System (Job Change / Soft Reset)
-- Adds prestige columns to player_levels and progression

ALTER TABLE player_levels
  ADD COLUMN IF NOT EXISTS prestige_level INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prestige_currency INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prestige_shop_purchases JSONB NOT NULL DEFAULT '{}';

ALTER TABLE progression
  ADD COLUMN IF NOT EXISTS prestige_level INTEGER NOT NULL DEFAULT 0;
