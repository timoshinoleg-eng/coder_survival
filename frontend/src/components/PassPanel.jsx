import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import Confetti from './Confetti.jsx';

function iconForReward(reward) {
  if (!reward) return '·';
  if (reward.skin || reward.skinFragment) return '🎭';
  if (reward.stars) return '⭐';
  if (reward.title) return '🏷';
  return '⚡';
}

export default function PassPanel() {
  const { pass, refreshPass } = useGameState();
  const [open, setOpen] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const prevLevelRef = useRef(null);
  const levels = pass?.levels || [];
  const currentLevel = Number(pass?.currentLevel || 0);
  const progress = Math.max(0, Math.min(100, Math.round((pass?.progressToNext || 0) * 100)));
  const nextLevelXp = pass?.nextLevelXp || 0;
  const remainingXp = pass?.remainingXp || 0;
  const currentLevelXp = nextLevelXp > 0 ? nextLevelXp - remainingXp : 0;

  useEffect(() => {
    if (prevLevelRef.current !== null && currentLevel > prevLevelRef.current) {
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 1200);
      return () => clearTimeout(t);
    }
    prevLevelRef.current = currentLevel;
  }, [currentLevel]);

  return h('section', {
    style: {
      margin: '8px 12px',
      border: '1px solid #263d5f',
      borderRadius: '8px',
      background: '#10192d',
      color: '#e6edf7',
      overflow: 'hidden',
      position: 'relative',
    },
  }, [
    showConfetti && h(Confetti),
    h('style', null, '@keyframes passPulse { 0%,100% { box-shadow: none; } 50% { box-shadow: 0 0 16px rgba(250,204,21,.45); } }'),
    h('button', {
      type: 'button',
      onClick: () => {
        setOpen((value) => !value);
        refreshPass?.();
      },
      style: {
        width: '100%',
        minHeight: '48px',
        border: 'none',
        background: '#121d33',
        color: '#e6edf7',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        fontWeight: 800,
      },
    }, [
      h('span', null, `Sprint Pass · ${currentLevel}/20`),
      h('span', { style: { color: '#8ba1bb', fontSize: '12px' } }, `${pass?.daysRemaining ?? 0} дн.`),
    ]),
    h('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 12px 8px',
        fontSize: '11px',
        color: '#8ba1bb',
      }
    }, [
      h('span', null, `${currentLevelXp} / ${nextLevelXp} XP`),
      h('span', null, `${progress}%`),
    ]),
    h('div', { style: { height: '6px', background: '#0f3460' } },
      h('div', {
        style: {
          width: `${currentLevel >= 20 ? 100 : progress}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #60a5fa, #facc15)',
        },
      }),
    ),
    open && h('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '8px',
        padding: '12px',
      },
    }, levels.map((level) => {
      const past = level.level < currentLevel;
      const current = level.level === currentLevel;
      const future = level.level > currentLevel;
      const milestone = [5, 10, 15, 20].includes(level.level);
      return h('div', {
        key: level.level,
        style: {
          minHeight: '58px',
          borderRadius: '8px',
          border: milestone && future ? '1px dashed #f97316' : '1px solid #30527e',
          background: past ? '#17351f' : current ? '#3b2f10' : '#121d33',
          color: past ? '#4ade80' : current ? '#facc15' : '#8ba1bb',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          animation: current ? 'passPulse 1.5s infinite' : 'none',
          fontSize: '11px',
          fontWeight: 800,
        },
      }, [
        h('span', null, level.level),
        h('span', null, iconForReward(level.freeReward || level.premiumReward)),
      ]);
    })),
    open && h('div', {
      style: {
        padding: '0 12px 12px',
        color: '#8ba1bb',
        fontSize: '11px',
      },
    }, `Сезон закончится через ${pass?.daysRemaining ?? 0} дней`),
  ]);
}
