-- Migration 053: Season rotation support

-- Track whether premium refunds have been processed for a season
ALTER TABLE sprint_passes
  ADD COLUMN IF NOT EXISTS refund_processed BOOLEAN DEFAULT FALSE;
