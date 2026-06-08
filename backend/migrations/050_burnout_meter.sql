-- migrations/050_burnout_meter.sql
-- Burnout Meter v2: affliction tracking, forced breaks, and 0-200 scale enforcement

ALTER TABLE progression
ADD COLUMN IF NOT EXISTS burnout_affliction BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS forced_break_until TIMESTAMPTZ;

-- Backfill existing rows based on current depression_level
UPDATE progression
SET burnout_affliction = TRUE
WHERE depression_level >= 100 AND burnout_affliction = FALSE;

-- Enforce Burnout Meter 0-200 bounds on depression_level
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_depression_level_range'
      AND table_name = 'progression'
  ) THEN
    ALTER TABLE progression
    ADD CONSTRAINT chk_depression_level_range
    CHECK (depression_level >= 0 AND depression_level <= 200);
  END IF;
END $$;
