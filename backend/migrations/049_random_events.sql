-- Migration 049: Random Events Engine v2 — event definitions and user active events
CREATE TABLE IF NOT EXISTS event_definitions (
    slug VARCHAR(32) PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    type VARCHAR(16) NOT NULL CHECK (type IN ('negative', 'neutral', 'positive')),
    weight INTEGER NOT NULL DEFAULT 1,
    duration_sec INTEGER,
    reward_json JSONB,
    penalty_json JSONB
);

CREATE TABLE IF NOT EXISTS user_active_events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_slug VARCHAR(32) NOT NULL REFERENCES event_definitions(slug),
    event_id VARCHAR(64) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolution VARCHAR(16),
    resolution_data JSONB,
    state JSONB NOT NULL DEFAULT '{}',
    deltas JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_user_active_events_user_id ON user_active_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_active_events_expires_at ON user_active_events(expires_at);

-- Seed the 8 required events
INSERT INTO event_definitions (slug, name, type, weight, duration_sec, reward_json, penalty_json) VALUES
('bug_production', 'Bug in Production', 'negative', 15, 15, '{"depression": 2, "commits": 5}', '{"depression": 6, "energyDrainPercent": 0.08, "durationSeconds": 180}'),
('code_review', 'Code Review', 'neutral', 18, 15, '{"commits": 10, "depression": 2}', '{"commits": -5, "depression": 4}'),
('stack_overflow_down', 'Stack Overflow Down', 'negative', 8, 30, NULL, '{"depression": 3, "disableHelpSeconds": 30}'),
('legacy_code', 'Legacy Code', 'negative', 12, 20, '{"depression": 4}', '{"depression": 8, "commits": -10, "durationSeconds": 60}'),
('coffee_stain', 'Coffee Stain', 'neutral', 20, 15, '{"energy": 8, "depression": -4}', NULL),
('golden_commit', 'Golden Commit', 'positive', 10, 13, '{"commits": 40, "depression": -4, "locPerSecMultiplier": 7, "durationSeconds": 77}', '{"depression": 2}'),
('deploy_friday', 'Deploy Friday', 'negative', 12, 30, '{"depression": -2}', '{"depression": 8, "locLossRisk": 0.25}'),
('open_source_contribution', 'Open Source Contribution', 'positive', 5, 15, '{"skin": "open_source_hero", "commits": 20}', NULL)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    weight = EXCLUDED.weight,
    duration_sec = EXCLUDED.duration_sec,
    reward_json = EXCLUDED.reward_json,
    penalty_json = EXCLUDED.penalty_json;
