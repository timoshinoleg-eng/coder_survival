import Phaser from 'phaser';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

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

    // Programmer avatar (floating above desk)
    this.avatar = this.add.image(cx, deskY - 90, 'avatar').setScale(3);

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
      frequency: 800,
      quantity: 1,
      tint: 0xaaaaaa
    });

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

    // Listen for tap events from DOM
    this.game.events.on('tap', this.onTap, this);
    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('tap', this.onTap, this);
      this.scale.off('resize', this.onResize, this);
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
    const particleCount = Phaser.Math.Between(5, 8) + Math.min(4, Math.floor(strength / 2));
    this.commitParticles.emitParticleAt(cx, cy - 20, particleCount);

    // Sparkles for strong hits
    if (strength >= 3) {
      this.sparkleParticles.emitParticleAt(cx, cy - 20, Phaser.Math.Between(3, 6));
    }

    // Avatar reaction
    this.tweens.add({
      targets: this.avatar,
      scaleX: 3.2,
      scaleY: 2.8,
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

  onResize() {
    this.scene.restart();
  }

  updateGlow(depression) {
    const { width, height } = this.scale;
    this.glow.clear();
    const intensity = depression / 100;
    const r = Math.floor(26 + intensity * 80);
    const g = Math.floor(26 + intensity * 10);
    const b = Math.floor(46 - intensity * 20);
    this.glow.fillStyle((r << 16) | (g << 8) | b, 0.15);
    this.glow.fillRect(0, 0, width, height);
  }

  updateDepression(depression) {
    const { width, height } = this.scale;
    this.depressionOverlay.clear();
    if (depression > 50) {
      const alpha = (depression - 50) / 100;
      this.depressionOverlay.fillStyle(0x8b0000, alpha * 0.35);
      this.depressionOverlay.fillRect(0, 0, width, height);
      this.depressionOverlay.lineStyle(Math.max(width, height) * 0.08, 0x2a0000, alpha * 0.5);
      this.depressionOverlay.strokeCircle(width / 2, height / 2, Math.max(width, height) * 0.52);
    }
    // High stress heartbeat pulse
    if (depression >= 80) {
      const pulseAlpha = 0.05 + Math.sin(this.time.now / 200) * 0.03;
      this.depressionOverlay.fillStyle(0x550000, pulseAlpha);
      this.depressionOverlay.fillRect(0, 0, width, height);
    }
    this.updateGlow(depression);
  }

  update() {
    // Read depression from window (bridged from React state)
    const depression = window.__GAME_STATE__?.depression || 0;
    this.updateDepression(depression);

    // Skin tint based on equipped skin
    const equippedSkin = window.__GAME_STATE__?.skins?.equipped || null;
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
