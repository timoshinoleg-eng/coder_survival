-- migrations/009_quick_wins.sql
-- Phase 1 Quick Wins: idle energy anchor, feature flags, referral antifraud, rewarded ads skeleton

-- P0-1: action-based idle anchor for energy regeneration
-- This column tracks the last time the player performed an activity that should block
-- idle energy regeneration (tap, claim reward, purchase effect).
-- Heartbeat / session analytics must NOT update this column.
ALTER TABLE progression ADD COLUMN IF NOT EXISTS last_energy_activity_at TIMESTAMPTZ;

-- P0-2: deterministic feature flags for A/B cohorting (e.g., stress_v2)
ALTER TABLE users ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_users_feature_flags ON users(feature_flags) WHERE feature_flags != '{}';

-- P2-5: antifraud audit trail for referral bindings
-- This stores the IP of the user who opened the referral link (the referred user),
-- not the referrer's IP.
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS bind_ip INET;
CREATE INDEX IF NOT EXISTS idx_referrals_bind_ip ON referrals(bind_ip);

-- P0-4: rewarded ads claim tracking (daily limits)
CREATE TABLE IF NOT EXISTS ad_rewards (
    user_id BIGINT NOT NULL,
    date DATE NOT NULL,
    count INT NOT NULL DEFAULT 0,
    last_rewarded_at TIMESTAMPTZ,
    provider VARCHAR(32),
    proof_id TEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, date)
);

-- P0-4: nonce-based ad session verification (prevents client-side abuse)
CREATE TABLE IF NOT EXISTS ad_reward_sessions (
    nonce UUID PRIMARY KEY,
    user_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    provider VARCHAR(32),
    reward_type VARCHAR(32) NOT NULL DEFAULT 'ad_energy'
);
CREATE INDEX IF NOT EXISTS idx_ad_reward_sessions_user ON ad_reward_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_reward_sessions_expires ON ad_reward_sessions(expires_at) WHERE status = 'pending';
