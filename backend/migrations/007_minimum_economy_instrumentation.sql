CREATE TABLE IF NOT EXISTS offer_impressions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    offer_type VARCHAR(32) NOT NULL,
    source VARCHAR(16) NOT NULL DEFAULT 'state',
    shown_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_impressions_user_time
    ON offer_impressions(user_id, shown_at DESC);

ALTER TABLE daily_quests
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
