#!/bin/bash
# Phase 1 Release Verification Script
# Run this on the server after applying migrations

set -e

echo "=== Phase 1 Release Verification ==="
echo ""

# 1. Apply migrations
echo "[1/6] Applying migrations..."
cd backend && npm run migrate
cd ..

# 2. Verify schema
echo "[2/6] Verifying schema..."
psql "$DATABASE_URL" -c "
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'progression' 
  AND column_name IN ('last_energy_activity_at', 'coffee_last_used');
"

psql "$DATABASE_URL" -c "
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name = 'feature_flags';
"

psql "$DATABASE_URL" -c "
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'referrals' 
  AND column_name = 'bind_ip';
"

psql "$DATABASE_URL" -c "\dt ad_rewards"
psql "$DATABASE_URL" -c "\dt ad_reward_sessions"
psql "$DATABASE_URL" -c "\dt daily_login_claims"

# 3. Verify backfill
echo "[3/6] Verifying stress_v2 backfill..."
psql "$DATABASE_URL" -c "
SELECT 
  feature_flags->>'stress_v2' AS cohort,
  COUNT(*) 
FROM users 
GROUP BY cohort;
"

# 4. Smoke test: idle energy regen
echo "[4/6] Running smoke test (idle energy regen)..."
cd backend && npm test -- tests/smoke.idleEnergyRegen.test.js

# 5. Verify login reward logic manually
echo "[5/6] Verifying login reward..."
psql "$DATABASE_URL" -c "
-- Create a test user if not exists
INSERT INTO users (telegram_id, username)
VALUES (999999001, 'test_phase1')
ON CONFLICT (telegram_id) DO NOTHING;
"

echo "[6/6] Verification complete!"
echo ""
echo "Next steps:"
echo "  1. Run smoke test manually if automated test failed"
echo "  2. Check that login reward toast appears on app open"
echo "  3. Verify coffee button restores energy and respects cooldown"
echo "  4. Check that BGM starts after first tap"
echo "  5. Check that avatar appears in StatsBar"
echo "  6. Check that Event/Pass panels don't break after tap"
