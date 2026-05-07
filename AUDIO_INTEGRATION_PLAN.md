# Audio Pack Integration Plan

> **Status:** Staged (files copied, no runtime wiring yet)  
> **Date:** 2026-05-07  
> **Constraint:** No autoplay music. No backend changes. Phased rollout only.

---

## 1. File Mapping

### 1.1 Copied as-is (no code changes needed)

| Source (Audio Pack) | Destination | Purpose |
|---------------------|-------------|---------|
| `src/utils/AudioManager.js` | `frontend/src/utils/AudioManager.js` | Singleton audio controller (Web Audio API + HTMLAudioElement) |
| `src/utils/SFX_REGISTRY.js` | `frontend/src/utils/SFX_REGISTRY.js` | Registry of 14 programmatic SFX |
| `src/utils/sfx/core.js` | `frontend/src/utils/sfx/core.js` | tap, critical, push, typing |
| `src/utils/sfx/progression.js` | `frontend/src/utils/sfx/progression.js` | levelup, questDone, streakBreak |
| `src/utils/sfx/actions.js` | `frontend/src/utils/sfx/actions.js` | purchase, bugSuccess, bugFail |
| `src/utils/sfx/states.js` | `frontend/src/utils/sfx/states.js` | energy0, burnout, gameover, modalOpen |
| `src/components/AudioSettings.css` | `frontend/src/components/AudioSettings.css` | Mute button styles |
| `public/audio/bgm_main.ogg` | `frontend/public/audio/bgm_main.ogg` | Main menu BGM (196 KB) |
| `public/audio/bgm_legacy.ogg` | `frontend/public/audio/bgm_legacy.ogg` | Legacy track (227 KB) |
| `public/audio/bgm_hackathon.ogg` | `frontend/public/audio/bgm_hackathon.ogg` | Hackathon event BGM (298 KB) |
| `public/audio/bgm_coffee.ogg` | `frontend/public/audio/bgm_coffee.ogg` | Coffee break BGM (157 KB) |
| `public/audio/music_manifest.json` | `frontend/public/audio/music_manifest.json` | BGM metadata |
| `assets/audio_manifest.json` | `frontend/public/audio/audio_manifest.json` | SFX metadata |
| `assets/LICENSES.md` | `frontend/public/audio/LICENSES.md` | Licensing info |

### 1.2 Adapted (minor changes)

| Source | Destination | Change | Rationale |
|--------|-------------|--------|-----------|
| `src/components/AudioSettings.jsx` | `frontend/src/components/AudioSettings.jsx` | Import changed from `'react'` to `'preact/hooks'` | Codebase convention; `vite.config.js` already aliases `react` to `preact/compat`, but explicit import is safer |

### 1.3 Skipped (not needed or redundant)

| Source | Reason |
|--------|--------|
| `src/utils/HapticManager.js` | **Redundant.** Existing `frontend/src/hooks/useTelegram.js` already exports `haptic(type)`. We will augment existing call sites with `audioManager.play()` instead of replacing the hook. |
| `public/audio/sfx_coffee.ogg` | **File missing from delivery.** Not in `Kimi_Agent_АудиоСварм/public/audio/` directory (only mentioned in delivery report). Even if present, no coffee mechanic exists in game. |
| `docs/AUDIO_QA_REPORT.md` | Internal QA doc; not needed in repo. |
| `plan.md` | Superseded by this document. |
| `AUDIO_SWARM_DELIVERY_REPORT.md` | Delivery report; not needed in repo. |

---

## 2. Runtime Risk Assessment

| Risk | Severity | Mitigation | Status |
|------|----------|------------|--------|
| **Autoplay / AudioContext resume** | Medium | `AudioManager.init()` is lazy — called only on first user gesture. No automatic playback on load. | **Handled by design** |
| **BGM autoplay blocked** | Medium | `playBGM()` is gated behind user gesture in all phases. Phase 3 requires explicit opt-in. | **Handled by design** |
| **Bundle size** | Low | JS audio code ~50 KB minified. BGM assets ~878 KB loaded on demand. Total initial bundle impact <20 KB. | **Acceptable** |
| **Telegram Mini App limits** | Low | All assets are OGG + JSON, well under Telegram 10 MB limit. Vercel edge caching OK. | **Acceptable** |
| **iOS Safari `createMediaElementSource`** | Low | `_playFileSFX()` uses `createMediaElementSource` with `<audio>`. On iOS, keep a strong reference to the element until playback finishes (current code does). | **Low risk** |
| **Burnout loop annoyance** | Medium | `_startBurnoutLoop()` repeats every 2s when depression >80%. Must be wired to actual game state (`window.__GAME_STATE__?.depression`). Do NOT auto-trigger on high stress alone — only when burnout modal is active. | **Requires careful trigger mapping** |
| **Missing mechanics for some SFX** | Low | `bugSuccess`, `bugFail`, `typing`, `push`, `coffee`, `gameover` assume mechanics that don't exist yet. These SFX are harmless if never called. | **No runtime risk** |
| **HapticManager conflict** | Low | Skipped entirely. Existing `useTelegram().haptic()` remains untouched. | **Resolved** |
| **Tab visibility / BGM resume** | Medium | No `visibilitychange` handler in AudioManager yet. Phase 3 must add pause/resume on `document.hidden`. | **To be addressed in Phase 3** |

---

## 3. Phased Rollout Plan

