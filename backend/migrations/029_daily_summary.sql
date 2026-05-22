-- Migration 029: Daily Summary Results table
-- Phase 7: Daily Battle & Referral Rewards

CREATE TABLE IF NOT EXISTS daily_summary_results (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary_date DATE NOT NULL,
  score_total NUMERIC(6,2) NOT NULL DEFAULT 0,
  score_productivity NUMERIC(6,2) NOT NULL DEFAULT 0,
  score_depression NUMERIC(6,2) NOT NULL DEFAULT 0,
  score_social NUMERIC(6,2) NOT NULL DEFAULT 0,
  score_referral NUMERIC(6,2) NOT NULL DEFAULT 0,
  rank INTEGER,
  status VARCHAR(50),
  reward_payload JSONB DEFAULT '{}',
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, summary_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_summary_date ON daily_summary_results(summary_date);
CREATE INDEX IF NOT EXISTS idx_daily_summary_rank ON daily_summary_results(summary_date, rank);
CREATE INDEX IF NOT EXISTS idx_daily_summary_user_date ON daily_summary_results(user_id, summary_date);
