import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { audioManager } from '../utils/AudioManager.js';

function Confetti() {
  const pieces = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 0.4}s`,
    color: ['#facc15', '#4ade80', '#60a5fa', '#c084fc', '#f87171'][Math.floor(Math.random() * 5)]
  }));

  return h('div', {
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      overflow: 'hidden',
      zIndex: 0
    }
  }, pieces.map(p => h('div', {
    key: p.id,
    style: {
      position: 'absolute',
      top: '-10px',
      left: p.left,
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: p.color,
      animation: `confetti-fall 1.2s ease-out ${p.delay} forwards`
    }
  })));
}

export default function LevelUpModal() {
  const { levelUp, clearLevelUp } = useGameState();
  const { haptic } = useTelegram();
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (levelUp) {
      haptic('heavy');
      audioManager.duckForModal();
      audioManager.play('levelup');
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 1500);
      return () => {
        clearTimeout(t);
        audioManager.resumeFromModal();
      };
    }
  }, [levelUp, haptic]);

  if (!levelUp) return null;

  const isRankUp = levelUp.isRankUp;
  const rankMeta = levelUp.rankMeta || {};

  return h('div', {
    onClick: clearLevelUp,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 50,
      background: 'rgba(7, 12, 24, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      animation: 'fade-in-up 0.3s ease-out'
    }
  }, h('div', {
    onClick: (e) => e.stopPropagation(),
    style: {
      position: 'relative',
      width: 'min(360px, 100%)',
      background: 'linear-gradient(180deg, #16213e 0%, #0f1b30 100%)',
      border: isRankUp ? '2px solid #facc15' : '2px solid #60a5fa',
      borderRadius: '12px',
      padding: '24px',
      textAlign: 'center',
      color: '#e6edf7',
      boxShadow: isRankUp
        ? '0 0 30px rgba(250, 204, 21, 0.25)'
        : '0 0 30px rgba(96, 165, 250, 0.25)',
      animation: 'fade-in-up 0.4s ease-out',
      overflow: 'hidden'
    }
  }, [
    showConfetti && h(Confetti),
    h('div', {
      style: {
        fontSize: '40px',
        lineHeight: 1,
        marginBottom: '12px',
        position: 'relative',
        zIndex: 1
      }
    }, isRankUp ? '🚀' : '⭐'),
    h('div', {
      style: {
        fontSize: '18px',
        fontWeight: 'bold',
        marginBottom: '6px',
        color: isRankUp ? '#facc15' : '#60a5fa',
        position: 'relative',
        zIndex: 1
      }
    }, isRankUp ? 'Повышение!' : 'Новый уровень!'),
    h('div', {
      style: {
        fontSize: '14px',
        color: '#c7ddf5',
        marginBottom: '16px',
        position: 'relative',
        zIndex: 1
      }
    }, isRankUp
      ? `Ты теперь ${levelUp.rankName}!`
      : `${levelUp.rankName} — уровень ${levelUp.levelInRank}`
    ),
    isRankUp && h('div', {
      style: {
        background: '#131d33',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '16px',
        textAlign: 'left',
        fontSize: '12px',
        color: '#9eb6d2',
        position: 'relative',
        zIndex: 1
      }
    }, [
      h('div', { style: { marginBottom: '4px', fontWeight: 600, color: '#e6edf7' } }, 'Что изменилось:'),
      h('div', null, `• Коммитов за тап: ${rankMeta.commitsPerTap ?? '—'}`),
      h('div', null, `• Макс. энергия: ${rankMeta.maxEnergy ?? '—'}`)
    ]),
    h('button', {
      onClick: clearLevelUp,
      style: {
        padding: '10px 24px',
        borderRadius: '8px',
        border: 'none',
        background: isRankUp ? '#facc15' : '#3b82f6',
        color: isRankUp ? '#1a1a2e' : '#ffffff',
        fontWeight: 'bold',
        fontSize: '14px',
        cursor: 'pointer',
        position: 'relative',
        zIndex: 1
      }
    }, 'Круто!')
  ]));
}
