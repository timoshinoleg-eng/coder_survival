-- Phase 5: Achievement expansion (6 new achievements)
INSERT INTO achievements (slug, name, description, category, rarity, trigger_type, is_progressive, criteria, reward)
VALUES
  ('burnout_first', 'Полное выгорание', 'Поздравляем! Ты официально сгорел...', 'special', 'rare', 'special', false, '{"burnout_reached": true, "target": 1}', '{"title": "Пепел"}'),
  ('coffee_addict', 'Эспрессо-зависимый', 'Твоя кровь на 90% кофеин...', 'special', 'common', 'special', false, '{"coffee_count": 50, "target": 1}', '{}'),
  ('meme_lord', 'Мемный олигарх', 'Ты позорился 10 раз...', 'special', 'rare', 'special', false, '{"meme_shares": 10, "target": 1}', '{}'),
  ('bug_hunter', 'Охотник за багами', 'Ты нашёл 100 багов...', 'special', 'epic', 'special', false, '{"bugs_found": 100, "target": 1}', '{}'),
  ('referral_god', 'HR-отдел в одном лице', 'Ты привёл 5 человек в этот ад...', 'special', 'epic', 'special', false, '{"referrals": 5, "target": 1}', '{"title": "Рекрутёр"}'),
  ('prod_survivor', 'Выживший на проде', 'Прод упал 10 раз...', 'special', 'legendary', 'special', false, '{"prod_down": 10, "target": 1}', '{}')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  rarity = EXCLUDED.rarity,
  trigger_type = EXCLUDED.trigger_type,
  is_progressive = EXCLUDED.is_progressive,
  criteria = EXCLUDED.criteria,
  reward = EXCLUDED.reward;
