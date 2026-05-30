import { calculateGeneratorCost, calculateGeneratorOutput, GENERATOR_MATRIX, getFtueAcceleration, isGeneratorUnlocked } from '../config/generators.js';

function normalizeOwned(state = {}) {
  const owned = {};
  for (const tierId of Object.keys(GENERATOR_MATRIX.tiers)) {
    owned[tierId] = Math.max(0, Number(state?.owned?.[tierId] || 0));
  }
  return owned;
}

export function normalizeGeneratorState(state = {}) {
  return {
    owned: normalizeOwned(state),
    purchasedAt: state?.purchasedAt || {},
    lastCollectedAt: state?.lastCollectedAt || null,
  };
}

export function buildGeneratorStatus(state = {}, accountAgeMinutes = 61, options = {}) {
  const normalized = normalizeGeneratorState(state);
  const acceleration = getFtueAcceleration(accountAgeMinutes);
  const costMultiplier = Math.max(1, Number(options.costMultiplier || 1));

  const tiers = Object.entries(GENERATOR_MATRIX.tiers).map(([tierId, tier]) => {
    const owned = normalized.owned[tierId] || 0;
    return {
      id: tierId,
      owned,
      baseOutput: tier.baseOutput,
      baseCost: tier.baseCost,
      unlocked: isGeneratorUnlocked(tierId, normalized.owned),
      nextCost: Math.floor(calculateGeneratorCost(tierId, owned, accountAgeMinutes) * costMultiplier),
      outputPerSecond: calculateGeneratorOutput(tierId, owned, accountAgeMinutes),
      requires: tier.requires || null
    };
  });

  return {
    owned: normalized.owned,
    accountAgeMinutes,
    ftueAcceleration: acceleration,
    costMultiplier,
    passiveLocPerSecond: tiers.reduce((sum, tier) => sum + Number(tier.outputPerSecond || 0), 0),
    tiers
  };
}
