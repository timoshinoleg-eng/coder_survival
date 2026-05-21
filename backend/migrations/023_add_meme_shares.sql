-- Migration: Add meme_shares table for Phase 3 analytics

CREATE TABLE IF NOT EXISTS meme_shares (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id VARCHAR(32) NOT NULL,
  format VARCHAR(8) NOT NULL,
  shared_to VARCHAR(16) CHECK (shared_to IN ('chat','story','copy','download')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meme_shares_user ON meme_shares(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meme_shares_template ON meme_shares(template_id, created_at DESC);