### Phase 1 — SFX Only (Target: immediate)
**Goal:** Add subtle sound feedback to existing interactions. No BGM. No settings UI yet.

**Files enabled:**
- `frontend/src/utils/AudioManager.js`
- `frontend/src/utils/SFX_REGISTRY.js`
- `frontend/src/utils/sfx/*.js`

**Integration points:**
1. `frontend/src/main.jsx`
   - Add `window.addEventListener('pointerdown', () => audioManager.init().catch(() => {}), { once: true });` inside the app mount.
   - This unlocks Web Audio on first tap without playing anything.
2. `frontend/src/components/TapArea.jsx`
   - After existing `haptic('light')`, add `audioManager.play('tap')`.
3. `frontend/src/components/LevelUpModal.jsx`
   - On open, add `audioManager.play('levelup')`.
4. `frontend/src/components/StatsBar.jsx`
   - When shop/quests/panels open (if tracked), add `audioManager.duckBGM()` / `audioManager.resumeBGM()` — safe even if no BGM is playing.

**Acceptance criteria:**
- [ ] First tap unlocks audio context silently.
- [ ] Every tap plays a subtle click.
- [ ] Level-up plays an arpeggio.
- [ ] No console errors from audio code.
- [ ] Gameplay logic is unchanged.
- [ ] Works in Telegram WebApp on iOS and Android.

---

### Phase 2 — Settings UI (Target: after Phase 1 validated)
**Goal:** Let users mute/unmute. Still no BGM.

**Files enabled:**
- `frontend/src/components/AudioSettings.jsx`
- `frontend/src/components/AudioSettings.css`

**Integration points:**
1. Render `<AudioSettings />` inside `frontend/src/main.jsx` or `StatsBar.jsx` (e.g., next to the profile button).
2. Ensure `audioManager.isMuted()` default is `false` (unmuted).

**Acceptance criteria:**
- [ ] Mute button visible in HUD.
- [ ] Clicking toggles audio on/off immediately.
- [ ] Mute state persists across page reloads (`localStorage` key `cs_muted`).
- [ ] When muted, SFX are silent.
- [ ] Works on mobile.

---

### Phase 3 — Background Music (Target: after Phase 2 stable)
**Goal:** Add looping BGM, context-aware track switching, ducking.

**Files enabled:**
- `frontend/public/audio/bgm_*.ogg`
- `frontend/public/audio/music_manifest.json`

**Integration points:**
1. `frontend/src/main.jsx` or `GameScene.js`
   - After first user gesture, call `audioManager.playBGM('bgm_main')`.
   - Gate behind a user setting (e.g., default BGM off; first tap shows "Enable music?" prompt).
2. State-driven track switching:
   - Hackathon event active → `audioManager.playBGM('bgm_hackathon')`.
   - (No coffee mechanic yet → `bgm_coffee` unused.)
3. `document.addEventListener('visibilitychange', ...)`:
   - Pause BGM when `document.hidden === true`.
   - Resume when returning (if not muted).
4. Modal open/close ducking:
   - Already wired in Phase 1 via `duckBGM()` / `resumeBGM()`.

**Acceptance criteria:**
- [ ] BGM starts only after explicit user opt-in.
- [ ] BGM loops seamlessly.
- [ ] BGM pauses when app is backgrounded.
- [ ] Mute stops BGM immediately.
- [ ] Track switching has no overlap or gaps.
- [ ] Ducking lowers volume during modals.
- [ ] No autoplay violations in browser console.

---

## 4. Verdict

**Verdict: PARTIALLY USABLE** ✅ (with phased rollout)

- **AudioManager + SFX_REGISTRY:** Production-ready. Can be staged immediately.
- **BGM tracks:** Production-ready but must be gated behind explicit user opt-in.
- **HapticManager:** Redundant — do not use.
- **Some SFX:** Map to non-existent mechanics (`bugSuccess`, `typing`, `push`, `coffee`, `gameover`). They are harmless if not wired.
- **Burnout loop:** Needs careful trigger mapping to actual game state.

**Total staged footprint:** ~897 KB assets + ~59 KB JS source.
**Not wired to any components yet.** No runtime impact until integration code is added per Phase 1.

---

## 5. Quick Integration Snippets

### 5.1 Unlock audio on first gesture (`main.jsx`)
```js
import { audioManager } from './utils/AudioManager.js';

// Inside App or mount logic:
const unlockAudio = () => audioManager.init().catch(() => {});
window.addEventListener('pointerdown', unlockAudio, { once: true });
```

### 5.2 Play tap sound (`TapArea.jsx`)
```js
import { audioManager } from '../utils/AudioManager.js';

// Inside tap handler, after haptic:
audioManager.play('tap');
```

### 5.3 Play level-up sound (`LevelUpModal.jsx`)
```js
import { audioManager } from '../utils/AudioManager.js';

// On modal open:
audioManager.play('levelup');
```

### 5.4 Haptic + audio together (existing `useTelegram.js` pattern)
```js
// Instead of importing HapticManager, keep existing hook:
const { haptic } = useTelegram();

// In component:
const onTap = () => {
  haptic('light');
  audioManager.play('tap');
};
```

---

## 6. Licensing

All audio assets and programmatic SFX in this pack are **CC0 / Public Domain**.
No attribution required. Safe for commercial production.

See `frontend/public/audio/LICENSES.md` for per-file details.
