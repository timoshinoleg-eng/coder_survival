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
    this.add.image(cx, deskY - 45, 'monitor').setScale(3);
    
    // Keyboard
    this.add.image(cx, deskY + 25, 'keyboard').setScale(2.5);
    
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
      speed: { min: 80, max: 200 },
      angle: { min: -120, max: -60 },
      scale: { start: 1.5, end: 0 },
      lifespan: 800,
      gravityY: 200,
      quantity: 1,
      emitting: false
    });

    // Listen for tap events from DOM
    this.game.events.on('tap', this.onTap, this);

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

    // Emit commit particles from monitor
    this.commitParticles.emitParticleAt(cx, cy - 20, Phaser.Math.Between(3, 6));

    // Avatar reaction
    this.tweens.add({
      targets: this.avatar,
      scaleX: 3.2,
      scaleY: 2.8,
      duration: 80,
      yoyo: true,
      ease: 'Quad.easeOut'
    });

    // Screen flash
    this.cameras.main.flash(100, 74, 222, 128, 0.2);
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
      // Vignette effect
      const gradient = this.depressionOverlay.createRadialGradient(
        width / 2, height / 2, height * 0.3,
        width / 2, height / 2, height * 0.8
      );
      gradient.addColorStop(0, Phaser.Display.Color.GetColor(0, 0, 0));
      gradient.addColorStop(1, Phaser.Display.Color.GetColor(139, 0, 0));
      this.depressionOverlay.fillGradientStyle(gradient, alpha * 0.4);
      this.depressionOverlay.fillRect(0, 0, width, height);
    }
    this.updateGlow(depression);
  }

  update() {
    // Read depression from window (bridged from React state)
    const depression = window.__GAME_STATE__?.depression || 0;
    this.updateDepression(depression);
  }
}
