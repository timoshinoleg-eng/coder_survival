import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';

const Z_INDEX_BANNER = 30;

function formatRemaining(endsAt) {
  if (!endsAt) return 'скоро закончится';
  const diffMs = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 'завершено';
  const totalSec = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  return `${hours}ч ${minutes}м`;
}

export default function CrunchTimeBanner({ suppressed = false }) {
  const { crunchTime } = useGameState();

  const active = crunchTime?.active === true;
  const remaining = useMemo(() => formatRemaining(crunchTime?.endsAt), [crunchTime?.endsAt]);

  if (suppressed || !active) return null;

  return h('div', {
    style: {
      position: 'absolute',
      top: '64px',
      left: '8px',
      right: '8px',
      zIndex: Z_INDEX_BANNER,
      background: 'linear-gradient(90deg, #5a2d1a, #7c3b1c)',
      border: '1px solid rgba(250, 204, 21, 0.35)',
      borderRadius: '10px',
      padding: '8px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      animation: 'fade-in-up 0.3s ease-out'
    }
  }, [
    h('div', { style: { fontSize: '20px' } }, '🔥'),
    h('div', { style: { flex: 1 } }, [
      h('div', { style: { fontWeight: 700, fontSize: '12px', color: '#fde68a' } }, 'CRUNCH TIME'),
      h('div', { style: { fontSize: '10px', color: '#fce7c3' } }, `${crunchTime.commitMultiplier || 2}x коммиты, ${crunchTime.depressionMultiplier || 1.5}x стресс · осталось ${remaining}`)
    ])
  ]);
}
