-- migrations/011_login_reward.sql
-- Auto daily login reward tracking (separate from quest streak)

CREATE TABLE IF NOT EXISTS daily_login_claims (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_claimed_date DATE,
    streak_days INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_login_claims_user ON daily_login_claims(user_id);
