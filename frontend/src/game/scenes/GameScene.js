import Phaser from 'phaser';

const codeSnippets = [
  'git commit -m "fix"',
  'console.log("debug")',
  'npm install hope',
  '/* TODO: sleep */',
  'await coffee()',
  'rm -rf node_modules',
  'git push --force',
  '// it works on my machine'
];

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;
    this.lowPowerEffects = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '') || (navigator.hardwareConcurrency || 8) < 4;
    this.particleSystems = [];
    this.resizeTimer = null;
    this.lastResizeSize = { width, height };

    // Background grid
    this.createGrid(width, height);

    // Desk setup
    const deskY = cy + 40;
    this.add.image(cx, deskY, 'desk').setScale(3);

    // Monitor
    this.monitor = this.add.image(cx, deskY - 45, 'monitor').setScale(3);

    // Keyboard
    this.keyboard = this.add.image(cx, deskY + 25, 'keyboard').setScale(2.5);

    // Coffee cup
    this.cup = this.add.image(cx + 70, deskY - 10, 'cup').setScale(2.5);

    // Programmer avatar — use spritesheet if available, else fallback
    const hasSheet = this.textures.exists('avatar_sheet');
    this.avatar = this.add.sprite(
      cx,
      deskY - 90,
      hasSheet ? 'avatar_sheet' : 'avatar_energetic'
    );
    this.avatar.setScale(2);
    this.avatar.setFrame(0);

    // Pose tracking
    this.prevPoseIndex = 0;
    this.crashTriggered = false;

    // Idle animation
    this.tweens.add({
      targets: this.avatar,
      y: deskY - 85,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Steam particles from cup
    this.steamParticles = this.add.particles(0, 0, 'orb', {
      x: cx + 70,
      y: deskY - 20,
      speed: { min: -10, max: 10 },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 0.4, end: 0 },
      lifespan: 1500,
      frequency: this.lowPowerEffects ? 1600 : 800,
      quantity: 1,
      tint: 0xaaaaaa
    });
    this.particleSystems.push(this.steamParticles);

    // Commit particles (spawned on tap)
    this.commitParticles = this.add.particles(0, 0, 'commit', {
      speed: { min: 80, max: 220 },
      angle: { min: -130, max: -50 },
      scale: { start: 1.6, end: 0 },
      lifespan: 900,
      gravityY: 220,
      quantity: 1,
      emitting: false
    });
    this.particleSystems.push(this.commitParticles);

    // Sparkle particles for big hits
    this.sparkleParticles = this.add.particles(0, 0, 'orb', {
      speed: { min: 60, max: 180 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 700,
      gravityY: 80,
      quantity: 1,
      tint: 0xfacc15,
      emitting: false
    });
    this.particleSystems.push(this.sparkleParticles);

    // Phase 2: Resource animation emitters
    // Code sparks — high energy (≥70%)
    this.codeSparks = this.add.particles(0, 0, 'commit', {
      speed: { min: 40, max: 120 },
      angle: { min: -120, max: -60 },
      scale: { start: 0.8, end: 0 },
      lifespan: 600,
      frequency: this.lowPowerEffects ? 240 : 100,
      quantity: 1,
      tint: 0x4ade80,
      emitting: false
    });
    this.particleSystems.push(this.codeSparks);

    // Tremor — low energy (≤20%)
    this.tremorParticles = this.add.particles(0, 0, 'orb', {
      speed: { min: 5, max: 20 },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 0.3, end: 0 },
      lifespan: 800,
      frequency: this.lowPowerEffects ? 280 : 120,
      quantity: 1,
      tint: 0x94a3b8,
      gravityY: 0,
      emitting: false
    });
    this.particleSystems.push(this.tremorParticles);

    // Bug-report rain — high depression (≥75%)
    this.bugRain = this.add.particles(0, 0, 'commit', {
      x: { min: 0, max: width },
      y: -10,
      speedY: { min: 80, max: 160 },
      angle: { min: 85, max: 95 },
      scale: { start: 0.6, end: 0.2 },
      lifespan: 1200,
      frequency: this.lowPowerEffects ? 220 : 60,
      quantity: 1,
      tint: 0xf87171,
      emitting: false
    });
    this.particleSystems.push(this.bugRain);

    // Crash debris — 100% depression burst
    this.crashDebris = this.add.particles(0, 0, 'commit', {
      speed: { min: 100, max: 400 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.2, end: 0 },
      lifespan: 800,
      gravityY: 150,
      quantity: 1,
      emitting: false
    });
    this.particleSystems.push(this.crashDebris);

    // Tremor shake timer
    this.tremorShakeTimer = null;

    // Random event polling is owned by App.jsx; do not start a second poller here.

    // Listen for tap events from DOM
    this.game.events.on('tap', this.onTap, this);
    this.game.events.on('event_choice', this.onEventChoice, this);
    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('tap', this.onTap, this);
      this.game.events.off('event_choice', this.onEventChoice, this);
      this.scale.off('resize', this.onResize, this);
      if (this.tremorShakeTimer) {
        clearInterval(this.tremorShakeTimer);
        this.tremorShakeTimer = null;
      }
      if (this.resizeTimer) {
        clearTimeout(this.resizeTimer);
        this.resizeTimer = null;
      }
      for (const particles of this.particleSystems || []) {
        particles?.destroy?.();
      }
      this.particleSystems = [];
      this.depressionOverlay?.destroy?.();
      this.glow?.destroy?.();
    });

    // Depression overlay (red vignette)
    this.depressionOverlay = this.add.graphics();
    this.depressionOverlay.setDepth(100);

    // Screen glow effect
    this.glow = this.add.graphics();
    this.glow.setDepth(-1);
    this.updateGlow(0);
  }

  createGrid(w, h) {
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x0f3460, 0.3);
    const step = 32;
    for (let x = 0; x < w; x += step) {
      grid.moveTo(x, 0);
      grid.lineTo(x, h);
    }
    for (let y = 0; y < h; y += step) {
      grid.moveTo(0, y);
      grid.lineTo(w, y);
    }
    grid.strokePath();
  }

  onTap(data) {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;
    const strength = data?.strength || 1;

    // Emit commit particles from monitor
    const baseMin = this.lowPowerEffects ? 2 : 5;
    const baseMax = this.lowPowerEffects ? 4 : 8;
    const bonusCap = this.lowPowerEffects ? 2 : 4;
    const particleCount = Phaser.Math.Between(baseMin, baseMax) + Math.min(bonusCap, Math.floor(strength / 2));
    this.commitParticles.emitParticleAt(cx, cy - 20, particleCount);

    // Sparkles for strong hits
    if (strength >= 3) {
      this.sparkleParticles.emitParticleAt(cx, cy - 20, this.lowPowerEffects ? 2 : Phaser.Math.Between(3, 6));
    }

    // Floating code line
    const snippet = codeSnippets[Phaser.Math.Between(0, codeSnippets.length - 1)];
    const codeText = this.add.text(
      cx + Phaser.Math.Between(-60, 60),
      cy - 20 + Phaser.Math.Between(-20, 20),
      snippet,
      {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#4ade80',
        alpha: 0.9
      }
    ).setOrigin(0.5);

    this.tweens.add({
      targets: codeText,
      y: codeText.y - 50,
      alpha: 0,
      duration: 900,
      ease: 'Power1',
      onComplete: () => codeText.destroy()
    });

    // Pose-aware avatar reaction
    const pose = this.prevPoseIndex || 0;
    const squish = pose === 0
      ? { sx: 2.2, sy: 1.8 }
      : pose === 1
        ? { sx: 2.15, sy: 1.85 }
        : { sx: 2.05, sy: 1.95 };

    this.tweens.add({
      targets: this.avatar,
      scaleX: squish.sx,
      scaleY: squish.sy,
      duration: 80,
      yoyo: true,
      ease: 'Quad.easeOut'
    });

    // Keyboard press animation
    this.tweens.add({
      targets: this.keyboard,
      y: '+=4',
      duration: 50,
      yoyo: true,
      ease: 'Quad.easeOut'
    });

    // Monitor flash
    this.monitor.setTint(0xaaffaa);
    this.time.delayedCall(80, () => this.monitor.clearTint());

    // Screen flash with intensity based on strength
    const flashIntensity = Math.min(0.25, 0.12 + strength * 0.02);
    this.cameras.main.flash(100, 74, 222, 128, flashIntensity);

    // Screen shake intensity based on strength
    const shakeIntensity = Math.min(0.012, 0.004 + strength * 0.001);
    this.cameras.main.shake(120, shakeIntensity);
  }

  showRandomEvent(payload) {
    this.game.events.emit('random_event', payload);
  }

  onEventChoice({ eventId, action, deltas }) {
    if (!deltas) return;
    // Apply deltas locally; backend sync happens via deferred loadState()
    const gs = window.__GAME_STATE__;
    if (!gs) return;

    const nextEnergy = Phaser.Math.Clamp(
      (gs.energy || 0) + (deltas.energyDelta || 0),
      0,
      gs.maxEnergy || 100
    );
    const nextDepression = Phaser.Math.Clamp(
      (gs.depression || 0) + (deltas.depressionDelta || 0),
      0,
      100
    );
    const nextCommits = Math.max(0, (gs.commits || 0) + (deltas.commitsDelta || 0));

    gs.energy = nextEnergy;
    gs.depression = nextDepression;
    gs.commits = nextCommits;

    // Show result toast via React
    window.__PHASER_GAME__?.events.emit('event_result', {
      eventId,
      action,
      deltas
    });
  }

  triggerCrashEffect() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    // White screen flash
    const flash = this.add.rectangle(cx, cy, width, height, 0xffffff, 1);
    flash.setDepth(200);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 500,
      onComplete: () => flash.destroy()
    });

    // Debris explosion (~90 particles)
    this.crashDebris.emitParticleAt(cx, cy, this.lowPowerEffects ? 25 : 90);

    // Camera shake
    this.cameras.main.shake(500, 0.01);
  }

  onResize(gameSize) {
    const width = gameSize?.width || this.scale.width;
    const height = gameSize?.height || this.scale.height;
    const previous = this.lastResizeSize || { width, height };
    const widthDelta = Math.abs(width - previous.width) / Math.max(previous.width, 1);
    const heightDelta = Math.abs(height - previous.height) / Math.max(previous.height, 1);
    if (widthDelta <= 0.05 && heightDelta <= 0.05) return;

    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
    }
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null;
      this.lastResizeSize = { width, height };
      this.cameras.main.setViewport(0, 0, width, height);
      this.updateGlow(window.__GAME_STATE__?.depression || 0);
    }, 200);
  }

  updateGlow(depression) {
    const { width, height } = this.scale;
    this.glow.clear();
    const intensity = Math.min(1, depression / 200);
    const r = Math.floor(26 + intensity * 80);
    const g = Math.floor(26 + intensity * 10);
    const b = Math.floor(46 - intensity * 20);
    this.glow.fillStyle((r << 16) | (g << 8) | b, 0.15);
    this.glow.fillRect(0, 0, width, height);
  }

  updateDepression(depression) {
    const { width, height } = this.scale;
    this.depressionOverlay.clear();
    if (depression > 100) {
      const alpha = Math.min(1, (depression - 100) / 100);
      this.depressionOverlay.fillStyle(0x8b0000, alpha * 0.35);
      this.depressionOverlay.fillRect(0, 0, width, height);
      this.depressionOverlay.lineStyle(Math.max(width, height) * 0.08, 0x2a0000, alpha * 0.5);
      this.depressionOverlay.strokeCircle(width / 2, height / 2, Math.max(width, height) * 0.52);
    }
    // High stress heartbeat pulse
    if (depression >= 160) {
      const pulseAlpha = 0.05 + Math.sin(this.time.now / 200) * 0.03;
      this.depressionOverlay.fillStyle(0x550000, pulseAlpha);
      this.depressionOverlay.fillRect(0, 0, width, height);
    }
    this.updateGlow(depression);
  }

  update() {
    const gs = window.__GAME_STATE__;
    const depression = gs?.depression || 0;
    const energy = gs?.energy || 0;
    const maxEnergy = gs?.maxEnergy || 100;
    const energyPercent = maxEnergy > 0 ? (energy / maxEnergy) * 100 : 0;

    // Pose selection based on depression
    const poseIndex = depression < 60 ? 0 : depression < 140 ? 1 : 2;
    if (poseIndex !== this.prevPoseIndex) {
      this.avatar.setFrame(poseIndex);
      this.prevPoseIndex = poseIndex;
    }

    // Crash trigger on entering collapsed
    if (poseIndex === 2 && !this.crashTriggered) {
      this.triggerCrashEffect();
      this.crashTriggered = true;
    }
    if (poseIndex < 2) {
      this.crashTriggered = false;
    }

    // Resource particle emitters
    const avatarX = this.avatar.x;
    const avatarY = this.avatar.y;

    // Code sparks — high energy
    this.codeSparks.setPosition(avatarX, avatarY - 20);
    this.codeSparks.emitting = energyPercent >= 70;

    // Tremor — low energy
    this.tremorParticles.setPosition(avatarX, avatarY);
    this.tremorParticles.emitting = energyPercent <= 20;

    if (energyPercent <= 20 && !this.tremorShakeTimer) {
      this.tremorShakeTimer = setInterval(() => {
        this.cameras.main.shake(200, 0.005);
      }, 2000);
    } else if (energyPercent > 20 && this.tremorShakeTimer) {
      clearInterval(this.tremorShakeTimer);
      this.tremorShakeTimer = null;
    }

    // Bug-report rain — high depression
    this.bugRain.emitting = depression >= 150;

    // Update depression overlay
    this.updateDepression(depression);

    // Skin tint based on equipped skin
    const equippedSkin = gs?.skins?.equipped || null;
    const skinTints = {
      legacy_archaeologist: 0x60a5fa,
      night_shift: 0xc084fc,
      burnout_survivor: 0xfacc15,
      stack_overflow_guru: 0x4ade80,
      deploy_hero: 0xef4444,
      coffee_addict: 0xfb923c,
    };
    if (equippedSkin && skinTints[equippedSkin]) {
      this.avatar.setTint(skinTints[equippedSkin]);
    } else {
      this.avatar.clearTint();
    }
  }
}
