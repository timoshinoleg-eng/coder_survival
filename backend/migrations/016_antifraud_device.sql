-- migrations/016_antifraud_device.sql
-- Device fingerprint for referral antifraud

ALTER TABLE referrals ADD COLUMN IF NOT EXISTS device_hash VARCHAR(32);
CREATE INDEX IF NOT EXISTS idx_referrals_device ON referrals(device_hash) WHERE device_hash IS NOT NULL;
