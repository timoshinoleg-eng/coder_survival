-- Migration 031: Phase 9 skins and achievements

INSERT INTO skin_definitions (skin_id, name, description, unlock_type, rarity)
VALUES
  ('cto_cape', 'CTO', 'Награда за успешный IPO-питч', 'minigame', 'legendary'),
  ('senior_pajamas', 'Пижама сеньора', '+5% к восстановлению энергии', 'rank', 'rare'),
  ('legacy_archaeologist', 'Legacy-археолог', '+20% коммитов в зоне Legacy', 'rank', 'epic'),
  ('heroically_fired', 'Уволенный героически', '+10% к тапу на следующем уровне', 'burnout', 'epic')
ON CONFLICT (skin_id) DO NOTHING;

-- Add condition column to achievements for minigame-specific triggers
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS condition JSONB DEFAULT NULL;

-- Guarded: slug-based catalog only exists after 053; skip on fresh-DB legacy schema.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'achievements' AND column_name = 'slug'
  ) THEN
    INSERT INTO achievements (slug, name, description, category, rarity, trigger_type, is_progressive, criteria, reward, condition)
    VALUES (
      'architect_winner',
      'Архитектор',
      'Победа в Архитектурном комитете',
      'special',
      'epic',
      'special',
      false,
      '{"target": 1}',
      '{"commits": 100}',
      '{"gameType": "architectural_committee"}'
    )
    ON CONFLICT (slug) DO NOTHING;
  END IF;
END $$;
