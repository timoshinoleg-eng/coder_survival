-- migrations/013_battle_rewards.sql
-- Battle reward auto-distribution tracking

CREATE TABLE IF NOT EXISTS battle_reward_claims (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    battle_date DATE NOT NULL,
    rank INT NOT NULL,
    reward_payload JSONB NOT NULL,
    claimed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, battle_date)
);

CREATE INDEX IF NOT EXISTS idx_battle_reward_claims_date ON battle_reward_claims(battle_date);
