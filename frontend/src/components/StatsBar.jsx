import { h } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { getEnergyUiState } from '../utils/energyUi.js';
import LegacyStatsBar from './StatsBarLegacy.jsx';

export default function StatsBar(props) {
  const rootRef = useRef(null);
  const gameState = useGameState();
  const energyState = useMemo(
    () => getEnergyUiState(gameState.energy, gameState.maxEnergy),
    [gameState.energy, gameState.maxEnergy]
  );

  const productionAlertActive = Boolean(
    gameState.randomEventState?.productionAlertUntil
    && new Date(gameState.randomEventState.productionAlertUntil).getTime() > Number(props.runtimeNow || Date.now())
  );

  // Keep the large, battle-tested HUD intact while overriding only the energy
  // color produced by the legacy thresholds. The source component renders the
  // icon and label in one span ("⚡Энергия"), so match the visible label rather
  // than relying on an exact text node shape.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const energyLabel = Array.from(root.querySelectorAll('span'))
      .find((node) => String(node.textContent || '').includes('Энергия'));
    const row = energyLabel?.parentElement;
    const track = row?.children?.[1];
    const fill = track?.firstElementChild;
    const value = row?.children?.[2];
    if (fill) {
      fill.style.background = productionAlertActive ? 'var(--danger-light)' : energyState.color;
    }
    if (value) {
      value.style.color = energyState.color;
    }
  }, [energyState.color, productionAlertActive, props.runtimeNow]);

  return h('div', { ref: rootRef, 'data-energy-band': energyState.band }, [
    h(LegacyStatsBar, props),
    energyState.message && h(
      'div',
      {
        role: 'status',
        'aria-live': 'polite',
        style: {
          marginTop: '4px',
          padding: '4px 8px',
          borderLeft: `3px solid ${energyState.color}`,
          color: energyState.color,
          background: 'rgba(15, 23, 42, 0.92)',
          fontSize: '11px',
          fontWeight: 700,
          lineHeight: 1.35,
          fontFamily: 'var(--font-pixel)'
        }
      },
      energyState.message
    )
  ]);
}
