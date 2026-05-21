-- Phase 5: Add first_active_at to progression for referral anti-farm
ALTER TABLE progression ADD COLUMN IF NOT EXISTS first_active_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill existing rows with created_at from users table
UPDATE progression p
SET first_active_at = u.created_at
FROM users u
WHERE p.user_id = u.id AND p.first_active_at IS NULL;
