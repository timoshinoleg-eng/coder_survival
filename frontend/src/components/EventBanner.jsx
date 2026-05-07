import { h } from 'preact';
import { useGameState } from '../hooks/useGameState.js';

export default function EventBanner() {
  const { event } = useGameState();

  if (!event) return null;

  const progress = event.myContribution?.progressPercent || 0;
  const isComplete = event.myContribution?.claimed === false && progress >= 100;

  return h('div', {
    style: {
      position: 'absolute',
      top: '8px',
      left: '8px',
      right: '8px',
      zIndex: 44,
      background: 'linear-gradient(90deg, #1a3a5c, #274267)',
      border: '1px solid #30527e',
      borderRadius: '10px',
      padding: '8px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      animation: 'fade-in-up 0.3s ease-out'
    }
  }, [
    h('div', { style: { fontSize: '20px' } }, '⚡'),
    h('div', { style: { flex: 1, minWidth: 0 } }, [
      h('div', { style: { fontWeight: 700, fontSize: '12px', color: '#facc15' } }, event.title),
      h('div', { style: { fontSize: '10px', color: '#c7ddf5' } }, `${event.myContribution?.commitsContributed || 0} / ${event.targetCommits} коммитов`),
      h('div', {
        style: {
          flex: 1,
          height: '5px',
          background: '#0f3460',
          borderRadius: '3px',
          overflow: 'hidden',
          marginTop: '4px'
        }
      }, h('div', {
        style: {
          width: `${Math.min(100, progress)}%`,
          height: '100%',
          background: isComplete ? '#4ade80' : '#60a5fa',
          transition: 'width 0.4s ease'
        }
      }))
    ]),
    isComplete && h('span', {
      style: {
        fontSize: '11px',
        background: '#4ade80',
        color: '#0a1f12',
        padding: '3px 8px',
        borderRadius: '6px',
        fontWeight: 'bold',
        whiteSpace: 'nowrap'
      }
    }, 'Награда!')
  ]);
}
