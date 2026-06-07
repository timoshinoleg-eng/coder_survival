-- Fix schema gaps required by achievements engine

-- 1. Add coins column to users for achievement rewards
ALTER TABLE users ADD COLUMN IF NOT EXISTS coins BIGINT NOT NULL DEFAULT 0;

-- 2. Add updated_at column to users for cron queries
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Add battle_id alias to team_battle_contributions so cron queries work
ALTER TABLE team_battle_contributions ADD COLUMN IF NOT EXISTS battle_id INT GENERATED ALWAYS AS (season_id) STORED;

-- 4. Update trigger to maintain updated_at alongside last_active
CREATE OR REPLACE FUNCTION update_user_last_active()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users SET last_active = NOW(), updated_at = NOW() WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
