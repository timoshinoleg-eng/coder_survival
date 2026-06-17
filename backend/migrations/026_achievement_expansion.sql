-- Phase 5: Achievement expansion (6 new achievements)
INSERT INTO achievements (slug, name, description, category, rarity, trigger_type, is_progressive, criteria, reward)
VALUES
  ('burnout_first', 'Полное выгорание', 'Поздравляем! Ты официально сгорел...', 'special', 'rare', 'special', false, '{"target":1}'::jsonb, '{"title":"Пепел"}'::jsonb),
  ('coffee_addict', 'Эспрессо-зависимый', 'Твоя кровь на 90% кофеин...', 'special', 'rare', 'special', true, '{"target":50}'::jsonb, '{}'::jsonb),
  ('meme_lord', 'Мемный олигарх', 'Ты позорился 10 раз...', 'special', 'epic', 'special', true, '{"target":10}'::jsonb, '{}'::jsonb),
  ('bug_hunter', 'Охотник за багами', 'Ты нашёл 100 багов...', 'special', 'rare', 'special', true, '{"target":100}'::jsonb, '{}'::jsonb),
  ('referral_god', 'HR-отдел в одном лице', 'Ты привёл 5 человек в этот ад...', 'special', 'epic', 'special', true, '{"target":5}'::jsonb, '{"title":"Рекрутёр"}'::jsonb),
  ('prod_survivor', 'Выживший на проде', 'Прод упал 10 раз...', 'special', 'epic', 'special', true, '{"target":10}'::jsonb, '{}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  rarity = EXCLUDED.rarity,
  trigger_type = EXCLUDED.trigger_type,
  is_progressive = EXCLUDED.is_progressive,
  criteria = EXCLUDED.criteria,
  reward = EXCLUDED.reward;
