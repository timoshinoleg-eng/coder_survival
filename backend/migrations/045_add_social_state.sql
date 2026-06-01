-- Add social state storage used by daily summary and team hackathon jobs.

ALTER TABLE progression
  ADD COLUMN IF NOT EXISTS social_state JSONB NOT NULL DEFAULT '{}';
