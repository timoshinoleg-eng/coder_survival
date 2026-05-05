import { h } from 'preact';
import { useGameState } from '../hooks/useGameState.js';

export default function StatsBar() {
  const { commits, energy, depression, level, coffeeCups } = useGameState();

  const energyColor = energy > 50 ? '#4ade80' : energy > 20 ? '#facc15' : '#ef4444';
  const depressionColor = depression < 30 ? '#4ade80' : depression < 70 ? '#facc15' : '#ef4444';

  return h('div', {
    style: {
      position: 'relative',
      zIndex: 10,
      background: '#16213e',
      borderBottom: '2px solid #0f3460',
      padding: '8px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      fontSize: '12px',
      color: '#e0e0e0',
      userSelect: 'none'
    }
  }, [
    // Top row: level + commits
    h('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
    }, [
      h('span', null, `LVL ${level}`),
      h('span', { style: { fontWeight: 'bold', color: '#4ade80' } }, `Коммиты: ${commits}`)
    ]),

    // Energy bar
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
      h('span', { style: { minWidth: '50px' } }, 'Энергия:'),
      h('div', {
        style: {
          flex: 1,
          height: '8px',
          background: '#0f3460',
          borderRadius: '4px',
          overflow: 'hidden'
        }
      }, h('div', {
        style: {
          width: `${energy}%`,
          height: '100%',
          background: energyColor,
          transition: 'width 0.2s, background 0.3s'
        }
      })),
      h('span', { style: { minWidth: '30px', textAlign: 'right' } }, `${Math.round(energy)}%`)
    ]),

    // Depression bar
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
      h('span', { style: { minWidth: '50px' } }, 'Депрессия:'),
      h('div', {
        style: {
          flex: 1,
          height: '8px',
          background: '#0f3460',
          borderRadius: '4px',
          overflow: 'hidden'
        }
      }, h('div', {
        style: {
          width: `${depression}%`,
          height: '100%',
          background: depressionColor,
          transition: 'width 0.2s, background 0.3s'
        }
      })),
      h('span', { style: { minWidth: '30px', textAlign: 'right' } }, `${Math.round(depression)}%`)
    ]),

    // Coffee indicator
    h('div', {
      style: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#a0a0a0' }
    }, [
      h('span', null, '☕'),
      h('span', null, `×${coffeeCups}`)
    ])
  ]);
}
