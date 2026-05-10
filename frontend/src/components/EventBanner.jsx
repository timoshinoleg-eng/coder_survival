import { h } from 'preact';
import { useGameState } from '../hooks/useGameState.js';

function modifiersText(modifiers = {}) {
  const parts = [];
  if (modifiers.energyRecoveryMult) parts.push('2x энергия');
  if (modifiers.commitMult) parts.push('2x коммиты');
  if (modifiers.critChanceAdd) parts.push('+10% крит');
  if (modifiers.depressionImmunityMinutes) parts.push('иммунитет к депрессии');
  return parts.join(' · ');
}

export default function EventBanner() {
  const { event, liveEvent } = useGameState();
  const live = liveEvent?.event;

  if (live) {
    return h('div', {
      style: {
        position: 'absolute',
        top: '8px',
        left: '8px',
        right: '8px',
        zIndex: 44,
        background: 'linear-gradient(90deg, #b45309, #facc15)',
        borderRadius: '8px',
        padding: '9px 12px',
        color: '#111827',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)'
      }
    }, [
      h('strong', { style: { fontSize: '13px' } }, live.name),
      h('div', { style: { fontSize: '11px', marginTop: '2px' } }, modifiersText(live.modifiers))
    ]);
  }

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
      borderRadius: '8px',
      padding: '8px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)'
    }
  }, [
    h('div', { style: { fontSize: '20px' } }, '⚡'),
    h('div', { style: { flex: 1, minWidth: 0 } }, [
      h('div', { style: { fontWeight: 700, fontSize: '12px', color: '#facc15' } }, event.title),
      h('div', { style: { fontSize: '10px', color: '#c7ddf5' } }, `${event.myContribution?.commitsContributed || 0} / ${event.targetCommits} коммитов`),
      h('div', { style: { height: '5px', background: '#0f3460', borderRadius: '3px', overflow: 'hidden', marginTop: '4px' } },
        h('div', { style: { width: `${Math.min(100, progress)}%`, height: '100%', background: isComplete ? '#4ade80' : '#60a5fa' } })
      )
    ]),
    isComplete && h('span', { style: { fontSize: '11px', background: '#4ade80', color: '#0a1f12', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', whiteSpace: 'nowrap' } }, 'Награда!')
  ]);
}
