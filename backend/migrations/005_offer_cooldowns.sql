-- Stage 4.1: server-side contextual offer cooldowns

CREATE TABLE IF NOT EXISTS offer_cooldowns (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    offer_type VARCHAR(32) NOT NULL,
    last_dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, offer_type)
);

CREATE INDEX IF NOT EXISTS idx_offer_cooldowns_user ON offer_cooldowns(user_id, updated_at DESC);
