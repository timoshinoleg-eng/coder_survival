-- migrations/014_phase2_schema.sql
-- Phase 2 schema: Team Battle, Skins, Achievements, Crunch Time, Referral Chain, Meme Templates

-- P1-5: Team Battle Seasons
CREATE TABLE IF NOT EXISTS team_battle_seasons (
    id SERIAL PRIMARY KEY,
    season_number INT NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    target_commits INT NOT NULL DEFAULT 500,
    reward_payload JSONB NOT NULL,
    status VARCHAR(16) DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_team_battle_seasons_status ON team_battle_seasons(status) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS team_battle_contributions (
    id SERIAL PRIMARY KEY,
    season_id INT REFERENCES team_battle_seasons(id),
    team_id INT REFERENCES teams(id),
    user_id INT REFERENCES users(id),
    commits_contributed INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(season_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_battle_contributions_season ON team_battle_contributions(season_id);
CREATE INDEX IF NOT EXISTS idx_team_battle_contributions_team ON team_battle_contributions(team_id);

-- P2-2: Skin Definitions (seeded by dev, not user-generated)
CREATE TABLE IF NOT EXISTS skin_definitions (
    id SERIAL PRIMARY KEY,
    skin_id VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(128),
    description TEXT,
    rarity VARCHAR(16) DEFAULT 'common',
    unlock_type VARCHAR(32) DEFAULT 'achievement',
    unlock_payload JSONB
);

CREATE TABLE IF NOT EXISTS user_skins (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    skin_id VARCHAR(32) NOT NULL,
    equipped BOOLEAN DEFAULT FALSE,
    unlocked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, skin_id)
);

CREATE INDEX IF NOT EXISTS idx_user_skins_user ON user_skins(user_id);

-- P2-2: Achievements
CREATE TABLE IF NOT EXISTS achievements (
    id SERIAL PRIMARY KEY,
    achievement_id VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(128),
    description TEXT,
    target_value INT NOT NULL DEFAULT 1,
    reward_payload JSONB
);

CREATE TABLE IF NOT EXISTS user_achievements (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    achievement_id VARCHAR(32) NOT NULL,
    progress_value INT DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    claimed BOOLEAN DEFAULT FALSE,
    UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);

-- P2-3: Referral Chain Milestone Progress
CREATE TABLE IF NOT EXISTS referral_chain_progress (
    id SERIAL PRIMARY KEY,
    referrer_id INT REFERENCES users(id) ON DELETE CASCADE,
    milestone INT NOT NULL,
    reward_claimed BOOLEAN DEFAULT FALSE,
    claimed_at TIMESTAMPTZ,
    UNIQUE(referrer_id, milestone)
);

-- P2-4: Crunch Time Events
CREATE TABLE IF NOT EXISTS crunch_time_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(32) DEFAULT 'crunch_time',
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    commit_multiplier DECIMAL(3,2) DEFAULT 2.00,
    depression_multiplier DECIMAL(3,2) DEFAULT 1.50,
    reward_payload JSONB,
    status VARCHAR(16) DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_crunch_time_status ON crunch_time_events(status) WHERE status = 'active';

-- P1-3: Meme Templates (metadata, actual generation is client-side)
CREATE TABLE IF NOT EXISTS meme_templates (
    id SERIAL PRIMARY KEY,
    template_id VARCHAR(32) UNIQUE NOT NULL,
    title VARCHAR(128),
    unlock_condition VARCHAR(32) DEFAULT 'default',
    asset_path VARCHAR(256)
);

-- Seed default meme templates
INSERT INTO meme_templates (template_id, title, unlock_condition, asset_path) VALUES
('works_on_my_machine', 'It works on my machine', 'default', '/memes/works_on_my_machine.png'),
('deploy_on_friday', 'Deploy on Friday', 'default', '/memes/deploy_on_friday.png'),
('this_is_fine', 'This is fine', 'default', '/memes/this_is_fine.png'),
('wtf_per_minute', 'WTF per minute', 'default', '/memes/wtf_per_minute.png'),
('stack_overflow', 'Stack Overflow copy-paste', 'default', '/memes/stack_overflow.png')
ON CONFLICT (template_id) DO NOTHING;

-- Seed default skins
INSERT INTO skin_definitions (skin_id, name, description, rarity, unlock_type, unlock_payload) VALUES
('legacy_archaeologist', 'Legacy-археолог', 'Пройти зону Legacy Code', 'rare', 'achievement', '{"achievementId": "legacy_zone"}'),
('night_shift', 'Ночной дежурный', '30 сессий после 22:00', 'epic', 'achievement', '{"achievementId": "night_shift_30"}'),
('junior_default', 'Junior', 'Стандартный скин', 'common', 'default', '{}')
ON CONFLICT (skin_id) DO NOTHING;

-- Seed default achievements
INSERT INTO achievements (achievement_id, name, description, target_value, reward_payload) VALUES
('legacy_zone', 'Legacy-археолог', 'Пройти зону Legacy Code', 1, '{"skinId": "legacy_archaeologist"}'),
('night_shift_30', 'Ночной дежурный', 'Сыграть 30 сессий после 22:00', 30, '{"skinId": "night_shift"}'),
('tap_master', 'Мастер тапа', 'Сделать 1000 тапов', 1000, '{"energy": 50}'),
('commit_king', 'Король коммитов', 'Набрать 10000 коммитов', 10000, '{"energy": 100, "depressionRelief": 20}')
ON CONFLICT (achievement_id) DO NOTHING;
