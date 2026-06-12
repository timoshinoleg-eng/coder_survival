-- Migration 033: Phase 10 — Final social features, GIF skins, secret achievement

INSERT INTO skin_definitions (skin_id, name, description, unlock_type, rarity)
VALUES
  ('office_cat', 'Офисный кот', '-10 депрессии каждые 5 минут', 'purchase', 'epic'),
  ('rubber_duck', 'Резиновая уточка', '20% шанс скрыть ошибку в мини-игре', 'secret', 'legendary')
ON CONFLICT (skin_id) DO NOTHING;

-- Secret achievement for Rubber Duck unlock
INSERT INTO achievements (slug, name, description, criteria, reward, condition)
VALUES (
  'rubber_duck_unlock',
  'Резиновая уточка',
  'Провали мини-игру 3 раза за день',
  '{"target": 3}'::jsonb,
  '{"skin": "rubber_duck"}'::jsonb,
  '{"hidden": "true", "period": "day"}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;
