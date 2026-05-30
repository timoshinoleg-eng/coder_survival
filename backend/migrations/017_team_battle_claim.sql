-- migrations/017_team_battle_claim.sql
-- Team battle reward claim tracking

ALTER TABLE team_battle_contributions ADD COLUMN IF NOT EXISTS reward_claimed BOOLEAN DEFAULT FALSE;
