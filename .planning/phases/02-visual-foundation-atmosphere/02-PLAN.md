---
phase: "02"
name: "Visual Foundation & Atmosphere"
mode: mvp
tdd_mode: disabled
wave_count: 5
task_count: 20
depends_on:
  - "01"
files_modified:
  - frontend/src/game/scenes/BootScene.js
  - frontend/src/game/scenes/GameScene.js
  - frontend/src/game/PhaserGame.js
  - frontend/src/assets/pixel-theme.css
  - frontend/index.html
  - frontend/src/components/StatsBar.jsx
  - frontend/src/components/TapArea.jsx
  - frontend/src/components/ContextOfferBanner.jsx
  - frontend/src/components/CrunchTimeBanner.jsx
  - frontend/src/components/EventBanner.jsx
  - frontend/src/components/RandomEventToast.jsx
  - frontend/src/game/EventManager.js
  - frontend/src/hooks/useGameState.js
autonomous: false
---

# Phase 02 Plan: Visual Foundation & Atmosphere

**Цель:** Establish the 16-bit pixel art identity and bring the world to life with interactive random events that affect resources.

**Требования:** VISU-01, VISU-02, VISU-03, TECH-05

**Scope:** External sprite asset pipeline, character depression poses, resource-linked particle effects, random event system with two-choice toasts affecting energy/depression/commits, pixel-art CSS theme for all Preact UI screens.

**Out of scope:** Final pixel art (placeholders only), skin-specific sprites (tints only), animated idle loops, gradual intensity scaling.

---

## Wave 1: Asset Pipeline & BootScene Overhaul

### Зависимости
- Phase 1 complete (stable state/tap pipeline).
- Блокирует Wave 2 (GameScene sprites), Wave 3 (loading overlay), Wave 4 (event manager).

---

<task id="P02-W1-T1">
  <type>implementation</type>
  <title>Generate placeholder 64×64 pose sprite textures in BootScene</title>
  <requirement>VISU-01, VISU-02</requirement>
  <read_first>
    - frontend/src/game/scenes/BootScene.js
    - frontend/src/game/PhaserGame.js
  </read_first>
  <acceptance_criteria>
    1. BootScene.generateTextures() creates three 64×64 placeholder textures named `avatar_energetic`, `avatar_tired`, `avatar_collapsed`.
    2. Each texture is visually distinct: energetic = upright bright colors; tired = slouched muted colors; collapsed = horizontal dark colors.
    3. Textures use `this.make.graphics()` with fillStyle/fillRect patterns (no external assets).
    4. Existing textures (desk, monitor, cup, keyboard, commit, orb) remain unchanged.
    5. BootScene still calls `this.scene.start('GameScene')` after generation.
  </acceptance_criteria>
  <action>
    В BootScene.generateTextures() добавить 3 блока генерации:
    - avatar_energetic: 64×64, bright green hoodie, upright posture, awake eyes
    - avatar_tired: 64×64, muted blue hoodie, slouched, half-closed eyes
    - avatar_collapsed: 64×64, dark grey hoodie, horizontal on keyboard, X_X eyes
    Использовать fillStyle + fillRect для всех элементов.
  </action>
</task>

<task id="P02-W1-T2">
  <type>implementation</type>
  <title>Add external sprite loading with silent fallback in BootScene</title>
  <requirement>VISU-01</requirement>
  <read_first>
    - frontend/src/game/scenes/BootScene.js
    - frontend/src/game/PhaserGame.js
    - .planning/phases/02-visual-foundation-atmosphere/02-CONTEXT.md (D-01..D-07)
  </read_first>
  <acceptance_criteria>
    1. BootScene.preload() generates fallback textures FIRST, then attempts `this.load.spritesheet()` for external files.
    2. External load attempts: `assets/sprites/avatar.png` (64×64 frames, horizontal strip, 3 frames).
    3. On load failure, the code-drawn fallback textures remain active — no player-facing error.
    4. `this.load.on('loaderror', ...)` handler logs to console but does not block scene start.
    5. BootScene emits `'boot_complete'` event via `this.game.events.emit('boot_complete')` after all textures ready.
  </acceptance_criteria>
  <action>
    В BootScene:
    - Добавить preload() метод: вызывать generateTextures(), затем this.load.spritesheet('avatar_sheet', 'assets/sprites/avatar.png', { frameWidth: 64, frameHeight: 64 }).
    - Добавить обработчик ошибок загрузки.
    - В create() эмитировать 'boot_complete'.
    Создать директорию frontend/public/assets/sprites/ (если не существует).
  </action>
