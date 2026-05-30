# Phase 2: Visual Foundation & Atmosphere - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 2-Visual Foundation & Atmosphere
**Areas discussed:** Asset pipeline, Character pose system, Random event architecture, UI pixel-art consistency, Resource animations, Event gameplay impact, Phaser → Preact event bridge, BootScene loading order

---

## Asset pipeline — Code-drawn vs. external sprites

| Option | Description | Selected |
|--------|-------------|----------|
| Keep code-drawn | Continue generating textures programmatically via Phaser Graphics. Fastest iteration, zero pipeline overhead, but limits art complexity. | |
| Introduce external sprite sheets (Recommended) | Add PNG sprite sheets loaded in BootScene. Enables real 16-bit pixel art with frames/animations. Requires asset folder + preload pipeline, but unlocks character poses and rich effects. | ✓ |
| Hybrid | Code-drawn for simple shapes + external PNG sprites for character poses and complex animations. More moving parts but balances iteration speed with visual depth. | |

**User's choice:** Introduce external sprite sheets (Recommended)
**Notes:** User also selected: 64×64 base scale 2×, horizontal frame strips, external for all game world visuals, preload all in BootScene, code-drawn fallbacks, color tint overlays for skins, placeholder sprites in Phase 2.

---

## Character pose system — Static swap vs. animated frames

| Option | Description | Selected |
|--------|-------------|----------|
| Discrete swap on threshold crossing (Recommended) | Instantly swap sprite frame when depression crosses 30% or 70%. Simplest implementation, clearest player feedback, zero transition complexity. | ✓ |
| Smooth crossfade transition | Crossfade between poses over 1–2 seconds using two overlapping sprite layers or a shader. More polished look, but adds rendering complexity. | |
| Animated transition sequence | Play a brief transition animation when crossing thresholds. Most expressive and narrative, but needs extra animation frames per transition. | |

**User's choice:** Discrete swap on threshold crossing (Recommended)
**Notes:** User also selected: static frame per pose, universal squish on all poses, pose logic in GameScene.update().

---

## Random event architecture — Phaser scene vs. game manager

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated EventManager class (Recommended) | Standalone class handles timer, event selection, weighting, and triggering. Clean separation from GameScene, unit testable, easy to add new event types. | ✓ |
| Inside GameScene | Timer and event logic live directly in GameScene.update(). Simplest for Phase 2, but bloats the scene as events grow. | |
| Preact UI layer | React/store layer manages timers and triggers Phaser effects via window events. Keeps logic in one layer, but adds cross-layer complexity. | |

**User's choice:** Dedicated EventManager class (Recommended)
**Notes:** User also selected: random interval 30–90s, pure random selection, Preact toast banners.

---

## UI pixel-art consistency — Preact styling vs. Phaser UI

| Option | Description | Selected |
|--------|-------------|----------|
| CSS pixel-art theme system (Recommended) | Reusable CSS classes that enforce pixel borders, blocky shadows, pixel fonts, limited palette. Scales well as new screens are added. | ✓ |
| Inline style updates per component | Update each component's inline style object to match pixel aesthetic. No new CSS files, but duplicates style logic. | |
| Move UI into Phaser | Render all HUD and buttons inside Phaser instead of Preact. Most visually consistent, but massive rewrite of existing UI. | |

**User's choice:** CSS pixel-art theme system (Recommended)
**Notes:** User also selected: pixel web font (Press Start 2P), pixel borders + block shadows, snap animations, new CSS file with utility classes, extend existing dark theme, all screens in Phase 2, scale with viewport.

---

## Resource animations — sparks, tremor, bug rain, crash

| Option | Description | Selected |
|--------|-------------|----------|
| Phaser particle emitters (Recommended) | Use Phaser's built-in particle system for all effects. Already used in GameScene for commits and steam. Consistent and performant. | ✓ |
| Sprite-based frame animations | Each effect is a frame-based sprite animation. More artist-controlled, but needs additional sprite sheets. | |
| Hybrid — particles + DOM overlays | Phaser particles for localized effects, DOM/CSS overlays for full-screen effects. Splits rendering but easy full-screen coverage. | |

**User's choice:** Phaser particle emitters (Recommended)
**Notes:** User also selected: continuous state-based triggering, binary on/off per threshold, crash = screen flash + explosion + shake, multiple effects can run simultaneously, mobile-safe ~200 particle budget, existing game palette, subtle SFX.

---

## Event gameplay impact

| Option | Description | Selected |
|--------|-------------|----------|
| Purely atmospheric — no gameplay impact (Recommended) | Events are humorous flavor text only. No energy, depression, or commit changes. Keeps economy predictable. | ✓ |
| Tiny random fluctuations | Each event causes small ±1–5 changes to energy or depression. Adds life but risks imbalance. | |
| Mixed — some flavor, some impact | Most events are flavor-only, but 1–2 have tiny effects. Adds variety but requires per-event tuning. | |

**User's choice:** Purely atmospheric — no gameplay impact (Recommended)
**Notes:** User also selected: no interaction (auto-dismiss), Russian ironic/humorous tone, fixed 6s duration replace on overlap.

---

## Phaser → Preact event bridge

| Option | Description | Selected |
|--------|-------------|----------|
| window.__PHASER_GAME__.events.emit() (Recommended) | Use existing Phaser event emitter already exposed on window. Preact listens via useEffect. Follows existing tap bridge pattern. | ✓ |
| Native DOM CustomEvent | EventManager dispatches CustomEvent on document. Decouples from Phaser, standard web pattern. | |
| Shared state store | EventManager writes to shared state object. Preact subscribes. Most decoupled, but adds state management dependency. | |

**User's choice:** window.__PHASER_GAME__.events.emit() (Recommended)
**Notes:** User also selected: simple string + type payload, Preact manages toast lifecycle, informal string constants for validation.

---

## BootScene loading order

| Option | Description | Selected |
|--------|-------------|----------|
| Generate fallbacks first, then load sprites, swap on success (Recommended) | BootScene creates code-drawn textures as baseline, then attempts sprite loads. Game always starts with valid textures. | ✓ |
| Load sprites first, fallbacks only on failure | Attempt external loads first. Only generate fallback for failed loads. Faster when all succeed, slower when things fail. | |
| Parallel generation + loading | Generate fallbacks and load sprites simultaneously. Fastest boot time, but race conditions possible. | |

**User's choice:** Generate fallbacks first, then load sprites, swap on success (Recommended)
**Notes:** User also selected: simple loading text in Preact overlay, emit 'boot_complete' on finish, silent fallback on errors.

---

## Claude's Discretion

- Exact particle emitter parameters (spawn rate, lifespan, velocity) — implementer decides based on mobile performance budget.
- Specific pixel font choice — Press Start 2P recommended but any readable pixel font acceptable.
- Exact CSS breakpoint values for responsive scaling — implementer tunes per device testing.
- Event banner pixel styling details — implementer decides within pixel-border + block-shadow constraint.

## Deferred Ideas

- Final pixel art assets — deferred to Phase 9–10
- Skin-specific sprite variations — deferred to Phase 9–10
- Pose-specific tap reactions — deferred
- Animated pose idle loops — deferred
- Event interaction / gameplay impact — deferred
- Gradual resource effect intensity — deferred
- Phaser in-world event effects — deferred
