# Phase 02 — UI Review

**Audited:** 2026-05-23
**Baseline:** 02-UI-SPEC.md (approved 2026-05-21)
**Screenshots:** not captured (no dev server)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Event copy excellent; emoji in buttons violates spec |
| 2. Visuals | 2/4 | LoadingOverlay built but never rendered; pixel-button shadow backwards |
| 3. Color | 2/4 | pixel-theme.css correct; components riddled with off-palette hardcodes |
| 4. Typography | 2/4 | font-weight:bold used throughout (prohibited); event toast sizes off |
| 5. Spacing | 3/4 | 2px grid mostly followed; odd-pixel padding in ad/coffee buttons |
| 6. Experience Design | 3/4 | Error/disabled states present; event toast lacks double-tap guard |

**Overall: 15/24**

---

## Top 3 Priority Fixes

1. **Wire LoadingOverlay into App.jsx** — Component exists but is imported and never rendered (`App.jsx:14` imports it, JSX omits it). Users see blank canvas during BootScene instead of themed "ЗАГРУЗКА" screen. Add `h(LoadingOverlay, { visible: !gameReady })` to AppInner return.

2. **Fix `.pixel-button` box-shadow in pixel-theme.css** — Default state has no shadow; `:active` incorrectly *adds* `box-shadow: 2px 2px 0` instead of reducing an existing one. Per spec, default should be `box-shadow: 4px 4px 0 #0f172a` and active should reduce it. This breaks the pressed-button look for every pixel button in the app.

3. **Remove `font-weight: bold` from StatsBar.jsx and TapArea.jsx** — UI-SPEC explicitly prohibits bold: "No font-weight bold — Press Start 2P is inherently heavy; use color or size contrast for hierarchy." Found on commits count (`StatsBar.jsx:287`), energy value (`StatsBar.jsx:598`), depression value (`StatsBar.jsx:675`), warning text (`StatsBar.jsx:703`), tap button (`TapArea.jsx:323`).

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**Strengths:**
- Event titles are ALL CAPS and dramatic: "ПРОД БАЗА УПАЛА", "404: SLEEP NOT FOUND" (`EventManager.js:6,27`)
- Descriptions use second-person sarcasm: "Кажется, кто-то деплоил в пятницу." (`EventManager.js:7`)
- CTA labels follow imperative/dry-acceptance pattern: "РЕШИТЬ" / "ИГНОРИРОВАТЬ", "ШЕРИТЬ" / "НЕ МОЁ" (`EventManager.js:8,9,15,16`)
- Loading text uses retro trope "ЗАГРУЗКА" (`LoadingOverlay.jsx:37`)
- No corporate speak detected in new Phase 2 strings

**Findings:**
- **WARNING — Emoji in buttons:** UI-SPEC Copywriting Contract states "No emoji in buttons (emoji OK in toasts and titles)." StatsBar.jsx icon-only buttons use emoji (📋, 🛒, 🔗, ⚔️, 🏆, ⚡, 🎯, 🎖️, 👥, 🛡️, 🎨, 🎭, 🐛) with no text fallback (`StatsBar.jsx:313,325,336,347,358,369,380,392,424,435,446,457,468,487`). TapArea.jsx button text contains emoji (`TapArea.jsx:152-155`). These existed pre-Phase 2 but were in scope for pixel-theme application.
- **MINOR — Loading text omits ellipsis:** Spec says "ЗАГРУЗКА..."; component renders "ЗАГРУЗКА" + blinking "_" span. Functionally equivalent but not exact contract copy.

### Pillar 2: Visuals (2/4)

**Findings:**
- **BLOCKER-ADJACENT — LoadingOverlay never rendered:** `App.jsx:14` imports `LoadingOverlay` but it never appears in the JSX return. The `gameReady` state is managed but only used for `TapArea.active`. Acceptance criteria P02-W1-T4 #1 ("AppInner показывает LoadingOverlay компонент пока `gameReady === false`") is not met.
- **WARNING — pixel-button shadow reversed:** `pixel-theme.css:20-42` defines `.pixel-button` with no `box-shadow`, and `.pixel-button:active` adds `box-shadow: 2px 2px 0 #0f172a`. The spec says active should *reduce* the shadow, implying default must have `box-shadow: 4px 4px 0 #0f172a`. Every button in the app lacks the block shadow until pressed, at which point it incorrectly gains one.
- **WARNING — No hover state on pixel-button:** Spec requires "Hover: background shifts to `#1e4d7b`; border brightens one step." No `:hover` rule exists in `pixel-theme.css`.
- **WARNING — Icon-only buttons lack accessibility:** All 14 toolbar buttons in StatsBar are emoji-only with no `aria-label` or tooltip. Users relying on screen readers cannot determine button purpose.
- **WARNING — Achievement badge is round:** `StatsBar.jsx:402` uses `borderRadius: '50%'` for the unseen-achievements red dot. Pixel-art contract requires sharp corners (`border-radius: 0`). The user-photo avatar is correctly exempted per spec.
- **WARNING — Minigame button breaks pixel theme:** `StatsBar.jsx:476-488` renders the minigame button with `borderRadius: '8px'`, `border: '1px solid ...'`, `fontWeight: 600` — none of which conform to `.pixel-button`. It doesn't use the class at all.
- **WARNING — TapArea depression classes use non-palette colors:** Inline `<style>` block (`TapArea.jsx:219-238`) defines `.depression-low { background: #FFD700 }`, `.depression-med { background: #FF8C00 }`, `.depression-high { background: #DC143C }`, `.depression-burnout { background: #2F2F2F; color: #FF0000 }`. These are hardcoded and don't match the semantic palette.
- **MINOR — TapArea ripple is round:** Ripple effect uses `borderRadius: '50%'` (`TapArea.jsx:335`). Acceptable for a fluid feedback effect, but note as deviation from sharp-corner discipline.

