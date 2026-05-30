-- migrations/012_coffee.sql
-- Coffee cooldown tracking

ALTER TABLE progression ADD COLUMN IF NOT EXISTS coffee_last_used TIMESTAMPTZ;
