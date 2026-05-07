-- Stage 4: Long-Term Retention Systems v1
-- Minimal tables for events, sprint pass, teams, and audit hooks.

-- Events (single active event at a time, config-driven)
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(32) NOT NULL DEFAULT 'hackathon',
    title VARCHAR(128) NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    target_commits INTEGER NOT NULL DEFAULT 500,
    reward_payload JSONB NOT NULL DEFAULT '{"energy": 50}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_contributions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    commits_contributed INTEGER NOT NULL DEFAULT 0,
    claimed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, event_id)
);

-- Sprint Pass (one season at a time, 20 levels max)
CREATE TABLE IF NOT EXISTS sprint_passes (
    id SERIAL PRIMARY KEY,
    season_number INTEGER NOT NULL UNIQUE,
    season_name VARCHAR(64) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pass_rewards (
    id SERIAL PRIMARY KEY,
    pass_id INTEGER NOT NULL REFERENCES sprint_passes(id) ON DELETE CASCADE,
    level INTEGER NOT NULL,
    required_xp INTEGER NOT NULL,
    free_reward_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    premium_reward_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE(pass_id, level)
);

CREATE TABLE IF NOT EXISTS player_passes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pass_id INTEGER NOT NULL REFERENCES sprint_passes(id) ON DELETE CASCADE,
    current_level INTEGER NOT NULL DEFAULT 1,
    current_xp INTEGER NOT NULL DEFAULT 0,
    is_premium BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, pass_id)
);

CREATE TABLE IF NOT EXISTS pass_claims (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pass_id INTEGER NOT NULL REFERENCES sprint_passes(id) ON DELETE CASCADE,
    level INTEGER NOT NULL,
    track VARCHAR(8) NOT NULL CHECK (track IN ('free', 'premium')),
    claimed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, pass_id, level, track)
);

-- Teams / Squads (up to 5 members, minimal permission model)
CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    invite_code VARCHAR(16) NOT NULL UNIQUE,
    total_commits INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
    id SERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'member')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

-- Audit logs (minimal anti-cheat boundary)
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(64) NOT NULL,
    context JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at);

-- Seed one default active event if none exists
INSERT INTO events (event_type, title, description, start_date, end_date, target_commits, reward_payload, is_active)
SELECT 'hackathon', 'Weekly Hackathon', 'Набирай коммиты в течение недели и получи награду!', CURRENT_DATE, CURRENT_DATE + INTERVAL '6 days', 650, '{"energy": 80, "commitsCurrent": 60, "depressionRelief": 15}'::jsonb, TRUE
WHERE NOT EXISTS (SELECT 1 FROM events WHERE is_active = TRUE);

-- Seed one default active sprint pass if none exists
INSERT INTO sprint_passes (season_number, season_name, start_date, end_date, is_active)
SELECT 1, 'Season 1: Code Rush', CURRENT_DATE, CURRENT_DATE + INTERVAL '29 days', TRUE
WHERE NOT EXISTS (SELECT 1 FROM sprint_passes WHERE is_active = TRUE);

-- Seed pass rewards for season 1 (20 levels, tuned live curve)
INSERT INTO pass_rewards (pass_id, level, required_xp, free_reward_payload, premium_reward_payload)
SELECT sp.id, gs.level, gs.required_xp, gs.free_reward, gs.premium_reward
FROM sprint_passes sp
CROSS JOIN LATERAL (VALUES
    (1, 20, '{"energy": 10}'::jsonb, '{"energy": 20}'::jsonb),
    (2, 20, '{"commitsCurrent": 15}'::jsonb, '{"commitsCurrent": 30}'::jsonb),
    (3, 25, '{"energy": 10}'::jsonb, '{"energy": 20}'::jsonb),
    (4, 25, '{"commitsCurrent": 15}'::jsonb, '{"commitsCurrent": 30, "depressionRelief": 10}'::jsonb),
    (5, 30, '{"energy": 15, "commitsCurrent": 20}'::jsonb, '{"energy": 30, "commitsCurrent": 40}'::jsonb),
    (6, 30, '{"energy": 10}'::jsonb, '{"energy": 20}'::jsonb),
    (7, 35, '{"commitsCurrent": 20}'::jsonb, '{"commitsCurrent": 40}'::jsonb),
    (8, 35, '{"energy": 10}'::jsonb, '{"energy": 20, "depressionRelief": 10}'::jsonb),
    (9, 40, '{"commitsCurrent": 20}'::jsonb, '{"energy": 30}'::jsonb),
    (10, 45, '{"energy": 20, "commitsCurrent": 30}'::jsonb, '{"energy": 40, "commitsCurrent": 50}'::jsonb),
    (11, 45, '{"energy": 10}'::jsonb, '{"energy": 20}'::jsonb),
    (12, 50, '{"commitsCurrent": 20}'::jsonb, '{"commitsCurrent": 45}'::jsonb),
    (13, 50, '{"energy": 15}'::jsonb, '{"energy": 25, "depressionRelief": 10}'::jsonb),
    (14, 55, '{"commitsCurrent": 25}'::jsonb, '{"commitsCurrent": 45}'::jsonb),
    (15, 60, '{"energy": 20, "commitsCurrent": 35}'::jsonb, '{"energy": 50, "commitsCurrent": 60}'::jsonb),
    (16, 60, '{"energy": 15}'::jsonb, '{"energy": 30}'::jsonb),
    (17, 65, '{"commitsCurrent": 25}'::jsonb, '{"commitsCurrent": 50}'::jsonb),
    (18, 70, '{"energy": 20}'::jsonb, '{"energy": 40, "depressionRelief": 15}'::jsonb),
    (19, 75, '{"commitsCurrent": 30}'::jsonb, '{"commitsCurrent": 60}'::jsonb),
    (20, 80, '{"energy": 30, "commitsCurrent": 50}'::jsonb, '{"energy": 80, "commitsCurrent": 100, "depressionRelief": 25}'::jsonb)
) AS gs(level, required_xp, free_reward, premium_reward)
WHERE sp.is_active = TRUE
ON CONFLICT DO NOTHING;
