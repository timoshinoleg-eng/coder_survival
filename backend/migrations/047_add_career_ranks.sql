ALTER TABLE player_levels
  ADD COLUMN IF NOT EXISTS career_rank VARCHAR(16) NOT NULL DEFAULT 'Junior',
  ADD COLUMN IF NOT EXISTS rank_bonus_energy_speed NUMERIC(5,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rank_bonus_xp_multiplier NUMERIC(5,4) NOT NULL DEFAULT 0;

UPDATE player_levels
SET career_rank = CASE
  WHEN xp_total < 1000 THEN 'Junior'
  WHEN xp_total < 5000 THEN 'Middle'
  WHEN xp_total < 15000 THEN 'Senior'
  ELSE 'Lead'
END,
rank_bonus_energy_speed = CASE
  WHEN xp_total >= 1000 AND xp_total < 5000 THEN 0.05
  ELSE 0
END,
rank_bonus_xp_multiplier = CASE
  WHEN xp_total >= 5000 AND xp_total < 15000 THEN 0.10
  ELSE 0
END;

CREATE TABLE IF NOT EXISTS player_xp_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source VARCHAR(16) NOT NULL CHECK (source IN ('tap','minigame','quest','streak')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_xp_log_user ON player_xp_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_xp_log_source ON player_xp_log(source, created_at DESC);
