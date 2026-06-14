-- Migration 031: Phase 9 skins and achievements

INSERT INTO skin_definitions (skin_id, name, description, unlock_type, rarity)
VALUES
  ('cto_cape', 'CTO', 'Награда за успешный IPO-питч', 'minigame', 'legendary'),
  ('senior_pajamas', 'Пижама сеньора', '+5% к восстановлению энергии', 'rank', 'rare'),
  ('legacy_archaeologist', 'Legacy-археолог', '+20% коммитов в зоне Legacy', 'rank', 'epic'),
  ('heroically_fired', 'Уволенный героически', '+10% к тапу на следующем уровне', 'burnout', 'epic')
ON CONFLICT (skin_id) DO NOTHING;

INSERT INTO achievements (slug, name, description, category, rarity, trigger_type, is_progressive, criteria, reward)
VALUES (
  'architect_winner',
  'Архитектор',
  'Победа в Архитектурном комитете',
  'special',
  'epic',
  'special',
  false,
  '{"minigame_success": true, "gameType": "architectural_committee", "target": 1}',
  '{"commits": 100}'
)
ON CONFLICT (slug) DO NOTHING;
