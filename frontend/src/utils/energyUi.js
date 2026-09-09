export const ENERGY_STRESS_CRITICAL_THRESHOLD = 10;
export const ENERGY_STRESS_WARNING_THRESHOLD = 30;

export function getEnergyUiState(energy, maxEnergy) {
  const numericEnergy = Number(energy || 0);
  const percent = maxEnergy > 0
    ? Math.max(0, Math.min(100, Math.round((numericEnergy / Number(maxEnergy)) * 100)))
    : 0;

  if (numericEnergy < ENERGY_STRESS_CRITICAL_THRESHOLD) {
    return {
      percent,
      band: 'critical',
      color: 'var(--danger)',
      message: '🔴 Критическая энергия: ниже 10 ед. каждый тап добавляет усиленный стресс.'
    };
  }
  if (numericEnergy < ENERGY_STRESS_WARNING_THRESHOLD) {
    return {
      percent,
      band: 'warning',
      color: 'var(--accent-gold)',
      message: '⚠️ Низкая энергия: ниже 30 ед. каждый тап добавляет дополнительный стресс.'
    };
  }
  return {
    percent,
    band: 'healthy',
    color: 'var(--accent-green)',
    message: null
  };
}
