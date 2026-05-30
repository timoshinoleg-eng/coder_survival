-- Phase 6: Add minigame_state and active_effects to progression
ALTER TABLE progression ADD COLUMN IF NOT EXISTS minigame_state JSONB DEFAULT '{}';
ALTER TABLE progression ADD COLUMN IF NOT EXISTS active_effects JSONB DEFAULT '{}';
