-- migrations/010_backfill_stress_v2_cohort.sql
-- Backfill deterministic A/B cohort for existing users who don't have feature_flags yet.
-- Run AFTER 009_quick_wins.sql has been applied.

UPDATE users
SET feature_flags = jsonb_build_object('stress_v2', (telegram_id % 100) < 50)
WHERE feature_flags IS NULL
   OR feature_flags = '{}'::jsonb;
