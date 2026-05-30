CREATE TABLE IF NOT EXISTS player_levels (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    xp_total BIGINT NOT NULL DEFAULT 0,
    rank INTEGER NOT NULL DEFAULT 1,
    level_in_rank INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_quests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_date DATE NOT NULL DEFAULT CURRENT_DATE,
    quest_type VARCHAR(32) NOT NULL,
    target_value INTEGER NOT NULL,
    progress_value INTEGER NOT NULL DEFAULT 0,
    reward_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    claimed BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(user_id, quest_date, quest_type)
);

CREATE INDEX IF NOT EXISTS idx_daily_quests_user_date
    ON daily_quests(user_id, quest_date);

CREATE TABLE IF NOT EXISTS referral_codes (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(32) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
