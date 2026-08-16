-- Migration 061: weekly leagues (Bronze -> Legend).
-- snapshotLeagueWeek() (utils/leagues.js + leaguesCron) writes one row per
-- active player every Monday 00:05 UTC, granting internal stars by tier.
CREATE TABLE IF NOT EXISTS league_placements (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    league_tier     VARCHAR(16) NOT NULL,
    week_start      DATE NOT NULL,
    weekly_commits  INTEGER NOT NULL DEFAULT 0,
    placement       INTEGER,
    reward_stars    INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_league_placements_user
  ON league_placements(user_id);
CREATE INDEX IF NOT EXISTS idx_league_placements_week
  ON league_placements(week_start, weekly_commits DESC);
