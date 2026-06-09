import { applyPrestigeBonuses } from './prestige.js';

export function resolveLevelState(baseState, options = {}) {
  const levelState = {
    level: Number(baseState?.level ?? 1),
    tier: Number(baseState?.tier ?? 1),
    commitsPerTap: Number(baseState?.commitsPerTap ?? 1),
    maxEnergy: Number(baseState?.maxEnergy ?? 100),
    critChanceAdd: Number(baseState?.critChanceAdd ?? 0),
    energyRecoveryMult: Number(baseState?.energyRecoveryMult ?? 1),
    depressionResistanceMult: Number(baseState?.depressionResistanceMult ?? 1),
    prestigeLevel: Number(baseState?.prestigeLevel ?? 0),
  };

  const p = Number(options?.prestigeLevel ?? baseState?.prestigeLevel ?? 0);
  const shopPurchases = options?.shopPurchases ?? baseState?.prestigeShopPurchases ?? {};
  const bonused = applyPrestigeBonuses(levelState, p, shopPurchases);

  return {
    ...bonused,
    prestigeLevel: bonused.prestigeLevel,
  };
}