</task>

<task id="P02-W1-T3">
  <type>implementation</type>
  <title>Update PhaserGame config: roundPixels, antialias, pixelArt consistency</title>
  <requirement>VISU-01</requirement>
  <read_first>
    - frontend/src/game/PhaserGame.js
    - .planning/phases/02-visual-foundation-atmosphere/02-UI-SPEC.md (Phaser Rendering Contracts)
  </read_first>
  <acceptance_criteria>
    1. PhaserGame config: `roundPixels: true` (changed from false).
    2. PhaserGame config: `antialias: false` added explicitly.
    3. `image-rendering: pixelated` already present in index.html CSS — verify it remains.
    4. No visual regressions in existing tap/commit particle effects.
  </acceptance_criteria>
  <action>
    В frontend/src/game/PhaserGame.js:
    - Изменить roundPixels: false → true
    - Добавить antialias: false
  </action>
</task>

<task id="P02-W1-T4">
  <type>implementation</type>
  <title>Create pixel-art loading overlay in Preact</title>
  <requirement>VISU-01</requirement>
  <read_first>
    - frontend/src/App.jsx
    - frontend/src/game/PhaserGame.js
    - frontend/index.html
  </read_first>
  <acceptance_criteria>
    1. AppInner показывает LoadingOverlay компонент пока `gameReady === false`.
    2. LoadingOverlay: full-screen `#1a1a2e`, centered text "ЗАГРУЗКА..._" с Press Start 2P (или Courier New fallback).
    3. Курсор `_` мигает с CSS-анимацией pulse (800ms).
    4. Overlay скрывается с `opacity` transition (150ms) когда `gameReady` становится true.
    5. Не блокирует взаимодействие с canvas (pointer-events: none).
  </acceptance_criteria>
  <action>
    Создать inline LoadingOverlay в App.jsx или отдельный компонент frontend/src/components/LoadingOverlay.jsx.
    Стили: position absolute, z-index above canvas, pointer-events none.
    Текст: Press Start 2P через Google Fonts (добавить link в index.html как часть T5).
    Анимация курсора: CSS @keyframes blink.
  </action>
</task>

---

## Wave 2: Character Poses & Resource Particle Effects

### Зависимости
- Wave 1 (BootScene textures + boot_complete event stable).
- Может выполняться параллельно с Wave 3 и Wave 4.

---

<task id="P02-W2-T1">
  <type>implementation</type>
  <title>Refactor GameScene avatar to use spritesheet with 3 poses</title>
  <requirement>VISU-02</requirement>
  <read_first>
    - frontend/src/game/scenes/GameScene.js
    - frontend/src/game/scenes/BootScene.js
  </read_first>
  <acceptance_criteria>
    1. GameScene.create() создаёт avatar как `this.add.sprite()` вместо `this.add.image()`.
    2. Avatar использует key `'avatar_sheet'` если внешний спрайт загружен, иначе `'avatar_energetic'` (fallback).
    3. `this.avatar.setFrame(0)` on create.
    4. Существующий idle tween (floating) остаётся, применяется к sprite.
    5. Существующий skin tint logic в update() работает с новым sprite.
  </acceptance_criteria>
  <action>
    В GameScene.create():
    - Заменить this.add.image(cx, deskY - 90, 'avatar') на this.add.sprite(cx, deskY - 90, 'avatar_sheet').setScale(2).
    - Если avatar_sheet не загружен (проверить this.textures.exists), использовать 'avatar_energetic'.
    - Установить setFrame(0).
    - Убедиться, что setTint из update() работает.
  </action>
</task>

