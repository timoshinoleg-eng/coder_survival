# Phase 6: Mini-Games Tier 1 — DISCUSSION-LOG.md

> Date: 2026-05-22
> Context gathered from: ROADMAP.md, REQUIREMENTS.md, codebase audit, ARCHITECTURE.md research

---

## Area 1: Mini-Game Architecture Choice

**Question:** Should we build Phaser scenes or reuse React overlays?

**Findings:**
- Existing `MiniGameDebug.jsx` is a React overlay (285 lines, works well)
- No Phaser mini-game scenes exist; only `BootScene` + `GameScene`
- ARCHITECTURE.md proposes `BaseMiniGameScene`, `Energy Sandbox`, `minigame_sandboxes` table — none implemented
- Building Phaser scenes would require: scene registry, asset loading, scene transitions, EventBridge wiring — ~2x scope

**Decision:** Reuse React overlay pattern for Phase 6. Phaser scenes deferred to Phase 8 (Tier 2).

---

## Area 2: Backend State & Anti-Cheat

**Question:** Do we need the Energy Sandbox pattern for Tier 1?

**Findings:**
- Sandbox pattern requires: `minigame_sandboxes` table, `rewardsHash` HMAC, `start` + `complete` endpoints with delta verification
- Tier 1 rewards are small: +50/+100 commits, -10/-20 depression
- Cooldown enforcement is the primary gate

**Decision:** Skip Energy Sandbox for Tier 1. Use simple cooldown validation + score plausibility check. If score > max_possible, reject.

---

## Area 3: Cooldown Implementation

**Question:** How to store and enforce cooldowns?

**Options discussed:**
1. New `minigame_cooldowns` table — overkill for 2 games
2. `progression.minigame_state JSONB` — lightweight, no schema migration beyond adding column
3. Redis — not in stack

**Decision:** Use `progression.minigame_state JSONB`.

```json
{
  "hello_world": { "lastPlayedAt": "2026-05-22T10:00:00Z", "playsToday": 1 },
  "code_review": { "lastPlayedAt": "2026-05-22T08:00:00Z", "playsToday": 0 }
}
```

---

## Area 4: Level Gating

**Question:** How to gate mini-games by player level?

**Findings:**
- `player_levels` table exists with `rank` (1-5) and `level_in_rank`
- ROADMAP specifies: Hello World at level 2, Code Review at level 4
- Current `ensurePlayerLevel` returns resolved rank/level

**Decision:** Gate by `level.resolved.levelInRank >= requiredLevel`. Return `403` with clear message if under-leveled.

---

## Area 5: Tap Boost Reward (Code Review)

**Question:** How to implement +10% tap boost for 10 minutes?

**Findings:**
- Existing `commitBoostPercent` exists in balance config for pass rewards
- Could reuse `progression.inventory` or add `active_effects JSONB`

**Decision:** Store tap boost in `progression` as `active_effects` JSONB:
```json
{ "tapBoost": { "percent": 10, "expiresAt": "2026-05-22T10:10:00Z" } }
```
- Check in `tap.js` `calculateTapDelta` if active effect exists and not expired
- Clean up expired effects on state load

---

## Area 6: UI Placement

**Question:** Where do players access mini-games?

**Findings:**
- StatsBar has a 🐛 button gated by `featureFlags.minigameEnabled`
- Currently opens `MiniGameDebug` modal

**Decision:** Replace single 🐛 button with a "🎮 Мини-игры" button that opens a mini-game launcher panel. From there, player selects Hello World or Code Review. Show cooldown timers and level locks inline.

---

## Decisions Summary

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | React overlay, not Phaser scenes | Faster MVP, proven pattern |
| 2 | Skip Energy Sandbox | Small rewards, cooldown is primary gate |
| 3 | `minigame_state JSONB` in progression | Lightweight, no new tables |
| 4 | Level gate by `levelInRank` | Simple, uses existing data |
| 5 | `active_effects JSONB` for tap boost | Reusable pattern for future buffs |
| 6 | Mini-game launcher panel | Clean UX, scales to more games |
