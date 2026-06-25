import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useTelegram } from '../hooks/useTelegram.js';
import { audioManager } from '../utils/AudioManager.js';
import Confetti from './Confetti.jsx';

const PREVIEW_REWARDS = [
  { icon: '🎨', label: 'Neon Coder', type: 'skin' },
  { icon: '🖼️', label: 'Hologram', type: 'frame' },
  { icon: '👑', label: 'Bug Slayer', type: 'title' }
];

export default function PremiumPurchaseSuccess({ onClose }) {
  const { haptic } = useTelegram();
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    haptic('heavy');
    audioManager.play('levelup');
    audioManager.duckForModal();
    setShowConfetti(true);
    const confettiTimer = setTimeout(() => setShowConfetti(false), 1500);
    const autoClose = setTimeout(() => onClose(), 8000);
    return () => {
      clearTimeout(confettiTimer);
      clearTimeout(autoClose);
      audioManager.resumeFromModal();
    };
  }, []);

  return h('div', {
    onPointerDown: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 55,
      background: 'rgba(7, 12, 24, 0.9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      animation: 'fade-in-up 0.3s ease-out',
      pointerEvents: 'auto',
      touchAction: 'manipulation'
    }
  }, h('div', {
    onPointerDown: (e) => { e.preventDefault(); e.stopPropagation(); },
    style: {
      position: 'relative',
      width: 'min(340px, 100%)',
      background: 'linear-gradient(180deg, #16213e 0%, #0f1b30 100%)',
      border: '2px solid #facc15',
      borderRadius: '12px',
      padding: '24px 20px',
      textAlign: 'center',
      color: '#e6edf7',
      boxShadow: '0 0 40px rgba(250, 204, 21, 0.3)',
      animation: 'fade-in-up 0.4s ease-out',
      overflow: 'hidden'
    }
  }, [
    showConfetti && h(Confetti),

    h('button', {
      onPointerDown: (e) => { e.stopPropagation(); onClose(); },
      style: {
        position: 'absolute',
        top: '8px',
        right: '10px',
        background: 'transparent',
        border: 'none',
        color: '#6b7f99',
        fontSize: '18px',
        cursor: 'pointer',
        zIndex: 2,
        padding: 0,
        lineHeight: 1
      }
    }, '\u00d7'),

    h('div', {
      style: {
        fontSize: '42px',
        lineHeight: 1,
        marginBottom: '10px',
        position: 'relative',
        zIndex: 1
      }
    }, '🎟️'),

    h('div', {
      style: {
        fontSize: '18px',
        fontWeight: 'bold',
        marginBottom: '4px',
        color: '#facc15',
        position: 'relative',
        zIndex: 1
      }
    }, 'Premium Track Unlocked!'),

    h('div', {
      style: {
        fontSize: '13px',
        color: '#c7ddf5',
        marginBottom: '16px',
        position: 'relative',
        zIndex: 1
      }
    }, '50 exclusive rewards across 50 levels'),

    h('div', {
      style: {
        display: 'flex',
        justifyContent: 'center',
        gap: '12px',
        marginBottom: '18px',
        position: 'relative',
        zIndex: 1
      }
    }, PREVIEW_REWARDS.map((r) => h('div', {
      key: r.type,
      style: {
        background: '#131d33',
        borderRadius: '8px',
        padding: '8px 10px',
        border: '1px solid #274267',
        textAlign: 'center',
        minWidth: '70px'
      }
    }, [
      h('div', { style: { fontSize: '20px', marginBottom: '2px' } }, r.icon),
      h('div', { style: { fontSize: '10px', color: '#9eb6d2' } }, r.label)
    ]))),

    h('button', {
      onPointerDown: (e) => { e.stopPropagation(); onClose(); },
      style: {
        padding: '10px 28px',
        borderRadius: '8px',
        border: 'none',
        background: '#facc15',
        color: '#1a1a2e',
        fontWeight: 'bold',
        fontSize: '14px',
        cursor: 'pointer',
        position: 'relative',
        zIndex: 1
      }
    }, 'Start Claiming')
  ]));
}