<task id="P02-W2-T2">
  <type>implementation</type>
  <title>Implement depression-based pose selection in GameScene.update()</title>
  <requirement>VISU-02</requirement>
  <read_first>
    - frontend/src/game/scenes/GameScene.js
    - frontend/src/hooks/useGameState.js (depression field)
  </read_first>
  <acceptance_criteria>
    1. В GameScene.update() добавлена логика pose selection на основе depression.
    2. Thresholds: 0–30% → frame 0 (energetic), 30–70% → frame 1 (tired), 70–100% → frame 2 (collapsed).
    3. Frame меняется ТОЛЬКО при пересечении threshold (не каждый кадр). Использовать prevPoseIndex для сравнения.
    4. При переходе в collapsed (70%+) — вызывается `this.cameras.main.shake(500, 0.01)` один раз (флаг crashTriggered предотвращает повтор).
    5. При переходе ОБРАТНО из collapsed в tired/energetic — crashTriggered сбрасывается.
  </acceptance_criteria>
  <action>
    В GameScene:
    - Добавить this.prevPoseIndex = 0 в create().
    - Добавить this.crashTriggered = false в create().
    - В update() после чтения depression:
      const poseIndex = depression < 30 ? 0 : depression < 70 ? 1 : 2;
      if (poseIndex !== this.prevPoseIndex) { this.avatar.setFrame(poseIndex); this.prevPoseIndex = poseIndex; }
      if (poseIndex === 2 && !this.crashTriggered) { this.triggerCrashEffect(); this.crashTriggered = true; }
      if (poseIndex < 2) this.crashTriggered = false;
  </action>
</task>

<task id="P02-W2-T3">
  <type>implementation</type>
  <title>Add code sparks particle emitter (high energy ≥ 70%)</title>
  <requirement>VISU-03</requirement>
  <read_first>
    - frontend/src/game/scenes/GameScene.js (существующие particles)
    - .planning/phases/02-visual-foundation-atmosphere/02-CONTEXT.md (D-28..D-34)
  </read_first>
  <acceptance_criteria>
    1. Создан emitter `this.codeSparks` в GameScene.create() с texture `'commit'` (зелёный квадрат).
    2. Emitter: x = avatar.x, y = avatar.y - 20, speed { min: 40, max: 120 }, angle { min: -120, max: -60 }, scale { start: 0.8, end: 0 }, lifespan 600, tint 0x4ade80.
    3. Эмиттер активен только при energyPercent >= 70 (читается из window.__GAME_STATE__).
    4. Max ~30 active particles. frequency подобрана так, чтобы не превышать бюджет.
    5. При energyPercent < 70 — emitter emitting = false.
  </acceptance_criteria>
  <action>
    В GameScene.create():
    - this.codeSparks = this.add.particles(0, 0, 'commit', { ...config, emitting: false });
    В GameScene.update():
    - const energyPercent = (window.__GAME_STATE__?.energy / window.__GAME_STATE__?.maxEnergy) * 100 || 0;
    - this.codeSparks.setPosition(this.avatar.x, this.avatar.y - 20);
    - this.codeSparks.emitting = energyPercent >= 70;
  </action>
</task>

<task id="P02-W2-T4">
  <type>implementation</type>
  <title>Add tremor particle emitter (low energy ≤ 20%)</title>
  <requirement>VISU-03</requirement>
  <read_first>
    - frontend/src/game/scenes/GameScene.js
  </read_first>
  <acceptance_criteria>
    1. Создан emitter `this.tremorParticles` в create() с texture `'orb'` (tinted grey).
    2. Config: speed { min: 5, max: 20 }, scale { start: 0.3, end: 0 }, alpha { start: 0.3, end: 0 }, lifespan 800, tint 0x94a3b8, gravityY: 0.
    3. Эмиттер активен только при energyPercent <= 20.
    4. При activation: `this.cameras.main.shake(200, 0.005)` each 2 seconds (таймер, не каждый кадр).
    5. Max ~30 active particles.
  </acceptance_criteria>
  <action>
    В GameScene.create(): создать tremorParticles emitter, emitting: false.
    В GameScene.update():
    - this.tremorParticles.emitting = energyPercent <= 20;
    - Если transitioned into low energy — запустить shake с таймером (setInterval 2000ms, очищать при выходе).
  </action>
</task>

<task id="P02-W2-T5">
  <type>implementation</type>
  <title>Add bug-report rain emitter (depression ≥ 75%)</title>
  <requirement>VISU-03</requirement>
  <read_first>
    - frontend/src/game/scenes/GameScene.js
  </read_first>
  <acceptance_criteria>
    1. Создан emitter `this.bugRain` в create() с texture `'commit'` (tinted red).
    2. Config: x range across full width, y = -10, speedY { min: 80, max: 160 }, angle { min: 85, max: 95 }, scale { start: 0.6, end: 0.2 }, lifespan 1200, tint 0xf87171.
    3. Эмиттер активен только при depression >= 75.
    4. Max ~50 active particles.
    5. Не конфликтует с существующим depressionOverlay (red vignette).
  </acceptance_criteria>
  <action>
    В GameScene.create(): создать bugRain emitter.
    В GameScene.update(): this.bugRain.emitting = depression >= 75.
  </action>
