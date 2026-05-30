-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 021: Stage 3 — Social Retention Layer
-- ═══════════════════════════════════════════════════════════════

-- 1. Team Hackathon State
-- Structure: { weekId: '2026-W19', target: 750, progress: 420, tierClaimed: null, contributions: {userId: N} }
ALTER TABLE progression
ADD COLUMN IF NOT EXISTS team_hackathon_state JSONB NOT NULL DEFAULT '{}';

-- 2. Battle State
-- Structure: { active: [...], history: [...] }
ALTER TABLE progression
ADD COLUMN IF NOT EXISTS battle_state JSONB NOT NULL DEFAULT '{}';

-- 3. Referral State
-- Structure: { invitedBy: 'ref_code', milestonesReached: [1,3], pendingRewards: [...] }
ALTER TABLE progression
ADD COLUMN IF NOT EXISTS referral_state JSONB NOT NULL DEFAULT '{}';

-- 4. Share Stats (counters only, no PII)
-- Structure: { sharesToday: 0, lastShareAt: null, date: 'YYYY-MM-DD' }
ALTER TABLE progression
ADD COLUMN IF NOT EXISTS share_stats JSONB NOT NULL DEFAULT '{}';

-- 5. Index for fast team lookups
CREATE INDEX IF NOT EXISTS idx_progression_team_hackathon ON progression ((team_hackathon_state->>'weekId'));
