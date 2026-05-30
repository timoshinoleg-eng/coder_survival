-- Stage 1: core loop rescue primitives.
-- Idempotent additions only; no monetization or social schema rewrites.

ALTER TABLE progression
ADD COLUMN IF NOT EXISTS inventory JSONB NOT NULL DEFAULT '{}';

ALTER TABLE progression
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE progression
ADD COLUMN IF NOT EXISTS is_burnout BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE progression
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE progression
ADD COLUMN IF NOT EXISTS last_energy_activity_at TIMESTAMPTZ;

ALTER TABLE progression
ADD COLUMN IF NOT EXISTS energy_recovery_checkpoint_at TIMESTAMPTZ;

ALTER TABLE team_members
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();

UPDATE progression
SET created_at = COALESCE(created_at, updated_at, NOW())
WHERE created_at IS NULL;

UPDATE progression
SET last_energy_activity_at = updated_at
WHERE last_energy_activity_at IS NULL;

UPDATE progression
SET energy_recovery_checkpoint_at = last_energy_activity_at
WHERE energy_recovery_checkpoint_at IS NULL;

UPDATE progression
SET is_burnout = depression_level >= 100
WHERE is_burnout IS DISTINCT FROM (depression_level >= 100);

DROP TRIGGER IF EXISTS trg_progression_updated ON progression;
