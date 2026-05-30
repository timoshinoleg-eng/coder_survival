-- migrations/008_remove_progression_trigger.sql
-- Remove the automatic progression.updated_at trigger.
-- updated_at is now explicitly managed by application code (tap, reward, recovery, buy, referral paths)
-- to eliminate ambiguity and prevent double-regen scenarios.
DROP TRIGGER IF EXISTS trg_progression_updated ON progression;
DROP FUNCTION IF EXISTS update_last_active();
