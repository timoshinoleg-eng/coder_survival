-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 020: Stage 2 — Habit Formation Layer
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE progression
ADD COLUMN IF NOT EXISTS daily_quests_state JSONB NOT NULL DEFAULT '{}';

ALTER TABLE progression
ADD COLUMN IF NOT EXISTS pass_state JSONB NOT NULL DEFAULT '{}';

ALTER TABLE progression
ADD COLUMN IF NOT EXISTS streak_state JSONB NOT NULL DEFAULT '{}';

ALTER TABLE progression
ADD COLUMN IF NOT EXISTS rewarded_video_state JSONB NOT NULL DEFAULT '{}';

ALTER TABLE progression
ADD COLUMN IF NOT EXISTS timezone_offset INT;

CREATE INDEX IF NOT EXISTS idx_progression_quests
ON progression ((daily_quests_state->>'lastDate'));

CREATE INDEX IF NOT EXISTS idx_progression_pass
ON progression ((pass_state->>'seasonId'));

UPDATE progression
SET daily_quests_state = '{}'
WHERE daily_quests_state IS NULL;

UPDATE progression
SET pass_state = '{}'
WHERE pass_state IS NULL;

UPDATE progression
SET pass_state = jsonb_build_object(
    'seasonId', 'season_1_startup',
    'seasonStartDate', '2026-05-01',
    'currentXp', 0,
    'claimedLevels', '[]'::jsonb,
    'premiumUnlocked', FALSE
)
WHERE pass_state = '{}'::jsonb;

UPDATE progression
SET streak_state = '{}'
WHERE streak_state IS NULL;

UPDATE progression
SET streak_state = jsonb_build_object(
    'currentStreak', 0,
    'maxStreak', 0,
    'lastLoginDate', NULL,
    'protection', jsonb_build_object(
        'freeUsed', FALSE,
        'starSavesUsed', 0,
        'teamSaveAvailable', FALSE
    )
)
WHERE streak_state = '{}'::jsonb
   OR NOT (streak_state ? 'protection');

UPDATE progression
SET rewarded_video_state = '{}'
WHERE rewarded_video_state IS NULL;
