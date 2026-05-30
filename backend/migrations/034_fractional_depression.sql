-- Allow fractional stress gains from TAP_MECHANICS.depressionGainPerTap.
ALTER TABLE progression
ALTER COLUMN depression_level TYPE NUMERIC(6,2)
USING depression_level::NUMERIC(6,2);
