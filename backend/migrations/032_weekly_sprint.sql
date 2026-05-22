-- Migration 032: Weekly Sprint Quest

ALTER TABLE progression
ADD COLUMN IF NOT EXISTS weekly_sprint_quest_state JSONB DEFAULT '{}';

-- Add index for quick lookup (rarely used but consistent with daily_quests_state)
CREATE INDEX IF NOT EXISTS idx_progression_weekly_sprint
ON progression USING GIN (weekly_sprint_quest_state);
