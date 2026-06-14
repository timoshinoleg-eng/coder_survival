BEGIN;

-- Defensively move any leftover in_progress rows to not_started before narrowing the constraint.
UPDATE progression
SET onboarding_status = 'not_started'
WHERE onboarding_status = 'in_progress';

ALTER TABLE progression
    DROP CONSTRAINT IF EXISTS chk_onboarding_status,
    ADD CONSTRAINT chk_onboarding_status CHECK (onboarding_status IN ('not_started', 'skipped', 'completed'));

COMMIT;
