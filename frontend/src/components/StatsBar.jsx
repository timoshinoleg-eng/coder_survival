import { h } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import LegacyStatsBar from './StatsBarLegacy.jsx';

export function getEnergyUiState(energy, maxEnergy) {
  const percent = maxEnergy > 0
    ? Math.max(0, Math.min(100, Math.round((Number(energy || 0) / Number(maxEnergy)) * 100)))
    : 0;

  if (percent < 10) {
    return {
      percent,
      band: 'critical',
      color: 'var(--danger)',
      message: '🔴 Критическая энергия: ниже 10% каждый тап добавляет усиленный стресс.'
    };
  }
  if (percent <= 30) {
    return {
      percent,
      band: 'warning',
      color: 'var(--accent-gold)',
      message: '⚠️ Низкая энергия: ниже 30% каждый тап добавляет дополнительный стресс.'
    };
  }
  return {
    percent,
    band: 'healthy',
    color: 'var(--accent-green)',
    message: null
  };
}

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
  // color produced by the legacy thresholds. The lookup is anchored to the
  // visible "Энергия" label, so unrelated progress bars are never touched.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const energyLabel = Array.from(root.querySelectorAll('span'))
      .find((node) => node.textContent === 'Энергия');
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