</task>

<task id="P02-W2-T6">
  <type>implementation</type>
  <title>Implement crash effect (100% depression) with screen flash + debris</title>
  <requirement>VISU-03</requirement>
  <read_first>
    - frontend/src/game/scenes/GameScene.js
    - .planning/phases/02-visual-foundation-atmosphere/02-CONTEXT.md (D-31)
  </read_first>
  <acceptance_criteria>
    1. Метод `triggerCrashEffect()` в GameScene:
       - White screen flash: белый прямоугольник на весь экран, alpha 1 → tween to 0 за 500ms.
       - Debris explosion: emit ~90 particles от центра экрана, speed { min: 100, max: 400 }, lifespan 800ms, mixed tints (white, red, grey).
       - Camera shake: `this.cameras.main.shake(500, 0.01)`.
    2. Эффект вызывается один раз при переходе в pose 2 (collapsed) из другого pose.
    3. Не вызывается повторно до выхода и повторного входа в 100% depression.
    4. Уважает audio mute toggle (silent визуально, звук опционален).
  </acceptance_criteria>
  <action>
    В GameScene:
    - Создать this.crashDebris = this.add.particles(...) в create(), emitting: false.
    - Реализовать triggerCrashEffect():
      const flash = this.add.rectangle(cx, cy, width, height, 0xffffff, 1).setDepth(200);
      this.tweens.add({ targets: flash, alpha: 0, duration: 500, onComplete: () => flash.destroy() });
      this.crashDebris.emitParticleAt(cx, cy, 90);
      this.cameras.main.shake(500, 0.01);
    - Вызвать из update() при переходе в pose 2.
  </action>
</task>

<task id="P02-W2-T7">
  <type>implementation</type>
  <title>Adjust tap squish per pose (weaker for collapsed)</title>
  <requirement>VISU-02</requirement>
  <read_first>
    - frontend/src/game/scenes/GameScene.js (onTap)
  </read_first>
  <acceptance_criteria>
    1. В onTap(), squish tween использует pose-aware scale:
       - energetic: scaleX 3.2, scaleY 2.8 (existing)
       - tired: scaleX 3.15, scaleY 2.85
       - collapsed: scaleX 3.05, scaleY 2.95 (barely noticeable)
    2. Длительность остаётся 80ms для всех.
  </acceptance_criteria>
  <action>
    В GameScene.onTap():
    - const pose = this.prevPoseIndex || 0;
    - const squish = pose === 0 ? { sx: 3.2, sy: 2.8 } : pose === 1 ? { sx: 3.15, sy: 2.85 } : { sx: 3.05, sy: 2.95 };
    - Применить squish.sx и squish.sy в tween targets.
  </action>
</task>

---

## Wave 3: Pixel-Art CSS Theme

### Зависимости
- Wave 1 (loading overlay ready, fonts loaded).
- Может выполняться параллельно с Wave 2 и Wave 4.

---

<task id="P02-W3-T1">
  <type>implementation</type>
  <title>Create pixel-theme.css with utility classes</title>
  <requirement>VISU-01</requirement>
  <read_first>
    - frontend/src/assets/animations.css
    - .planning/phases/02-visual-foundation-atmosphere/02-UI-SPEC.md (Component Contracts)
    - frontend/index.html
  </read_first>
  <acceptance_criteria>
    1. Создан файл frontend/src/assets/pixel-theme.css.
    2. Классы:
       - `.pixel-panel`: bg #16213e, border 2px solid #334155, box-shadow 4px 4px 0 #0f172a, border-radius 0, padding 16px
       - `.pixel-button`: bg #0f3460, border 2px solid #4ade80, border-radius 0, padding 8px 16px, font-family 'Press Start 2P', 10px, uppercase, text-shadow 2px 2px 0 #0f172a
       - `.pixel-button:active`: translate(2px, 2px), box-shadow 2px 2px 0
       - `.pixel-button--danger`: border-color #f87171
       - `.pixel-text`: font-family 'Press Start 2P', color #e2e8f0, text-shadow 2px 2px 0 #0f172a
       - `.pixel-badge`: bg #0f3460, border 2px solid #fbbf24, padding 4px 8px, font-size 8px
       - `.pixel-toast`: bg #16213e, border 2px solid #fbbf24, box-shadow 4px 4px 0 #0f172a, padding 12px 16px
    3. Анимации: `.pixel-fade-in` (opacity 0→1, 150ms, step-end), `.pixel-blink` (opacity toggle, 800ms, step-end).
    4. CSS импортирован в index.html или main.jsx.
  </acceptance_criteria>
  <action>
    Создать frontend/src/assets/pixel-theme.css с классами выше.
    Добавить `@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');` в начало файла (или в index.html link).
    Добавить import в main.jsx: `import './assets/pixel-theme.css';`.
  </action>
