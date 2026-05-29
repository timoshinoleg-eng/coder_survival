import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import GameScene from './scenes/GameScene.js';

export default function PhaserGame({ onReady }) {
  const containerRef = useRef(null);
  const gameRef = useRef(null);

  useEffect(() => {
    if (gameRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 375;
    const height = container.clientHeight || 600;

    const config = {
      type: Phaser.AUTO,
      width,
      height,
      parent: container,
      backgroundColor: '#1a1a2e',
      pixelArt: true,
      roundPixels: false,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
      },
      physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false }
      },
      scene: [BootScene, GameScene],
      callbacks: {
        postBoot: () => {
          onReady?.();
        }
      }
    };

    gameRef.current = new Phaser.Game(config);
    window.__PHASER_GAME__ = gameRef.current;

    return () => {
      delete window.__PHASER_GAME__;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [onReady]);

  return h('div', {
    ref: containerRef,
    style: {
      width: '100%',
      height: '100%',
      position: 'relative'
    }
  });
}
