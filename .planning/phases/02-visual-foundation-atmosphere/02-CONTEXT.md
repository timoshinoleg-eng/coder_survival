# Phase 2: Visual Foundation & Atmosphere - Context

**Gathered:** 2026-05-21  
**Updated:** 2026-05-21 (corrected per user decision: events have gameplay impact)  
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the 16-bit pixel art identity and bring the world to life with **interactive random events that affect resources**. In scope: external sprite asset pipeline, character depression poses, resource-linked particle effects, **random event system with two-choice toasts affecting energy/depression/commits**, pixel-art CSS theme for all Preact UI screens. Out of scope: final pixel art (placeholders only), skin-specific sprites (tints only), Phaser in‑world event visuals, gradual intensity scaling, pose‑specific tap reactions.
</domain>

<decisions>
## Implementation Decisions

### Asset Pipeline
- **D-01:** External sprite sheets for all game world visuals. Zero external image assets currently exist; everything is code-drawn in BootScene.
- **D-02:** Base resolution 64×64, scaled 2× in Phaser. Existing avatar was 32×32 scaled 3×.
- **D-03:** Horizontal frame strips. Phaser `load.spritesheet(key, path, { frameWidth: 64, frameHeight: 64 })`.
- **D-04:** Preload all in BootScene before GameScene starts.
- **D-05:** Code-drawn fallback textures generated first, then external loads attempted. On failure, fallback remains. Silent fallback — no player-facing error.
- **D-06:** Color tint overlays for skins. Separate sprite variations deferred to Phase 9–10 premium skins.
- **D-07:** Placeholder sprites in Phase 2. Final art deferred to later phases.

### Character Pose System
- **D-08:** Three static poses based on depression: energetic (0–30%), tired (30–70%), collapsed (70–100%).
- **D-09:** Discrete frame swap on threshold crossing (30% and 70%). No transition animation.
- **D-10:** Static frames only — no idle loops within poses.
- **D-11:** Universal tap squish (scaleX/scaleY tween, 80ms) across all poses. Pose-specific reactions deferred.
- **D-12:** Pose selection logic lives in `GameScene.update()`.

### Random Event Architecture (with gameplay impact)
- **D-13:** Dedicated `EventManager` class. Not inside GameScene, not in Preact layer.
- **D-14:** Random interval 30–90 seconds between events. No depression weighting.
- **D-15:** Pure random selection among 4 event types. No cooldown weighting, no gating.
- **D-16:** **Events affect economy** — each event changes energy, depression, or commits. Two actions available: “Solve” (quick tap / choice → bonus or smaller penalty) and “Ignore” (base penalty).
- **D-17:** Events appear as Preact toast banners with two action buttons. Timer of **15 seconds** to choose; auto‑select “Ignore” on timeout.
- **D-18:** Payload includes `energyDelta`, `depressionDelta`, `commitsDelta` for each action.
- **D-19:** Preact communicates choice back to Phaser via event bridge, which then updates game state (through `useGameState` or direct backend call).
- **D-20:** Russian only, ironic/humorous tone. Short 1–2 line messages.

**Event effects table (examples):**

| Event | Ignore effect | Solve effect |
|-------|---------------|--------------|
| «Прод база упала» | –20 commits, +10 depression | +30 commits (quick tap 10 times in 3 sec), –5 depression |
| «Коллега прислал мем» | –5 depression, +5 energy | –15 depression, +10 energy (share meme) |
| «Менеджер: +1 дедлайн» | +25 depression | –10 depression (choose best answer from three) |
| «404: sleep not found» | –30 energy, +20 depression | +50 energy (play “Coffee” mini‑game – separate mechanic) |

### UI Pixel-Art Consistency
- **D-21:** New CSS file with utility classes: `frontend/src/assets/pixel-theme.css`. Classes like `.pixel-panel`, `.pixel-button`, `.pixel-text`.
- **D-22:** Pixel web font (e.g., Press Start 2P from Google Fonts).
- **D-23:** Pixel borders + block shadows: sharp 2px borders, no border-radius, hard 2px drop shadows, flat colors.
- **D-24:** Snap animations only — instant or 2–3 step discrete transitions. No CSS easing.
- **D-25:** Extend existing dark theme colors. No dedicated 16-bit palette.
- **D-26:** All existing Preact screens get the pixel treatment in Phase 2.
- **D-27:** Scale with viewport using CSS vmin/vmax and media queries.