</task>

<task id="P02-W3-T2">
  <type>implementation</type>
  <title>Apply pixel theme to StatsBar component</title>
  <requirement>VISU-01</requirement>
  <read_first>
    - frontend/src/components/StatsBar.jsx
    - frontend/src/assets/pixel-theme.css
  </read_first>
  <acceptance_criteria>
    1. StatsBar root div использует `.pixel-panel` класс (или inline-эквивалент: sharp border, block shadow, no radius).
    2. Все кнопки (📋, 🛒, 🔗, ⚔️, ⚡, 🎯, 👥, 🛡️, 🏆, 🎨, 🎭, 🐛) заменены на `.pixel-button` стили.
    3. Текст "коммитов", rank badge, energy/depression labels используют `.pixel-text` (или эквивалент inline).
    4. Progress bars (energy, depression, level): border-radius 0, sharp edges, 2px border.
    5. Toast внутри StatsBar: `.pixel-toast` стили.
    6. Нет регрессий в функциональности — все кнопки открывают панели.
  </acceptance_criteria>
  <action>
    В StatsBar.jsx:
    - Заменить inline styles на className из pixel-theme.css.
    - Для dynamic цветов (energyColor, depressionColor) — оставить inline background/color, но убрать border-radius.
    - Buttons: добавить className="pixel-button" (или условно pixel-button--danger для low energy).
  </action>
</task>

<task id="P02-W3-T3">
  <type>implementation</type>
  <title>Apply pixel theme to TapArea and main UI banners</title>
  <requirement>VISU-01</requirement>
  <read_first>
    - frontend/src/components/TapArea.jsx
    - frontend/src/components/ContextOfferBanner.jsx
    - frontend/src/components/CrunchTimeBanner.jsx
    - frontend/src/components/EventBanner.jsx
  </read_first>
  <acceptance_criteria>
    1. TapArea: tap зона имеет pixel-art border при active state, text "ТАПАЙ" в Press Start 2P.
    2. ContextOfferBanner, CrunchTimeBanner, EventBanner: все используют `.pixel-panel` или `.pixel-toast` стили.
    3. Все banners: border-radius 0, sharp 2px borders, hard shadows.
    4. Font-family применён ко всем текстовым элементам в этих компонентах.
  </acceptance_criteria>
  <action>
    Обновить TapArea.jsx, ContextOfferBanner.jsx, CrunchTimeBanner.jsx, EventBanner.jsx:
    - Заменить border-radius на 0.
    - Добавить border: 2px solid и box-shadow: 4px 4px 0.
    - Font-family: 'Press Start 2P', monospace для заголовков.
  </action>
</task>

<task id="P02-W3-T4">
  <type>implementation</type>
  <title>Add Press Start 2P font loading with Courier New fallback</title>
  <requirement>VISU-01</requirement>
  <read_first>
    - frontend/index.html
  </read_first>
  <acceptance_criteria>
    1. В index.html `<head>` добавлен `<link rel="preconnect" href="https://fonts.googleapis.com">` и `<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">`.
    2. Fallback CSS: `font-family: 'Press Start 2P', 'Courier New', monospace;`.
    3. Если шрифт не загружается (офлайн), Courier New обеспечивает читаемость.
    4. Нет FOUC (flash of unstyled content) — font загружается до рендера UI.
  </acceptance_criteria>
  <action>
    В frontend/index.html:
    - Добавить preconnect и Google Fonts link перед существующими стилями.
    - Обновить body font-family: 'Press Start 2P', 'Courier New', monospace.
  </action>
</task>

---

## Wave 4: Random Event System

### Зависимости
- Wave 1 (BootScene stable, event bridge available).
- Может выполняться параллельно с Wave 2 и Wave 3.

---

