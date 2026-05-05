-- migrations/001_init.sql
-- Схема базы данных для Coder Survival
-- PostgreSQL 15+

-- Пользователи (из Telegram)
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    telegram_id     BIGINT NOT NULL UNIQUE,
    username        VARCHAR(64),
    first_name      VARCHAR(128),
    last_name       VARCHAR(128),
    photo_url       TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    last_active     TIMESTAMPTZ DEFAULT NOW()
);

-- Индекс для быстрого поиска по telegram_id
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);

-- Прогресс игрока
CREATE TABLE IF NOT EXISTS progression (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier            INTEGER NOT NULL DEFAULT 1,          -- уровень (Junior=1, Middle=2, Senior=3, Lead=4, CTO=5)
    commits_total   BIGINT NOT NULL DEFAULT 0,            -- всего коммитов за всё время
    commits_current BIGINT NOT NULL DEFAULT 0,            -- коммитов на текущем уровне
    energy          INTEGER NOT NULL DEFAULT 100,        -- энергия 0-100
    depression_level INTEGER NOT NULL DEFAULT 0,         -- уровень депрессии 0-100
    streak_days     INTEGER NOT NULL DEFAULT 0,          -- дней подряд
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Индекс для лидерборда
CREATE INDEX IF NOT EXISTS idx_progression_commits_total ON progression(commits_total DESC);

-- Игровые сессии (одна сессия = одно открытие Mini App)
CREATE TABLE IF NOT EXISTS sessions (
    id              SERIAL PRIMARY KEY,
    session_id      UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    taps_count      INTEGER NOT NULL DEFAULT 0,
    commits_earned  INTEGER NOT NULL DEFAULT 0,
    ip_address      INET
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);

-- Покупки (Stars — пока mock)
CREATE TABLE IF NOT EXISTS purchases (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_type       VARCHAR(32) NOT NULL,                -- 'energy_refill', 'depression_cure', 'tier_boost', 'streak_protect'
    stars_amount    INTEGER NOT NULL,                     -- сколько Stars списано
    status          VARCHAR(16) NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed'
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON purchases(user_id);

-- Реферальная система
CREATE TABLE IF NOT EXISTS referrals (
    id              SERIAL PRIMARY KEY,
    referrer_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- кто пригласил
    referred_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- кого пригласили
    status          VARCHAR(16) NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'rewarded'
    reward_claimed  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(referrer_id, referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_id ON referrals(referred_id);

-- Таблица для rate limiting (IP-based daily cap)
CREATE TABLE IF NOT EXISTS rate_limit_ip (
    id              SERIAL PRIMARY KEY,
    ip_address      INET NOT NULL,
    tap_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    tap_count       INTEGER NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(ip_address, tap_date)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_ip_date ON rate_limit_ip(ip_address, tap_date);

-- Таблица для rate limiting (per-user burst)
CREATE TABLE IF NOT EXISTS rate_limit_user (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tap_count       INTEGER NOT NULL DEFAULT 0,
    window_start    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_user_window ON rate_limit_user(user_id, window_start);

-- Функция для обновления last_active
CREATE OR REPLACE FUNCTION update_last_active()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер на progression
DROP TRIGGER IF EXISTS trg_progression_updated ON progression;
CREATE TRIGGER trg_progression_updated
    BEFORE UPDATE ON progression
    FOR EACH ROW
    EXECUTE FUNCTION update_last_active();

-- Функция для обновления last_active в users при активности
CREATE OR REPLACE FUNCTION update_user_last_active()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users SET last_active = NOW() WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_session_user_active ON sessions;
CREATE TRIGGER trg_session_user_active
    AFTER INSERT ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_user_last_active();
