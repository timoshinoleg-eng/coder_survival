-- migrations/015_death_screen.sql
-- Death screen tracking

ALTER TABLE progression ADD COLUMN IF NOT EXISTS is_dead BOOLEAN NOT NULL DEFAULT FALSE;