### Resource Animations (VISU-03)
- **D-28:** Phaser particle emitters for all four effects: code sparks (high energy), tremor (low energy), bug-report rain (≥75% depression), crash (100%).
- **D-29:** Continuous state-based triggering. Emitters run while condition is met.
- **D-30:** Binary on/off per threshold. No gradual intensity scaling.
- **D-31:** Crash effect: white screen flash + debris particle explosion + camera shake (~500ms), then collapsed pose.
- **D-32:** Multiple effects can run simultaneously. Max ~200 active particles total across all emitters.
- **D-33:** Use existing game palette (greens for energy, reds for depression, whites for crash).
- **D-34:** Subtle SFX for effects. Must respect existing audio mute toggle.

### Phaser → Preact Event Bridge
- **D-35:** Use existing `window.__PHASER_GAME__.events.emit()` bridge. Preact listens via useEffect.
- **D-36:** Payload for events: `{ type: string, eventId: string, title: string, description: string, options: { solve: { energyDelta, depressionDelta, commitsDelta }, ignore: { ... } }, timeout: 15 }`.
- **D-37:** Preact manages toast lifecycle, timer, and sends user choice back via `window.__PHASER_GAME__.events.emit('event_choice', { eventId, action })`.
- **D-38:** Informal string constants for event types. Graceful fallback on unknown types.

### BootScene Loading
- **D-39:** Generate fallback textures first, then load external sprites, swap on success.
- **D-40:** Simple loading text in Preact overlay while BootScene runs.
- **D-41:** BootScene emits `'boot_complete'` when all textures ready. Preact hides loading overlay.

### Phase 1 Outcomes (already implemented, must not break)
- Energy recovery: 5‑minute threshold, toast on entry (`+X энергии восстановлено`).
- Depression economy v2 active: `stress_v2: true`, offer threshold 20%, passive decay 5/hour.
- Haptic feedback with fallback (`navigator.vibrate`).
- Floating code‑line text on each tap (Phaser Text + tween).
- Confetti on quest completion and Pass level‑up (reusable `Confetti` component).
- Numeric XP display in Pass panel.

### Claude's Discretion
- Exact particle emitter parameters (spawn rate, lifespan, velocity) — implementer decides based on the ~200 particle mobile budget.
- Specific pixel font choice — Press Start 2P recommended but any readable pixel font acceptable.
- Exact CSS breakpoint values for responsive scaling — implementer tunes per device testing.
- Event banner pixel styling details — implementer decides within the pixel-border + block-shadow constraint.
- Camera shake implementation — use `this.cameras.main.shake(500, 0.01)` for crash effect.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and roadmap
- `.planning/ROADMAP.md` — Phase 2 goal, success criteria, requirements mapped (VISU-01..03, TECH-05)
- `.planning/REQUIREMENTS.md` — VISU-01, VISU-02, VISU-03, TECH-05 definitions
- `.planning/PROJECT.md` — Core Value, Constraints, pixel-art 16-bit decision
- `.planning/phases/01-critical-fixes-core-loop-polish/01-CONTEXT.md` — Prior phase decisions
- `.planning/phases/01-critical-fixes-core-loop-polish/01-SUMMARY.md` — What was already implemented

### Codebase maps
- `.planning/codebase/STACK.md` — Frontend stack (Preact 10, Phaser 3.60, Vite 5)
- `.planning/codebase/CONCERNS.md` — Existing visual concerns

### Key source files
- `frontend/src/phaser/BootScene.js` — Texture generation, preload logic
- `frontend/src/phaser/GameScene.js` — Avatar rendering, pose logic, particle emitters, tap reactions
- `frontend/src/phaser/PhaserGame.js` — Phaser config (`pixelArt: true`, scale mode)
- `frontend/src/components/` — Preact UI components (all screens to receive pixel theme)
- `frontend/src/assets/animations.css` — Existing keyframe animations
- `frontend/index.html` — Base styles, font declarations

