-- Migration 059: seed event_definitions for all RANDOM_EVENTS_CONFIG slugs.
-- Config events beyond the original 8 (migration 049) were added over time
-- (slack huddles, merge conflict, canary, CI, Friday outage, green build...),
-- but never seeded here, so randomEventEngine inserts into user_active_events
-- violated user_active_events_event_slug_fkey and /api/tap + /api/state
-- returned 400/500 whenever one of these events spawned.
-- Values mirror backend/src/config/events.js (weights/types/effects).
INSERT INTO event_definitions (slug, name, type, weight, duration_sec, reward_json, penalty_json) VALUES
('green_build', 'Green Build', 'positive', 3, 30, '{"commits": 15, "depressionRelief": 3}', NULL),
('slack_huddle', 'Slack Huddle', 'neutral', 8, 30, '{"commits": 12, "depression": 2}', '{"commits": -4, "depression": 2}'),
('scope_creep', 'Scope Creep', 'neutral', 7, 30, '{"commits": 8, "depression": 3}', '{"commits": -6, "depression": 3}'),
('slack_thread_storm', 'Slack Thread Storm', 'neutral', 7, 30, '{"commits": 4, "depression": 1}', '{"commits": -3, "depression": 2}'),
('merge_conflict', 'Merge Conflict', 'negative', 3, 30, '{"commits": 5, "depression": 3}', '{"commits": -8, "depression": 4}'),
('canary_rollback', 'Canary Rollback', 'negative', 5, 30, NULL, '{"commits": -2, "depression": 1}'),
('production_500_spike', 'HTTP 500 Spike', 'negative', 5, 30, '{"commits": 4, "depression": 2}', '{"commits": -5, "depression": 3}'),
('ci_pipeline_red', 'CI Pipeline Red', 'negative', 6, 30, NULL, '{"commits": -1, "depression": 1}'),
('friday_release_outage', 'Friday Release Outage', 'negative', 6, 30, NULL, '{"commits": -3, "depression": 2}')
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    weight = EXCLUDED.weight,
    duration_sec = EXCLUDED.duration_sec,
    reward_json = EXCLUDED.reward_json,
    penalty_json = EXCLUDED.penalty_json;
