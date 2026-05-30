# Phase 6: Mini-Games Tier 1 — CONTEXT.md

> Status: Locked decisions for planning
> Date: 2026-05-22

---

## Requirements

- **MINI-01**: "Hello World" QTE — 5 keys in 3 seconds; reward +50 commits, –10 depression; cooldown 4h; level 2+
- **MINI-02**: "Code Review" bug hunt — find 3 bugs in 15 seconds; reward +100 commits, –20 depression, +10% tap boost 10 min; cooldown 6h; level 4+

---

## Locked Decisions

### Architecture
1. **React overlay pattern** — reuse existing `MiniGameDebug` approach (Preact component modal over Phaser canvas). Full Phaser scene architecture deferred to Phase 8+.
2. **No Energy Sandbox** — for Tier 1 MVP, rewards are small and deterministic. Server validates cooldown + level gates only. Anti-cheat via score plausibility bounds.
3. **Cooldown storage** — `minigame_state JSONB` in `progression` table: `{ "hello_world": { "lastPlayedAt": "...", "playsToday": 0 }, "code_review": { ... } }`. No new tables.

### Mini-Game Design
4. **Hello World** — sequential keypress QTE (W-A-S-D-Space or similar). 5 correct keys within 3s = success. Visual: terminal typing animation.
5. **Code Review** — grid of code snippets, 3 contain hidden bugs (click to find). 15s timer. Success = found all 3. Visual: diff-viewer styling.
6. **Level gating** — backend reads `player_levels` rank/tier. Under-leveled players get `403` with message "Доступно с уровня X".
7. **Daily limits** — not in MVP. Only cooldowns (4h / 6h).

### Rewards & Balance
8. **Hello World reward**: `commits: 50, depressionRelief: 10`
9. **Code Review reward**: `commits: 100, depressionRelief: 20, tapBoostPercent: 10, tapBoostDurationMinutes: 10`
10. **No energy cost** to play (avoids blocking players who are low on energy).
11. **No Stars cost** — free to play, limited by cooldown only.

### Tech Stack
12. **Backend**: `POST /api/minigame/start` (returns sandbox config + cooldown check), `POST /api/minigame/complete` (validates score, applies rewards)
13. **Frontend**: Two new components `MiniGameHelloWorld.jsx` and `MiniGameCodeReview.jsx`. Register in `StatsBar` alongside existing `MiniGameDebug`.
14. **DB migration**: Add `minigame_state JSONB DEFAULT '{}'` to `progression` if not exists.
15. **Feature flag**: Continue using `featureFlags.minigameEnabled` but expand to show new games.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| React overlay feels cheap vs Phaser scenes | Accept for MVP; Phaser scenes planned for Tier 2 (Phase 8) |
| Cooldown bypass by client clock manipulation | Server stores `lastPlayedAt`; client clock is irrelevant |
| Score hacking | Server validates score against plausible max; small rewards make abuse unprofitable |
| Two new components + backend = scope creep | Strict MVP: no animations beyond CSS, no sound beyond existing SFX |

---

## Out of Scope (deferred)

- Phaser scene mini-games (Phase 8+)
- Energy Sandbox pattern (Phase 8+)
- Daily play limits per mini-game
- Leaderboards for mini-games
- Difficulty scaling with player level
- Energy cost to play
