import { PRESTIGE } from '../config/balance.js';

export function computePrestige(commitsTotal) {
  const n = Number(commitsTotal);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(Math.sqrt(n / 10));
}

export function applyPrestigeBonuses(levelState, prestigeLevel, shopPurchases = {}) {
  const raw = Number(prestigeLevel);
  const safe = Number.isFinite(raw) ? Math.max(0, raw) : 0;
  const p = Math.min(PRESTIGE.MAX_PRESTIGE_LEVEL, safe);

  return {
    ...levelState,
    commitsPerTap: levelState.commitsPerTap * (1 + PRESTIGE.BONUSES.TAP_MULT_PER_LEVEL * p),
    maxEnergy: levelState.maxEnergy + PRESTIGE.BONUSES.MAX_ENERGY_ADD_PER_LEVEL * p,
    critChanceAdd: PRESTIGE.BONUSES.CRIT_CHANCE_ADD_PER_LEVEL * p,
    energyRecoveryMult: 1 + PRESTIGE.BONUSES.ENERGY_RECOVERY_MULT_PER_LEVEL * p,
    depressionResistanceMult: Math.max(0, 1 - PRESTIGE.BONUSES.DEPRESSION_RESISTANCE_PER_LEVEL * p),
    prestigeLevel: p,
    prestigeShopPurchases: shopPurchases,
  };
}
