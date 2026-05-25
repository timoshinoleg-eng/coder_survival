-- Prompt v11.1 Task 3.1: high_stress -> stress_warning.
-- Offer type is persisted as text in cooldown/impression/audit context tables.

UPDATE offer_cooldowns stress
SET last_dismissed_at = GREATEST(stress.last_dismissed_at, legacy.last_dismissed_at),
    updated_at = NOW()
FROM offer_cooldowns legacy
WHERE legacy.user_id = stress.user_id
  AND legacy.offer_type = 'high_stress'
  AND stress.offer_type = 'stress_warning';

DELETE FROM offer_cooldowns legacy
USING offer_cooldowns stress
WHERE legacy.user_id = stress.user_id
  AND legacy.offer_type = 'high_stress'
  AND stress.offer_type = 'stress_warning';

UPDATE offer_cooldowns
SET offer_type = 'stress_warning',
    updated_at = NOW()
WHERE offer_type = 'high_stress';

UPDATE offer_impressions
SET offer_type = 'stress_warning'
WHERE offer_type = 'high_stress';

UPDATE audit_logs
SET context = jsonb_set(context, '{offerType}', '"stress_warning"'::jsonb, false)
WHERE action = 'offer_dismiss'
  AND context->>'offerType' = 'high_stress';
