-- Migration 042: Active random events table (server-authoritative state machine)
CREATE TABLE IF NOT EXISTS active_random_events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(32) NOT NULL,
    event_id VARCHAR(64) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    state JSONB NOT NULL DEFAULT '{}',
    resolved_at TIMESTAMPTZ,
    resolution VARCHAR(16),
    deltas JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_active_random_events_user_id ON active_random_events(user_id);
CREATE INDEX IF NOT EXISTS idx_active_random_events_expires_at ON active_random_events(expires_at);

-- Idempotent: add last_random_event_spawn_at to progression for spawn cadence
ALTER TABLE progression
    ADD COLUMN IF NOT EXISTS last_random_event_spawn_at TIMESTAMPTZ;
