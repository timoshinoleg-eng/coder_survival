-- Migration 056: Programming Language Unlocks
-- Languages grant unique passive effects and unlock at specific ranks.

CREATE TABLE IF NOT EXISTS programming_languages (
    slug              VARCHAR(32) PRIMARY KEY,
    name              VARCHAR(32) NOT NULL,
    display_name      VARCHAR(64) NOT NULL,
    unlock_level      INTEGER NOT NULL DEFAULT 1,
    unlock_achievement_slug VARCHAR(64),
    effect_type       VARCHAR(32) NOT NULL,
    effect_value      NUMERIC(6,3) NOT NULL DEFAULT 0,
    description       TEXT,
    icon              VARCHAR(8) NOT NULL DEFAULT '',
    theme_color       VARCHAR(32) NOT NULL DEFAULT '#0f3460',
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_languages (
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language_slug     VARCHAR(32) NOT NULL REFERENCES programming_languages(slug) ON DELETE CASCADE,
    unlocked_at       TIMESTAMPTZ DEFAULT NOW(),
    is_active         BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (user_id, language_slug)
);

CREATE INDEX IF NOT EXISTS idx_user_languages_active ON user_languages(user_id, is_active);

INSERT INTO programming_languages (slug, name, display_name, unlock_level, effect_type, effect_value, description, icon, theme_color)
VALUES
  ('python', 'Python', 'Python', 1, 'coffee_drop_chance', 0.10, '+10% chance to find coffee while coding', '🐍', '#1a3a2a'),
  ('javascript', 'JavaScript', 'JavaScript', 2, 'click_power', 0.05, '+5% click speed (commits per tap)', '📜', '#3b2f10'),
  ('rust', 'Rust', 'Rust', 3, 'depression_resist', 0.20, '−20% depression from bug encounters', '🦀', '#3f1a1a'),
  ('go', 'Go', 'Go', 4, 'passive_loc', 0.15, '+15% passive LOC generation', '🐹', '#1a3a5c')
ON CONFLICT (slug) DO NOTHING;
