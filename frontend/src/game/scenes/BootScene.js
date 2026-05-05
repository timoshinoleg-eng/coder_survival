import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Generate pixel-art textures programmatically (no external assets needed for MVP)
    this.generateTextures();
  }

  create() {
    this.scene.start('GameScene');
  }

  generateTextures() {
    // Programmer avatar (32x32)
    const avatar = this.make.graphics({ x: 0, y: 0, add: false });
    // Head
    avatar.fillStyle(0xffccaa, 1);
    avatar.fillRect(8, 4, 16, 14);
    // Hair
    avatar.fillStyle(0x4a3728, 1);
    avatar.fillRect(6, 2, 20, 6);
    avatar.fillRect(6, 8, 4, 4);
    avatar.fillRect(22, 8, 4, 4);
    // Eyes
    avatar.fillStyle(0x000000, 1);
    avatar.fillRect(11, 10, 3, 3);
    avatar.fillRect(18, 10, 3, 3);
    // Glasses
    avatar.fillStyle(0x333333, 1);
    avatar.fillRect(10, 9, 5, 1);
    avatar.fillRect(17, 9, 5, 1);
    avatar.fillRect(10, 13, 5, 1);
    avatar.fillRect(17, 13, 5, 1);
    avatar.fillRect(10, 9, 1, 5);
    avatar.fillRect(14, 9, 1, 5);
    avatar.fillRect(17, 9, 1, 5);
    avatar.fillRect(21, 9, 1, 5);
    // Body
    avatar.fillStyle(0x2d4a3e, 1);
    avatar.fillRect(6, 18, 20, 12);
    // Hoodie string
    avatar.fillStyle(0x1a2f25, 1);
    avatar.fillRect(14, 18, 1, 8);
    avatar.fillRect(17, 18, 1, 8);
    avatar.generateTexture('avatar', 32, 32);

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