### Pillar 3: Color (2/4)

**Strengths:**
- `pixel-theme.css` palette exactly matches UI-SPEC declarations (dominant `#1a1a2e`, secondary `#16213e`, surface `#0f3460`, accents `#4ade80` / `#f87171` / `#60a5fa` / `#fbbf24`)
- RandomEventToast uses correct gold `#fbbf24` for title and timer bar
- LoadingOverlay uses correct background `#1a1a2e` and text `#e2e8f0`

**Findings:**
- **WARNING — Extensive off-palette hardcodes in StatsBar:**
  - Toast backgrounds: `linear-gradient(90deg, #1a3f25, #2d5a3e)` and similar gradients (`StatsBar.jsx:822,827,831`) — not in palette.
  - Error banner: `#3f1a1a` bg, `#5a2d2d` border (`StatsBar.jsx:796,800`) — not in palette.
  - Ad button: `#30527e` border, `#0f3460` bg (`StatsBar.jsx:756,757`) — border not in palette.
  - Coffee button: `#5a3e2d` border, `#2d2a1a` bg (`StatsBar.jsx:774,775`) — not in palette.
  - Energy countdown label: `#6b7f99` (`StatsBar.jsx:734`) — muted text should be `#94a3b8`.
  - Rank badge gradients: `linear-gradient(135deg, #30527e, #4a7ab8)` etc. (`StatsBar.jsx:129-133`) — decorative gradients outside palette.
- **WARNING — TapArea uses non-palette colors:**
  - Exhausted tap zone: `radial-gradient(circle at 40% 40%, #3a2a2a, #2a1a1a)` (`TapArea.jsx:297`) — not in palette.
  - Burnout tap zone: `rgba(255, 69, 0, 0.5)` (`TapArea.jsx:299`) — `#ff4500` not in palette.
  - Depression classes as noted in Pillar 2 use `#FFD700`, `#FF8C00`, `#DC143C`, `#2F2F2F`, `#FF0000`.
- **MINOR — GameScene depression overlay uses dark reds:** `0x8b0000`, `0x2a0000`, `0x550000` (`GameScene.js:352,354,360`). These are intentionally darkened for vignette effect; acceptable as atmospheric exceptions but should be documented.

### Pillar 4: Typography (2/4)

**Strengths:**
- Press Start 2P is correctly applied via Google Fonts import with Courier New fallback (`pixel-theme.css:1,7`)
- All new Phase 2 components use the correct font stack

**Findings:**
- **WARNING — font-weight:bold prohibited but used:** UI-SPEC Typography Rules: "No font-weight bold — Press Start 2P is inherently heavy; use color or size contrast for hierarchy." Violations:
  - `StatsBar.jsx:270` — streak days count
  - `StatsBar.jsx:287` — commits count
  - `StatsBar.jsx:598` — energy value
  - `StatsBar.jsx:675` — depression value
  - `StatsBar.jsx:703` — low-energy warning
  - `StatsBar.jsx:717` — high-stress warning
  - `TapArea.jsx:323` — tap button text
- **WARNING — RandomEventToast font sizes off-contract:**
  - Title is `fontSize: "11px"` (`RandomEventToast.jsx:59`); spec says 12px.
  - Description is `fontSize: "9px"` (`RandomEventToast.jsx:75`); spec says 10px minimum for body.
- **WARNING — LoadingOverlay letter-spacing violation:** `letterSpacing: "2px"` (`LoadingOverlay.jsx:34`). Spec says "Letter-spacing: 0 (font-native spacing)" for pixel-text.
- **MINOR — Floating code text uses generic 'monospace':** `GameScene.js:221` uses `fontFamily: 'monospace'` for code snippets. Spec says "Code line: Courier New, 10px". Acceptable fallback but not exact.