<task id="P02-W4-T1">
  <type>implementation</type>
  <title>Create EventManager class with timer and random selection</title>
  <requirement>TECH-05</requirement>
  <read_first>
    - frontend/src/game/scenes/GameScene.js
    - .planning/phases/02-visual-foundation-atmosphere/02-CONTEXT.md (D-13..D-20)
  </read_first>
  <acceptance_criteria>
    1. Создан файл frontend/src/game/EventManager.js.
    2. Класс EventManager:
       - constructor(scene) сохраняет ссылку на GameScene.
       - start(): запускает таймер случайного интервала 30–90 сек (Phaser.Math.Between).
       - onTimer(): выбирает случайный event type из 4, вызывает scene.showRandomEvent(payload).
       - stop(): останавливает таймер.
    3. Event payloads содержат: eventId (uuid), title, description, options { solve, ignore } с deltas.
    4. 4 event types с реальными deltas:
       - prod_down: ignore (-20 commits, +10 depression), solve (+30 commits, -5 depression)
       - coworker_meme: ignore (-5 depression, +5 energy), solve (-15 depression, +10 energy)
       - manager_deadline: ignore (+25 depression), solve (-10 depression)
       - sleep_not_found: ignore (-30 energy, +20 depression), solve (+50 energy)
    5. EventManager не создаёт UI — только управляет таймером и генерирует payload.
  </acceptance_criteria>
  <action>
    Создать EventManager.js:
    - constructor, start(), stop(), _scheduleNext(), _triggerEvent().
    - _generateEvent(): switch по 4 типам, возвращает payload object.
    - Для eventId использовать `Date.now() + '_' + Math.random()`.
  </action>
</task>

<task id="P02-W4-T2">
  <type>implementation</type>
  <title>Create RandomEventToast Preact component</title>
  <requirement>TECH-05, VISU-01</requirement>
  <read_first>
    - frontend/src/components/EventBanner.jsx
    - frontend/src/assets/pixel-theme.css
    - .planning/phases/02-visual-foundation-atmosphere/02-UI-SPEC.md (Event Toast Interaction Flow)
  </read_first>
  <acceptance_criteria>
    1. Создан файл frontend/src/components/RandomEventToast.jsx.
    2. Компонент принимает: event (title, description, options, timeout), onChoice(action), onDismiss.
    3. UI: `.pixel-toast` стили, positioned top-center, max-width 90vw, z-index above all.
    4. Две кнопки: primary `.pixel-button` (solve) и secondary `.pixel-button--danger` (ignore).
    5. Timer bar: 2px height, #fbbf24, CSS transition width 15s linear.
    6. Auto-dismiss on timeout → вызывает onChoice('ignore').
    7. Title: uppercase, 12px Press Start 2P. Description: 10px, 2 lines max.
    8. Copy на русском, ироничный тон (см. UI-SPEC Copywriting Contract).
  </acceptance_criteria>
  <action>
    Создать RandomEventToast.jsx:
    - useEffect с setTimeout на 15s для auto-dismiss.
    - useEffect с CSS transition на timer bar.
    - Рендер: title, description, timer bar, 2 buttons.
    - Styling через className с pixel-theme.css.
  </action>
</task>

<task id="P02-W4-T3">
  <type>implementation</type>
  <title>Integrate event bridge: GameScene ↔ EventManager ↔ Preact</title>
  <requirement>TECH-05</requirement>
  <read_first>
    - frontend/src/game/scenes/GameScene.js
    - frontend/src/game/EventManager.js
    - frontend/src/App.jsx
    - frontend/src/hooks/useGameState.js
  </read_first>
  <acceptance_criteria>
    1. GameScene.create() создаёт `this.eventManager = new EventManager(this)` и вызывает `this.eventManager.start()`.
    2. GameScene имеет метод `showRandomEvent(payload)` который эмитит событие через `this.game.events.emit('random_event', payload)`.
    3. AppInner слушает `'random_event'` через `window.__PHASER_GAME__?.events.on('random_event', ...)` в useEffect.
    4. При получении event: AppInner показывает RandomEventToast.
    5. При выборе игрока: AppInner эмитит `'event_choice'` через `window.__PHASER_GAME__?.events.emit('event_choice', { eventId, action })`.
    6. GameScene слушает `'event_choice'` и применяет deltas к локальному state (через window.__GAME_STATE__ модификацию или callback).
    7. EventManager не запускается пока `showOnboarding === true` (не мешает онбордингу).
  </acceptance_criteria>
  <action>
    В GameScene:
    - import EventManager from '../EventManager.js'
    - В create(): this.eventManager = new EventManager(this); this.eventManager.start();
    - Метод showRandomEvent(payload) → this.game.events.emit('random_event', payload)
    - Слушать 'event_choice' → применять deltas
    В App.jsx:
    - Добавить state [randomEvent, setRandomEvent] = useState(null)
    - useEffect с подпиской на 'random_event'
    - Рендер RandomEventToast когда randomEvent !== null
  </action>
