-- migrations/055_ton_wallet.sql
-- TON Connect wallet integration: store wallet address and connection timestamp

ALTER TABLE users
ADD COLUMN IF NOT EXISTS ton_wallet_address VARCHAR(66),
ADD COLUMN IF NOT EXISTS ton_connected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ton_wallet_nonce TEXT;

CREATE INDEX IF NOT EXISTS idx_users_ton_wallet ON users(ton_wallet_address)
WHERE ton_wallet_address IS NOT NULL;
