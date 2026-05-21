import { h } from 'preact';

export default function Confetti({ pieceCount = 18, duration = 1.2 }) {
  const pieces = Array.from({ length: pieceCount }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 0.4}s`,
    color: ['#facc15', '#4ade80', '#60a5fa', '#c084fc', '#f87171'][Math.floor(Math.random() * 5)]
  }));

  return h('div', {
    style: { position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 50 }
  }, pieces.map(p => h('div', {
    key: p.id,
    style: {
      position: 'absolute', top: '-10px', left: p.left,
      width: '6px', height: '6px', borderRadius: '50%', background: p.color,
      animation: `confetti-fall ${duration}s ease-out ${p.delay} forwards`
    }
  })));
}
