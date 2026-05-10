-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 022: Stage 4 — Emotional Depth & LiveOps
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE progression
ADD COLUMN IF NOT EXISTS event_state JSONB NOT NULL DEFAULT '{}';
-- { eventId, startedAt, expiresAt, modifiersApplied, bonusQuestClaimed }

ALTER TABLE progression
ADD COLUMN IF NOT EXISTS career_story JSONB NOT NULL DEFAULT '{}';
-- { unlockedBeats: [1,3], dismissedBeats: [1], lastPromptedAt: null }

ALTER TABLE progression
ADD COLUMN IF NOT EXISTS audio_prefs JSONB NOT NULL DEFAULT '{}';
-- { sfxEnabled: true, bgmEnabled: false, reducedMotion: false }