### Pillar 5: Spacing (3/4)

**Strengths:**
- pixel-theme.css tokens match the 2px grid exactly (padding 16px, 8px 16px, 4px 8px, etc.)
- RandomEventToast spacing is grid-aligned (margins 8px, 12px; gap 8px)
- StatsBar gaps are mostly multiples of 2 (8px, 6px, 10px, 4px)

**Findings:**
- **WARNING — Odd-pixel padding in buttons:**
  - Ad button: `padding: "3px 8px"` (`StatsBar.jsx:754`) — 3px is not a multiple of 2.
  - Coffee button: `padding: "3px 8px"` (`StatsBar.jsx:772`) — 3px is not a multiple of 2.
  - Achievement badge: `padding: '0 3px'` (`StatsBar.jsx:410`) — 3px is not a multiple of 2.
- **WARNING — StatsBar progress bars don't use pixel-progress classes:** `pixel-theme.css:112-123` defines `.pixel-progress` and `.pixel-progress__bar`, but StatsBar uses inline-styled divs. This means the `step-end` transition and 8px height from the class system are ignored; instead, bars use `height: "6px"` / `height: "8px"` with `ease` transitions (`StatsBar.jsx:522,575,652`).
- **MINOR — TapArea container padding is 14px:** Multiple of 2 ✅, but not a declared token value (px-4 = 16px would be closer to standard).

### Pillar 6: Experience Design (3/4)

**Strengths:**
- Loading state component exists (even if unwired)
- Error state banner in StatsBar (`StatsBar.jsx:788-805`)
- TapArea handles exhausted state with `cursor: not-allowed` and opacity reduction
- Ad button has disabled state with loading text
- EventManager timer correctly schedules 30-90s intervals
- RandomEventToast auto-dismisses on timeout and calls `onChoice('ignore')`
- GameScene applies event deltas with clamping and shows result toast via App.jsx bridge
- Crash effect triggers once per collapse cycle with flash + debris + shake

**Findings:**
- **WARNING — RandomEventToast lacks double-tap protection:** `handleSolve` and `handleIgnore` (`RandomEventToast.jsx:25-33`) call `onChoice` immediately without setting a local `choosing` state. A rapid double-tap could emit two `event_choice` events. No visual disabled state is shown during choice processing.
- **WARNING — No ErrorBoundary in App.jsx:** The root App component has no error boundary. A render error in any child (e.g., StatsBar, TapArea, RandomEventToast) would unmount the entire Preact tree.
- **WARNING — GameScene.onResize restarts the entire scene:** `onResize` calls `this.scene.restart()` (`GameScene.js:333`). On mobile keyboard open/close or orientation change, this destroys and recreates all emitters, tweens, and the EventManager. Could cause state loss or event timer reset.
- **MINOR — Event result toast doesn't show eventId deduplication:** App.jsx constructs a result toast (`App.jsx:131-140`) but doesn't verify the eventId hasn't already been processed. Backend sync is deferred; if the user taps rapidly, multiple toasts could stack.

---

## Files Audited

| File | Status | Key Issues |
|------|--------|------------|
| `frontend/src/assets/pixel-theme.css` | Created | Missing default box-shadow on `.pixel-button`; no `:hover` state |
| `frontend/src/components/LoadingOverlay.jsx` | Created | Never rendered in App.jsx; `letterSpacing: 2px` violates spec |
| `frontend/src/components/RandomEventToast.jsx` | Created | Title 11px (spec 12px); desc 9px (spec 10px); no double-tap guard |
| `frontend/src/game/EventManager.js` | Created | Clean implementation; no UI issues |
| `frontend/src/game/scenes/BootScene.js` | Modified | Correct fallback textures + external loading |
| `frontend/src/game/scenes/GameScene.js` | Modified | `scene.restart()` on resize is aggressive; tremor uses raw `setInterval` |
| `frontend/src/game/PhaserGame.js` | Modified | `pixelArt: true`, `antialias: false`, `roundPixels: true` ✅ |
| `frontend/src/components/StatsBar.jsx` | Modified | font-weight:bold ×6; odd-pixel padding; round badge; off-palette colors |
| `frontend/src/components/TapArea.jsx` | Modified | font-weight:bold; non-palette depression colors; inline style block |
| `frontend/src/hooks/useGameState.js` | Modified | `applyEventDeltas` correctly clamps values ✅ |
| `frontend/src/App.jsx` | Modified | LoadingOverlay imported but omitted from JSX |
| `frontend/src/assets/animations.css` | Modified | `pixel-blink` keyframe added ✅ |
| `frontend/src/main.jsx` | Modified | Imports `pixel-theme.css` ✅ |
| `frontend/index.html` | Modified | No preconnect to fonts.googleapis.com; body font is Courier New not Press Start 2P |
