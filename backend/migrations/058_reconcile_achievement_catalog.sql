-- Migration 058: Reconcile achievement catalog after the 053 rebuild.
--
-- Background: 053_create_achievements.sql DROPs any legacy achievements table
-- and seeds a fresh 21-row slug-based catalog. That rebuild lost eight
-- achievements originally seeded by 026/031/033 (whose seeds are guarded to
-- no-op on fresh databases until the slug schema exists) and dropped the
-- `condition` JSONB column that 031 had added (needed by architect_winner and
-- rubber_duck_unlock).
--
-- This migration restores the catalog WITHOUT touching user progress:
--   * adds `condition` back (ADD COLUMN IF NOT EXISTS — no-op if present);
--   * upserts the eight missing achievements idempotently (ON CONFLICT DO
--     UPDATE keyed on slug);
--   * performs NO DROPs and does not modify user_achievements/progress rows.
--
-- Safe on: a fresh database (runs right after 053/056), an existing database
-- already past the current head, and repeated runs (upsert + IF NOT EXISTS).

ALTER TABLE achievements ADD COLUMN IF NOT EXISTS condition JSONB DEFAULT NULL;

INSERT INTO achievements
  (slug, name, description, category, rarity, trigger_type, is_progressive, criteria, reward, is_secret, condition)
VALUES
  ('burnout_first', 'Полное выгорание', 'Поздравляем! Ты официально сгорел...', 'special', 'rare', 'special', false,
   '{"target":1}'::jsonb, '{"title":"Пепел"}'::jsonb, FALSE, NULL),
  ('coffee_addict', 'Эспрессо-зависимый', 'Твоя кровь на 90% кофеин...', 'special', 'rare', 'special', true,
   '{"target":50}'::jsonb, '{}'::jsonb, FALSE, NULL),
  ('meme_lord', 'Мемный олигарх', 'Ты позорился 10 раз...', 'special', 'epic', 'special', true,
   '{"target":10}'::jsonb, '{}'::jsonb, FALSE, NULL),
  ('bug_hunter', 'Охотник за багами', 'Ты нашёл 100 багов...', 'special', 'rare', 'special', true,
   '{"target":100}'::jsonb, '{}'::jsonb, FALSE, NULL),
  ('referral_god', 'HR-отдел в одном лице', 'Ты привёл 5 человек в этот ад...', 'special', 'epic', 'special', true,
   '{"target":5}'::jsonb, '{"title":"Рекрутёр"}'::jsonb, FALSE, NULL),
  ('prod_survivor', 'Выживший на проде', 'Прод упал 10 раз...', 'special', 'epic', 'special', true,
   '{"target":10}'::jsonb, '{}'::jsonb, FALSE, NULL),
  ('architect_winner', 'Архитектор', 'Победа в Архитектурном комитете', 'special', 'epic', 'special', false,
   '{"target": 1}'::jsonb, '{"commits": 100}'::jsonb, FALSE, '{"gameType": "architectural_committee"}'::jsonb),
  ('rubber_duck_unlock', 'Резиновая уточка', 'Провали мини-игру 3 раза за день', 'special', 'legendary', 'special', true,
   '{"target": 3}'::jsonb, '{"skin": "rubber_duck"}'::jsonb, TRUE, '{"hidden": "true", "period": "day"}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  name           = EXCLUDED.name,
  description    = EXCLUDED.description,
  category       = EXCLUDED.category,
  rarity         = EXCLUDED.rarity,
  trigger_type   = EXCLUDED.trigger_type,
  is_progressive = EXCLUDED.is_progressive,
  criteria       = EXCLUDED.criteria,
  reward         = EXCLUDED.reward,
  is_secret      = EXCLUDED.is_secret,
  condition      = EXCLUDED.condition;
