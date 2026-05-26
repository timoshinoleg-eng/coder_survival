-- MVP performance quick wins: FK indexes used by pass, teams and live event screens.
CREATE INDEX IF NOT EXISTS idx_pass_rewards_pass_id
  ON pass_rewards(pass_id);

CREATE INDEX IF NOT EXISTS idx_team_members_team_id
  ON team_members(team_id);

CREATE INDEX IF NOT EXISTS idx_event_contributions_event_id
  ON event_contributions(event_id);
