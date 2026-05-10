-- migrations/018_team_battle_reward_claims_and_death_sync.sql
-- Canonical team battle claim ledger + one-time burnout-state sync.

CREATE TABLE IF NOT EXISTS team_battle_reward_claims (
    id SERIAL PRIMARY KEY,
    season_id INT NOT NULL REFERENCES team_battle_seasons(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    reward_payload JSONB NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(season_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_battle_reward_claims_season
    ON team_battle_reward_claims(season_id);

CREATE INDEX IF NOT EXISTS idx_team_battle_reward_claims_team
    ON team_battle_reward_claims(team_id);

ALTER TABLE progression
ADD COLUMN IF NOT EXISTS is_burnout BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill historical claims from the old boolean marker to preserve idempotency.
INSERT INTO team_battle_reward_claims (season_id, user_id, team_id, reward_payload, claimed_at)
SELECT
    c.season_id,
    c.user_id,
    c.team_id,
    COALESCE(s.reward_payload, '{}'::jsonb),
    COALESCE(c.updated_at, NOW())
FROM team_battle_contributions c
JOIN team_battle_seasons s ON s.id = c.season_id
WHERE c.reward_claimed = TRUE
ON CONFLICT (season_id, user_id) DO NOTHING;

-- Canonical source for burnout state is progression.is_burnout.
-- Do not auto-clear here: only mark legacy rows that are definitely burned out.
UPDATE progression
SET is_burnout = TRUE
WHERE depression_level >= 100
  AND is_burnout = FALSE;
