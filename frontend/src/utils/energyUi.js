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