### Audio
- `frontend/public/audio/` — Existing BGM and SFX for reference levels
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phaser particle system** — Already used for commit sparkles and cup steam. Can be extended with new emitters for resource animations.
- **Phaser event bridge** — `window.__PHASER_GAME__.events.emit('tap', data)` already connects Preact to Phaser. Reuse for random event toasts and choices.
- **animations.css** — Existing keyframes (pulse, shake, fade-in-up) can be adapted or referenced for pixel-theme CSS.

### Established Patterns
- **Code-drawn textures via `this.make.graphics()`** — BootScene generates all textures programmatically. This becomes the fallback generation pattern.
- **Inline CSS-in-JS in Preact** — Every component uses `style` objects. The new pixel-theme.css introduces a class-based pattern that coexists with inline styles.
- **Skin tint system** — `GameScene.update()` applies `setTint(hex)` to the avatar. This pattern continues; skins remain color tints.

### Integration Points
- **BootScene → GameScene** — BootScene preloads then starts GameScene. Now extended with external sprite preloads + fallback generation.
- **Preact ↔ Phaser** — DOM overlay sits above canvas. New pixel-theme.css affects Preact layer; new sprites affect Phaser layer.
- **EventManager → Preact toast → GameState** — New cross-layer integration. EventManager emits event data; Preact shows interactive toast; user choice sent back to Phaser to update state (via backend call or local state sync).
- **Audio system** — Existing mute toggle and BGM/SFX pipeline. New resource effect SFX must respect the mute setting.

### Phase 1 Outcomes (must not break)
The following are already live and working. Any new code must preserve or reuse them:
- 5‑min energy recovery gate, toast on entry.
- `stress_v2: true`, depression threshold 20%, passive decay 5/hour.
- Haptic feedback (`light` impact) with `navigator.vibrate` fallback.
- Floating code line text (`GameScene.onTap`).
- Confetti component (`frontend/src/components/Confetti.jsx`) used in `DailyQuestsPanel` and `PassPanel`.
- Numeric XP in `PassPanel` (`nextLevelXp`, `remainingXp`).

</code_context>

<specifics>
## Specific Ideas

- Placeholder sprites should be visually distinct from final art so players (and developers) can tell them apart. Consider watermarked or flat-color placeholders.
- Event message examples with effects (Russian, humorous):
  - *Прод база упала* → Ignore: –20 коммитов, +10 стресса; Solve: быстрый тап 10 раз → +30 коммитов, –5 стресса.
  - *Коллега прислал мем* → Ignore: –5 стресса, +5 энергии; Solve: –15 стресса, +10 энергии.
  - *Менеджер: +1 дедлайн* → Ignore: +25 стресса; Solve: –10 стресса (выбор ответа).
  - *404 sleep not found* → Ignore: –30 энергии, +20 стресса; Solve: +50 энергии (мини-игра «Кофе»).
- Loading text in Preact should use the pixel font and pixel-border treatment to maintain consistency even during boot.
- The 200-particle budget should be enforced with a shared particle pool or manager to prevent runaway counts when multiple emitters are active.
- Camera shake for low‑energy tremor: `this.cameras.main.shake(200, 0.005)`; for crash: `shake(500, 0.01)`.
</specifics>

<deferred>
## Deferred Ideas

- **Final pixel art assets** — Real 16-bit art for character poses, props, and effects. Deferred to Phase 9–10.
- **Skin-specific sprite variations** — Unique art per skin (Office Cat, Rubber Duck, CTO). Deferred to Phase 9–10; Phase 2 uses tints only.
- **Pose-specific tap reactions** — Energetic jump, tired flinch, collapsed no-reaction. Deferred; Phase 2 uses universal squish.
- **Animated pose idle loops** — Breathing, twitching per pose. Deferred to later polish.
- **Phaser in-world event effects** — Visual scene changes for random events. Deferred; Phase 2 uses Preact toasts only.
- **Gradual resource effect intensity** — Rain density scaling with depression %. Deferred; Phase 2 uses binary on/off.
- **Event cooldown weighting** — Not needed for Phase 2; pure random is sufficient.
</deferred>

---

*Phase: 2-Visual Foundation & Atmosphere*  
*Context gathered: 2026-05-21*  
*Corrected for gameplay-impacting random events.*
