-- Migration 057: Reconcile legacy achievements catalog
-- Phase 5 / 9 / 10 achievements that were originally shipped in
-- 026_achievement_expansion.sql, 031_phase9_skins_and_achievements.sql and
-- 033_phase10_final_social.sql.
--
-- Goals:
--   * idempotent (safe to re-run);
--   * safe for fresh installs that already ran 024 + fixed 026/031/033;
--   * safe for production DBs where the old versions of 026/031/033 may have
--     already been applied against an earlier achievements schema;
--   * preserve the legacy condition metadata even though the current runtime
--     (backend/src/utils/achievementsEngine.js) does not read it.

-- ============================================================================
-- 1. Keep the legacy condition column in sync with 031/033.
--    The current runtime does not query achievements.condition, but the seed
--    rows below reference it, so the column must exist for idempotent upserts.
-- ============================================================================
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS condition JSONB DEFAULT NULL;

-- ============================================================================
-- 2. Backfill / reconcile the 6 legacy Phase-5 achievements from 026 plus
--    architect_winner (031) and rubber_duck_unlock (033).
--
--    The 024 schema requires category and trigger_type to be NOT NULL, so we
--    assign 'special' for both.  The current achievements engine only evaluates
--    a fixed set of trigger types and will ignore these rows at runtime, but
--    they will still appear in the catalog endpoint.
-- ============================================================================
INSERT INTO achievements (
    slug,
    name,
    description,
    category,
    rarity,
    trigger_type,
    is_progressive,
    is_secret,
    criteria,
    reward,
    condition,
    sort_order
)
VALUES
    (
        'burnout_first',
        'Полное выгорание',
        'Поздравляем! Ты официально сгорел...',
        'special',
        'rare',
        'special',
        FALSE,
        FALSE,
        '{"target": 1}'::jsonb,
        '{"title":"Пепел"}'::jsonb,
        NULL,
        100
    ),
    (
        'coffee_addict',
        'Эспрессо-зависимый',
        'Твоя кровь на 90% кофеин...',
        'special',
        'common',
        'special',
        FALSE,
        FALSE,
        '{"target": 50}'::jsonb,
        '{}'::jsonb,
        NULL,
        101
    ),
    (
        'meme_lord',
        'Мемный олигарх',
        'Ты позорился 10 раз...',
        'special',
        'rare',
        'special',
        FALSE,
        FALSE,
        '{"target": 10}'::jsonb,
        '{}'::jsonb,
        NULL,
        102
    ),
    (
        'bug_hunter',
        'Охотник за багами',
        'Ты нашёл 100 багов...',
        'special',
        'epic',
        'special',
        FALSE,
        FALSE,
        '{"target": 100}'::jsonb,
        '{}'::jsonb,
        NULL,
        103
    ),
    (
        'referral_god',
        'HR-отдел в одном лице',
        'Ты привёл 5 человек в этот ад...',
        'special',
        'legendary',
        'special',
        FALSE,
        FALSE,
        '{"target": 5}'::jsonb,
        '{"title":"Рекрутёр"}'::jsonb,
        NULL,
        104
    ),
    (
        'prod_survivor',
        'Выживший на проде',
        'Прод упал 10 раз...',
        'special',
        'epic',
        'special',
        FALSE,
        FALSE,
        '{"target": 10}'::jsonb,
        '{}'::jsonb,
        NULL,
        105
    ),
    (
        'architect_winner',
        'Архитектор',
        'Победа в Архитектурном комитете',
        'special',
        'legendary',
        'special',
        FALSE,
        FALSE,
        '{"target": 1}'::jsonb,
        '{"commits": 100}'::jsonb,
        '{"gameType": "architectural_committee"}'::jsonb,
        106
    ),
    (
        'rubber_duck_unlock',
        'Резиновая уточка',
        'Провали мини-игру 3 раза за день',
        'special',
        'legendary',
        'special',
        FALSE,
        TRUE,
        '{"target": 3}'::jsonb,
        '{"skin": "rubber_duck"}'::jsonb,
        '{"hidden": "true", "period": "day"}'::jsonb,
        107
    )
ON CONFLICT (slug) DO UPDATE SET
    name           = EXCLUDED.name,
    description    = EXCLUDED.description,
    category       = EXCLUDED.category,
    rarity         = EXCLUDED.rarity,
    trigger_type   = EXCLUDED.trigger_type,
    is_progressive = EXCLUDED.is_progressive,
    is_secret      = EXCLUDED.is_secret,
    criteria       = EXCLUDED.criteria,
    reward         = EXCLUDED.reward,
    condition      = EXCLUDED.condition,
    sort_order     = EXCLUDED.sort_order;
