-- migrations/057_onboarding_status.sql
-- FTUE: replace boolean onboarding_completed with a status machine
-- that supports not_started / in_progress / skipped / completed.

ALTER TABLE progression
    ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'not_started'
        CONSTRAINT chk_onboarding_status CHECK (onboarding_status IN ('not_started', 'in_progress', 'skipped', 'completed')),
    ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS onboarding_skipped_at TIMESTAMPTZ;

-- Backfill existing completions from the legacy boolean column.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'progression'
          AND column_name = 'onboarding_completed'
    ) THEN
        UPDATE progression
        SET onboarding_status = 'completed',
            onboarding_completed_at = COALESCE(onboarding_completed_at, NOW())
        WHERE onboarding_completed = TRUE
          AND onboarding_status = 'not_started';
    END IF;
END $$;

ALTER TABLE progression
    DROP COLUMN IF EXISTS onboarding_completed;