</task>

<task id="P02-W4-T4">
  <type>implementation</type>
  <title>Apply event deltas to game state with backend sync</title>
  <requirement>TECH-05</requirement>
  <read_first>
    - frontend/src/hooks/useGameState.js
    - frontend/src/game/scenes/GameScene.js
  </read_first>
  <acceptance_criteria>
    1. При выборе 'solve' или 'ignore' — deltas применяются к window.__GAME_STATE__:
       - energy = clamp(energy + energyDelta, 0, maxEnergy)
       - depression = clamp(depression + depressionDelta, 0, 100)
       - commits = max(0, commits + commitsDelta)
    2. Изменения отражаются в UI немедленно (через setState или direct mutation + force update).
    3. Через 3 секунды после event — вызывается `loadState()` для синхронизации с backend.
    4. Показывается toast с результатом: "+30 коммитов, -5 стресса" или "Игнорировано: -20 коммитов".
    5. Нет дублирования event при rapid tapping — eventId проверяется.
  </acceptance_criteria>
  <action>
    В useGameState.js:
    - Добавить applyEventChoice(eventId, action, deltas) метод.
    - Обновлять state напрямую, затем вызывать loadState() с задержкой.
    В GameScene:
    - При получении 'event_choice' вызывать applyEventChoice через window.__GAME_STATE__ callback (или emit custom event).
  </action>
</task>

---

## Wave 5: Integration & Verification

### Зависимости
- Wave 1, 2, 3, 4 complete.

---

<task id="P02-W5-T1">
  <type>smoke</type>
  <title>Smoke test: build passes and all screens render</title>
  <requirement>VISU-01, VISU-02, VISU-03, TECH-05</requirement>
  <read_first>
    - frontend/package.json
    - frontend/vite.config.js
  </read_first>
  <acceptance_criteria>
    1. `cd frontend && npm run build` completes with zero errors.
    2. Build time within 20s (acceptable for Vite).
    3. No TypeScript/eslint warnings related to new files.
  </acceptance_criteria>
  <action>
    Запустить `cd frontend && npm run build`. Исправить любые ошибки.
  </action>
</task>

<task id="P02-W5-T2">
  <type>smoke</type>
  <title>Verify particle budget and performance</title>
  <requirement>VISU-03</requirement>
  <read_first>
    - frontend/src/game/scenes/GameScene.js
  </read_first>
  <acceptance_criteria>
    1. Суммарное количество активных particles во всех emitters не превышает 200 одновременно.
    2. Phaser FPS остаётся ≥ 55 на mid-range mobile устройстве (измеряется через devtools Performance).
    3. Нет memory leaks: particles destroy корректно (lifespan + onComplete).
  </acceptance_criteria>
  <action>
    Проверить конфигурацию emitters:
    - codeSparks: max 30
    - tremor: max 30
    - bugRain: max 50
    - crashDebris: max 90 (burst only)
    - Существующие commitParticles + sparkleParticles + steamParticles остаются без изменений.
    Сумма новых: 30 + 30 + 50 + 90 = 200 (burst). Continuous: 30 + 30 + 50 = 110.
  </action>
</task>

<task id="P02-W5-T3">
  <type>smoke</type>
  <title>Verify event system end-to-end</title>
  <requirement>TECH-05</requirement>
  <read_first>
    - frontend/src/game/EventManager.js
    - frontend/src/components/RandomEventToast.jsx
    - frontend/src/App.jsx
  </read_first>
  <acceptance_criteria>
    1. Event появляется в течение 30–90 секунд после старта.
    2. Toast отображается с title, description, 2 buttons, timer bar.
    3. Auto-ignore срабатывает через 15s если пользователь не выбрал.
    4. Выбор solve/ignore применяет deltas к energy/depression/commits.
    5. Последующий loadState() не перезаписывает event deltas (backend принимает текущие значения).
  </acceptance_criteria>
  <action>
    Ручной smoke-test через browser devtools:
    - Ускорить таймер EventManager для теста (временно изменить интервал на 5s).
    - Проверить каждый из 4 event types.
    - Проверить auto-dismiss.
  </action>
</task>

---

## Verification Criteria (Общие критерии приёмки фазы)

