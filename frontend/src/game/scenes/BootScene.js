import Phaser from 'phaser';
import heroCoderFocusUrl from '../../assets/characters/hero_coder_focus.png';
import heroCoderStrainedUrl from '../../assets/characters/hero_coder_strained.png';
import heroCoderCollapsedUrl from '../../assets/characters/hero_coder_collapsed.png';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Generate fallback textures first — game always starts with valid textures.
    this.generateFallbackTextures();

    // Compact generated art is optional presentation polish; the procedural
    // textures above remain the safe fallback if this loader ever fails.
    this.load.image('hero_coder_focus', heroCoderFocusUrl);
    this.load.image('hero_coder_strained', heroCoderStrainedUrl);
    this.load.image('hero_coder_collapsed', heroCoderCollapsedUrl);
  }

  create() {
    this.game.events.emit('boot_complete');
    this.scene.start('GameScene');
  }

  generateFallbackTextures() {
    // Programmer avatar — energetic pose (64x64)
    const avatarEnergetic = this.make.graphics({ x: 0, y: 0, add: false });
    // Body (upright, bright green hoodie)
    avatarEnergetic.fillStyle(0x4ade80, 1);
    avatarEnergetic.fillRect(20, 28, 24, 28);
    // Head
    avatarEnergetic.fillStyle(0xffccaa, 1);
    avatarEnergetic.fillRect(22, 8, 20, 20);
    // Hair
    avatarEnergetic.fillStyle(0x4a3728, 1);
    avatarEnergetic.fillRect(20, 4, 24, 8);
    avatarEnergetic.fillRect(18, 10, 6, 6);
    avatarEnergetic.fillRect(40, 10, 6, 6);
    // Eyes (open, alert)
    avatarEnergetic.fillStyle(0x000000, 1);
    avatarEnergetic.fillRect(26, 16, 4, 4);
    avatarEnergetic.fillRect(34, 16, 4, 4);
    // Glasses
    avatarEnergetic.fillStyle(0x333333, 1);
    avatarEnergetic.fillRect(24, 14, 8, 1);
    avatarEnergetic.fillRect(34, 14, 8, 1);
    avatarEnergetic.fillRect(24, 20, 8, 1);
    avatarEnergetic.fillRect(34, 20, 8, 1);
    avatarEnergetic.fillRect(24, 14, 1, 7);
    avatarEnergetic.fillRect(31, 14, 1, 7);
    avatarEnergetic.fillRect(34, 14, 1, 7);
    avatarEnergetic.fillRect(41, 14, 1, 7);
    // Hoodie string
    avatarEnergetic.fillStyle(0x1a3f25, 1);
    avatarEnergetic.fillRect(30, 28, 2, 10);
    avatarEnergetic.fillRect(34, 28, 2, 10);
    avatarEnergetic.generateTexture('avatar_energetic', 64, 64);

    // Programmer avatar — tired pose (64x64)
    const avatarTired = this.make.graphics({ x: 0, y: 0, add: false });
    // Body (slouched, muted blue hoodie)
    avatarTired.fillStyle(0x60a5fa, 1);
    avatarTired.fillRect(18, 32, 28, 24);
    // Head (tilted forward)
    avatarTired.fillStyle(0xffccaa, 1);
    avatarTired.fillRect(20, 12, 24, 18);
    // Hair
    avatarTired.fillStyle(0x4a3728, 1);
    avatarTired.fillRect(18, 8, 28, 8);
    avatarTired.fillRect(16, 14, 6, 6);
    avatarTired.fillRect(42, 14, 6, 6);
    // Eyes (half-closed)
    avatarTired.fillStyle(0x000000, 1);
    avatarTired.fillRect(24, 20, 6, 2);
    avatarTired.fillRect(34, 20, 6, 2);
    // Glasses (askew)
    avatarTired.fillStyle(0x555555, 1);
    avatarTired.fillRect(22, 18, 10, 1);
    avatarTired.fillRect(34, 19, 10, 1);
    avatarTired.fillRect(22, 24, 10, 1);
    avatarTired.fillRect(34, 25, 10, 1);
    avatarTired.fillRect(22, 18, 1, 7);
    avatarTired.fillRect(31, 18, 1, 7);
    avatarTired.fillRect(34, 19, 1, 7);
    avatarTired.fillRect(43, 19, 1, 7);
    // Hoodie string
    avatarTired.fillStyle(0x1a2f4a, 1);
    avatarTired.fillRect(28, 32, 2, 8);
    avatarTired.fillRect(34, 32, 2, 8);
    avatarTired.generateTexture('avatar_tired', 64, 64);

    // Programmer avatar — collapsed pose (64x64)
    const avatarCollapsed = this.make.graphics({ x: 0, y: 0, add: false });
    // Body (horizontal, dark grey hoodie)
    avatarCollapsed.fillStyle(0x4b5563, 1);
    avatarCollapsed.fillRect(8, 36, 48, 20);
    // Head (on keyboard, sideways)
    avatarCollapsed.fillStyle(0xffccaa, 1);
    avatarCollapsed.fillRect(12, 24, 20, 16);
    // Hair
    avatarCollapsed.fillStyle(0x4a3728, 1);
    avatarCollapsed.fillRect(10, 22, 24, 6);
    avatarCollapsed.fillRect(8, 26, 6, 6);
    // Eyes (X_X)
    avatarCollapsed.fillStyle(0x000000, 1);
    avatarCollapsed.fillRect(14, 30, 2, 2);
    avatarCollapsed.fillRect(18, 30, 2, 2);
    avatarCollapsed.fillRect(14, 34, 2, 2);
    avatarCollapsed.fillRect(18, 34, 2, 2);
    avatarCollapsed.fillRect(22, 30, 2, 2);
    avatarCollapsed.fillRect(26, 30, 2, 2);
    avatarCollapsed.fillRect(22, 34, 2, 2);
    avatarCollapsed.fillRect(26, 34, 2, 2);
    // Glasses (crooked)
    avatarCollapsed.fillStyle(0x666666, 1);
    avatarCollapsed.fillRect(12, 28, 10, 1);
    avatarCollapsed.fillRect(24, 29, 10, 1);
    // Hoodie string
    avatarCollapsed.fillStyle(0x1f2937, 1);
    avatarCollapsed.fillRect(28, 36, 2, 6);
    avatarCollapsed.fillRect(34, 36, 2, 6);
    avatarCollapsed.generateTexture('avatar_collapsed', 64, 64);

    // Desk (64x32)
    const desk = this.make.graphics({ x: 0, y: 0, add: false });
    desk.fillStyle(0x5c3a1e, 1);
    desk.fillRect(0, 8, 64, 24);
    desk.fillStyle(0x6b4226, 1);
    desk.fillRect(2, 6, 60, 4);
    // Monitor stand
    desk.fillStyle(0x333333, 1);
    desk.fillRect(26, 0, 12, 8);
    desk.generateTexture('desk', 64, 32);

    // Monitor (48x32)
    const monitor = this.make.graphics({ x: 0, y: 0, add: false });
    // Screen bezel
    monitor.fillStyle(0x222222, 1);
    monitor.fillRect(0, 0, 48, 32);
    // Screen
    monitor.fillStyle(0x0a0a0a, 1);
    monitor.fillRect(2, 2, 44, 26);
    // Code lines
    monitor.fillStyle(0x4ade80, 1);
    monitor.fillRect(4, 4, 20, 2);
    monitor.fillRect(4, 8, 30, 2);
    monitor.fillRect(4, 12, 15, 2);
    monitor.fillRect(8, 16, 25, 2);
    monitor.fillRect(4, 20, 18, 2);
    // Cursor blink
    monitor.fillStyle(0x4ade80, 1);
    monitor.fillRect(24, 20, 2, 2);
    monitor.generateTexture('monitor', 48, 32);

    // Coffee cup (16x16)
    const cup = this.make.graphics({ x: 0, y: 0, add: false });
    cup.fillStyle(0xffffff, 1);
    cup.fillRect(4, 4, 10, 12);
    cup.fillStyle(0xdddddd, 1);
    cup.fillRect(14, 6, 3, 6);
    // Coffee
    cup.fillStyle(0x3d1f00, 1);
    cup.fillRect(5, 5, 8, 3);
    // Steam
    cup.fillStyle(0xaaaaaa, 0.5);
    cup.fillRect(7, 0, 2, 3);
    cup.fillRect(10, 1, 2, 3);
    cup.generateTexture('cup', 16, 16);

    // Keyboard (32x12)
    const keyboard = this.make.graphics({ x: 0, y: 0, add: false });
    keyboard.fillStyle(0x444444, 1);
    keyboard.fillRect(0, 0, 32, 12);
    // Keys
    keyboard.fillStyle(0x666666, 1);
    for (let x = 2; x < 30; x += 4) {
      for (let y = 2; y < 10; y += 4) {
        keyboard.fillRect(x, y, 3, 3);
      }
    }
    keyboard.generateTexture('keyboard', 32, 12);

    // Particle (commit symbol)
    const particle = this.make.graphics({ x: 0, y: 0, add: false });
    particle.fillStyle(0x4ade80, 1);
    particle.fillRect(2, 2, 4, 4);
    particle.fillRect(0, 4, 8, 2);
    particle.generateTexture('commit', 8, 8);

    // Energy orb
    const orb = this.make.graphics({ x: 0, y: 0, add: false });
    orb.fillStyle(0xfacc15, 1);
    orb.fillCircle(6, 6, 5);
    orb.fillStyle(0xffff00, 1);
    orb.fillCircle(5, 5, 2);
    orb.generateTexture('orb', 12, 12);
  }
}
