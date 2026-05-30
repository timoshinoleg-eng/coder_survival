-- migrations/003_referral_milestones.sql
-- Referral milestone reward claims

CREATE TABLE IF NOT EXISTS referral_milestone_claims (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    milestone       INTEGER NOT NULL,
    reward_energy   INTEGER NOT NULL DEFAULT 0,
    claimed_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, milestone)
);

CREATE INDEX IF NOT EXISTS idx_referral_milestone_claims_user
    ON referral_milestone_claims(user_id);
