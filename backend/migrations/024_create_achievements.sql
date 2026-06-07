-- Migration 024: Create achievements system
-- Replaces any legacy achievements schema with a modern slug-based catalog,
-- progressive tracking, and full reward metadata.

-- Clean up legacy schema (if present from earlier iterations)
DROP TABLE IF EXISTS achievement_progress CASCADE;
DROP TABLE IF EXISTS user_achievements CASCADE;
DROP TABLE IF EXISTS achievements CASCADE;

-- ============================================================================
-- 1. achievements table — catalog of all achievements
-- ============================================================================
CREATE TABLE IF NOT EXISTS achievements (
    id              SERIAL PRIMARY KEY,
    slug            VARCHAR(64) UNIQUE NOT NULL,
    name            VARCHAR(128) NOT NULL,
    description     TEXT NOT NULL,
    category        VARCHAR(32) CHECK (category IN ('taps', 'coins', 'rank', 'skins', 'battles', 'combo', 'special')),
    rarity          VARCHAR(16) CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
    trigger_type    VARCHAR(32) CHECK (trigger_type IN ('tap_count', 'coins_balance', 'xp_total', 'rank', 'skins_count', 'battle_count', 'battle_mvp', 'time_pattern', 'special')),
    criteria        JSONB NOT NULL,
    reward          JSONB NOT NULL,
    is_progressive  BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    is_secret       BOOLEAN DEFAULT FALSE,
    sort_order      INT DEFAULT 0,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_achievements_category ON achievements(category);
CREATE INDEX IF NOT EXISTS idx_achievements_trigger  ON achievements(trigger_type);
CREATE INDEX IF NOT EXISTS idx_achievements_active   ON achievements(sort_order) WHERE is_active = TRUE;

-- ============================================================================
-- 2. user_achievements table — earned achievements per user
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_achievements (
    id                  SERIAL PRIMARY KEY,
    user_id             INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id      INT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    earned_at           TIMESTAMP NOT NULL DEFAULT NOW(),
    claimed_at          TIMESTAMP NULL,
    notification_sent   BOOLEAN DEFAULT FALSE,
    source              VARCHAR(32) DEFAULT 'runtime' CHECK (source IN ('runtime', 'retroactive', 'admin')),
    reward_applied      JSONB NULL,
    UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_ua_user_id     ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_ua_unclaimed   ON user_achievements(user_id, earned_at) WHERE claimed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ua_unread      ON user_achievements(user_id, earned_at) WHERE notification_sent = FALSE;

-- ============================================================================
-- 3. achievement_progress table — ONLY for progressive achievements
-- ============================================================================
CREATE TABLE IF NOT EXISTS achievement_progress (
    id              SERIAL PRIMARY KEY,
    user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id  INT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    current_value   BIGINT DEFAULT 0,
    target_value    BIGINT NOT NULL,
    percent         NUMERIC(5,2) DEFAULT 0,
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_ap_user_id     ON achievement_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_ap_incomplete  ON achievement_progress(user_id, percent) WHERE percent < 100;

-- ============================================================================
-- 4. Seed data — 21 achievements
-- ============================================================================
INSERT INTO achievements (slug, name, description, category, rarity, trigger_type, is_progressive, criteria, reward) VALUES
('hello_world', 'Hello World', 'Write your first line of code.', 'taps', 'common', 'tap_count', false, '{"target": 1}', '{"coins": 10, "xp": 5}'),
('first_commit', 'First Commit', 'Reach 100 lines of code.', 'taps', 'common', 'tap_count', false, '{"target": 100}', '{"coins": 50, "xp": 25}'),
('code_monkey', 'Code Monkey', 'Reach 1,000 lines of code.', 'taps', 'common', 'tap_count', false, '{"target": 1000}', '{"coins": 250, "xp": 100}'),
('ten_x_dev', '10x Dev', 'Reach 10,000 lines of code.', 'taps', 'rare', 'tap_count', false, '{"target": 10000}', '{"coins": 1500, "xp": 500, "title": "10x Dev"}'),
('first_salary', 'First Salary', 'Earn your first 100 coins.', 'coins', 'common', 'coins_balance', false, '{"target": 100}', '{"coins": 50, "xp": 20}'),
('paycheck', 'Paycheck', 'Earn 1,000 coins.', 'coins', 'common', 'coins_balance', false, '{"target": 1000}', '{"coins": 150, "xp": 75}'),
('startup_exit', 'Startup Exit', 'Earn 100,000 coins.', 'coins', 'rare', 'coins_balance', false, '{"target": 100000}', '{"coins": 3000, "xp": 800}'),
('crypto_millionaire', 'Crypto Millionaire', 'Earn 1,000,000 coins.', 'coins', 'legendary', 'coins_balance', false, '{"target": 1000000}', '{"coins": 25000, "xp": 5000, "title": "Crypto Millionaire"}'),
('junior_dev', 'Junior Developer', 'Reach 1,000 XP.', 'rank', 'common', 'xp_total', false, '{"target": 1000}', '{"coins": 250, "xp": 100}'),
('middle_dev', 'Middle Developer', 'Reach 5,000 XP.', 'rank', 'rare', 'xp_total', false, '{"target": 5000}', '{"coins": 1000, "xp": 250}'),
('senior_dev', 'Senior Developer', 'Reach 15,000 XP.', 'rank', 'epic', 'xp_total', false, '{"target": 15000}', '{"coins": 3500, "xp": 1000, "title": "Senior Dev"}'),
('tech_lead', 'Tech Lead', 'Reach 50,000 XP.', 'rank', 'legendary', 'xp_total', false, '{"target": 50000}', '{"coins": 10000, "xp": 3000, "title": "Tech Lead"}'),
('first_skin', 'New Outfit', 'Unlock your first skin.', 'skins', 'common', 'skins_count', false, '{"target": 1}', '{"coins": 100, "xp": 50}'),
('fashion_coder', 'Fashion Coder', 'Unlock 5 skins.', 'skins', 'rare', 'skins_count', false, '{"target": 5}', '{"coins": 1000, "xp": 300}'),
('collector', 'Collector', 'Unlock 15 skins.', 'skins', 'epic', 'skins_count', false, '{"target": 15}', '{"coins": 5000, "xp": 1500, "badge": "collector"}'),
('team_player', 'Team Player', 'Participate in your first team battle.', 'battles', 'common', 'battle_count', false, '{"target": 1}', '{"coins": 200, "xp": 100}'),
('battle_regular', 'Battle Regular', 'Participate in 10 team battles.', 'battles', 'rare', 'battle_count', false, '{"target": 10}', '{"coins": 1500, "xp": 500}'),
('mvp', 'MVP', 'Become MVP of a team battle.', 'battles', 'epic', 'battle_mvp', false, '{"target": 1}', '{"coins": 3000, "xp": 1000, "title": "MVP"}'),
('night_owl', 'Night Owl', 'Code between midnight and 4 AM.', 'combo', 'rare', 'time_pattern', true, '{"after_hour": 0, "before_hour": 4, "tap_target": 50}', '{"coins": 750, "xp": 250, "badge": "night_owl"}'),
('weekend_warrior', 'Weekend Warrior', 'Code 500 lines on a weekend.', 'combo', 'rare', 'time_pattern', true, '{"days": ["sat", "sun"], "tap_target": 500}', '{"coins": 1200, "xp": 400}'),
('founder', 'Founder', 'Joined before official launch.', 'special', 'epic', 'special', false, '{"prelaunch_user": true}', '{"skin_unlock": "founder_hoodie", "title": "Founder"}')
ON CONFLICT (slug) DO NOTHING;
