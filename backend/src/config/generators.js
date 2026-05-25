import { DEFAULTS } from './balance.js';

export const GENERATOR_MATRIX = DEFAULTS.GENERATORS;
export const FTUE_ACCELERATION = DEFAULTS.FTUE_ACCELERATION;

export function getFtueAcceleration(accountAgeMinutes = 0) {
  const age = Math.max(0, Number(accountAgeMinutes || 0));
  return FTUE_ACCELERATION.find((window) => age >= window.minMinutes && age < window.maxMinutes)
    || FTUE_ACCELERATION[FTUE_ACCELERATION.length - 1];
}

export function calculateGeneratorCost(tierId, ownedCount = 0, accountAgeMinutes = 61) {
  const tier = GENERATOR_MATRIX.tiers[tierId];
  if (!tier) return null;
  const acceleration = getFtueAcceleration(accountAgeMinutes);
  const baseCost = tier.baseCost * Math.pow(GENERATOR_MATRIX.GROWTH_RATE, Math.max(0, Number(ownedCount || 0)));
  return Math.floor(baseCost * acceleration.costMultiplier);
}

export function calculateGeneratorOutput(tierId, ownedCount = 1, accountAgeMinutes = 61) {
  const tier = GENERATOR_MATRIX.tiers[tierId];
  if (!tier) return null;
  const acceleration = getFtueAcceleration(accountAgeMinutes);
  return tier.baseOutput * Math.max(0, Number(ownedCount || 0)) * acceleration.incomeMultiplier;
}

export function isGeneratorUnlocked(tierId, owned = {}) {
  const tier = GENERATOR_MATRIX.tiers[tierId];
  if (!tier) return false;
  if (!tier.requires) return true;
  return Number(owned[tier.requires.tier] || 0) >= tier.requires.owned;
}
