-- migrations/054_daily_battle.sql
-- Daily Battle / Daily Deploy system: random bug tickets with squad contribution

CREATE TABLE IF NOT EXISTS daily_battles (
  id SERIAL PRIMARY KEY,
  battle_date DATE NOT NULL DEFAULT CURRENT_DATE,
  bug_type VARCHAR(64) NOT NULL,
  deadline_hours INT NOT NULL CHECK (deadline_hours IN (4, 8, 24)),
  severity VARCHAR(4) NOT NULL CHECK (severity IN ('P0', 'P1', 'P2')),
  reset_time VARCHAR(8) NOT NULL CHECK (reset_time IN ('10:00', '19:00')),
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed')),
  target_loc INT NOT NULL DEFAULT 5000,
  total_loc INT NOT NULL DEFAULT 0,
  participants_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_daily_battles_status ON daily_battles(status);
CREATE INDEX IF NOT EXISTS idx_daily_battles_date ON daily_battles(battle_date);

CREATE TABLE IF NOT EXISTS user_daily_battles (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  battle_id INT NOT NULL REFERENCES daily_battles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  success BOOLEAN,
  contribution_loc INT NOT NULL DEFAULT 0,
  claimed BOOLEAN NOT NULL DEFAULT FALSE,
  claimed_at TIMESTAMPTZ,
  reward_payload JSONB,
  PRIMARY KEY (user_id, battle_id)
);

CREATE INDEX IF NOT EXISTS idx_user_daily_battles_battle ON user_daily_battles(battle_id);
