-- Phase 5: Achievement expansion (6 new achievements)
INSERT INTO achievements (achievement_id, name, description, target_value, reward_payload)
VALUES
  ('burnout_first', 'Полное выгорание', 'Поздравляем! Ты официально сгорел...', 1, '{"title":"Пепел"}'::jsonb),
  ('coffee_addict', 'Эспрессо-зависимый', 'Твоя кровь на 90% кофеин...', 50, '{}'::jsonb),
  ('meme_lord', 'Мемный олигарх', 'Ты позорился 10 раз...', 10, '{}'::jsonb),
  ('bug_hunter', 'Охотник за багами', 'Ты нашёл 100 багов...', 100, '{}'::jsonb),
  ('referral_god', 'HR-отдел в одном лице', 'Ты привёл 5 человек в этот ад...', 5, '{"title":"Рекрутёр"}'::jsonb),
  ('prod_survivor', 'Выживший на проде', 'Прод упал 10 раз...', 10, '{}'::jsonb)
ON CONFLICT (achievement_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  target_value = EXCLUDED.target_value,
  reward_payload = EXCLUDED.reward_payload;
