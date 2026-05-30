-- Migration 030: Seed team skins for Phase 8
-- team_lead (referral milestone) and team_champion (hackathon gold)

INSERT INTO skin_definitions (skin_id, name, description, unlock_type, rarity)
VALUES
  ('team_lead', 'Тимлид', '+15% к продуктивности в Daily Battle', 'referral', 'epic'),
  ('team_champion', 'Чемпион хакатона', 'Эксклюзивный скин за золото в командном хакатоне', 'team_hackathon', 'legendary')
ON CONFLICT (skin_id) DO NOTHING;
