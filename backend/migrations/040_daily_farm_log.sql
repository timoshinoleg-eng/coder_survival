CREATE TABLE IF NOT EXISTS daily_farm_log (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    farm_date DATE NOT NULL DEFAULT CURRENT_DATE,
    loc_earned INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, farm_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_farm_log_user_date ON daily_farm_log(user_id, farm_date DESC);
