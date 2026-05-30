CREATE TABLE IF NOT EXISTS appeal_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ban_score_snapshot INTEGER NOT NULL DEFAULT 0,
    sanction_tier VARCHAR(32),
    message TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appeal_requests_user_created ON appeal_requests(user_id, created_at DESC);