1. **VISU-01 (Pixel-art theme):**
   - Все primary UI screens (StatsBar, TapArea, banners, toasts) используют sharp borders, block shadows, Press Start 2P font.
   - Ни один элемент не имеет border-radius > 0 (кроме существующих avatar images user?.photoUrl).
   - `npm run build` zero errors.

2. **VISU-02 (Character poses):**
   - Avatar меняет frame при depression 30% и 70%.
   - 3 визуально различимых pose (energetic, tired, collapsed).
   - Tap squish адаптируется под pose (collapsed — слабее).

3. **VISU-03 (Resource animations):**
   - Code sparks при energy ≥ 70%.
   - Tremor при energy ≤ 20%.
   - Bug-report rain при depression ≥ 75%.
   - Crash effect (flash + debris + shake) при переходе в 100% depression.
   - ≤200 particles total.

4. **TECH-05 (Random events):**
   - Event fire каждые 30–90s.
   - 4 distinct event types с gameplay impact.
   - Toast с 2 choice buttons + 15s timer.
   - Auto-ignore on timeout.
   - Deltas применяются к state.

5. **Zero Regression:**
   - Существующий tap pipeline работает (particles, floating text, haptic).
   - Существующие панели открываются/закрываются.
   - Backend tests проходят (npm test в backend).

---

## must_haves (Goal-Backward Verification)

| Goal | must_have | Как проверить |
|------|-----------|---------------|
| Пиксель-арт стиль на всех экранах | Все компоненты используют pixel-theme.css classes | Визуальный inspection + build pass |
| Персонаж меняет позу по депрессии | GameScene.update() вызывает setFrame() на 30%/70% | Ручной QA: изменить depression в devtools |
| Ресурсные анимации работают | 4 emitters активны при своих thresholds | Ручной QA + particle count в console |
| Случайные события влияют на игру | EventManager запускается, deltas применяются | Ручной QA: дождаться event, выбрать solve/ignore |
| Нет регрессий | Tap, quests, pass, shop работают как раньше | Smoke test всех существующих фич |
| Производительность | ≤200 particles, FPS ≥ 55 | Performance tab в Chrome DevTools |

---

## Dependencies & Waves (Parallel Execution)

```
Wave 1: Asset Pipeline & BootScene
├── P02-W1-T1 [impl] Generate placeholder pose textures
├── P02-W1-T2 [impl] External sprite loading + fallback
├── P02-W1-T3 [impl] PhaserGame config update
└── P02-W1-T4 [impl] Loading overlay

Wave 2: Character Poses & Particles      [parallel after W1]
├── P02-W2-T1 [impl] Refactor avatar to spritesheet
├── P02-W2-T2 [impl] Pose selection in update()
├── P02-W2-T3 [impl] Code sparks emitter
├── P02-W2-T4 [impl] Tremor emitter
├── P02-W2-T5 [impl] Bug-report rain emitter
├── P02-W2-T6 [impl] Crash effect
└── P02-W2-T7 [impl] Pose-aware tap squish

Wave 3: Pixel CSS Theme                  [parallel after W1]
├── P02-W3-T1 [impl] pixel-theme.css
├── P02-W3-T2 [impl] StatsBar pixel theme
├── P02-W3-T3 [impl] TapArea + banners pixel theme
└── P02-W3-T4 [impl] Press Start 2P font loading

Wave 4: Random Event System              [parallel after W1]
├── P02-W4-T1 [impl] EventManager class
├── P02-W4-T2 [impl] RandomEventToast component
├── P02-W4-T3 [impl] Event bridge integration
└── P02-W4-T4 [impl] Event delta application

Wave 5: Verification                     [after W2+W3+W4]
├── P02-W5-T1 [smoke] Build passes
├── P02-W5-T2 [smoke] Particle budget check
└── P02-W5-T3 [smoke] Event system E2E
```

**Execution Order Recommendation:**
1. Start Wave 1 (T1→T2→T3→T4 sequentially).
2. После W1 запускать Wave 2, Wave 3, Wave 4 параллельно.
3. Wave 5 запускать после завершения Wave 2, 3, 4.

**Risk Mitigation:**
- Если external sprite loading ломает BootScene — fallback generation всегда остаётся рабочим.
- Если Press Start 2P шрифт не загружается — Courier New fallback обеспечивает читаемость.
- Если particle emitters влияют на FPS — снизить quantity/frequency (конфигурируемые константы в начале GameScene).
- Если event deltas конфликтуют с backend sync — локальное state обновляется first, backend sync deferred на 3s.
