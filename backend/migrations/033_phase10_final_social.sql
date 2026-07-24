-- Migration 033: Phase 10 — Final social features, GIF skins, secret achievement

INSERT INTO skin_definitions (skin_id, name, description, unlock_type, rarity)
VALUES
  ('office_cat', 'Офисный кот', '-10 депрессии каждые 5 минут', 'purchase', 'epic'),
  ('rubber_duck', 'Резиновая уточка', '20% шанс скрыть ошибку в мини-игре', 'secret', 'legendary')
ON CONFLICT (skin_id) DO NOTHING;

-- Secret achievement for Rubber Duck unlock
-- Guarded: slug-based catalog only exists after 053; skip on fresh-DB legacy schema.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'achievements' AND column_name = 'slug'
  ) THEN
    INSERT INTO achievements (slug, name, description, category, rarity, trigger_type, is_progressive, criteria, reward, condition)
    VALUES (
      'rubber_duck_unlock',
      'Резиновая уточка',
      'Провали мини-игру 3 раза за день',
      'special',
      'legendary',
      'special',
      true,
      '{"target": 3}',
      '{"skin": "rubber_duck"}',
      '{"hidden": "true", "period": "day"}'
    )
    ON CONFLICT (slug) DO NOTHING;
  END IF;
END $$;
