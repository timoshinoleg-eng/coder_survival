CREATE TABLE IF NOT EXISTS pass_xp_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pass_id INTEGER NOT NULL REFERENCES sprint_passes(id) ON DELETE CASCADE,
  source VARCHAR(16) NOT NULL CHECK (source IN ('quest','minigame','social','tap','other')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  context JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pass_xp_log_user ON pass_xp_log(user_id, pass_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pass_xp_log_source ON pass_xp_log(source, created_at DESC);
