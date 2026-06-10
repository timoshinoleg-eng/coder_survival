import { TAP_MECHANICS } from '../config/balance.js';

export function calculateTapDelta(baseCommits, energy, depression, streak, commitMultiplier = 1, tapBoostPercent = 0, critChanceAdd = 0, clickPowerMult = 1) {
  const energyMultiplier = energy / 100;
  const depressionPenalty = Math.min(1, depression / TAP_MECHANICS.afflictionDepression);
  const streakBonus = Math.min(
    streak * TAP_MECHANICS.streakBonusPerDay,
    TAP_MECHANICS.streakBonusCap
  );

  let base = Math.round(
    baseCommits
    * energyMultiplier
    * (1 - depressionPenalty * TAP_MECHANICS.depressionPenaltyMultiplier)
    * (1 + streakBonus)
    * commitMultiplier
  );
  if (base < 1) base = 1;

  const roll = Math.random();
  let multiplier = 1;
  let tier = null;

  const goldChance = Math.min(0.25, TAP_MECHANICS.critGoldChance + critChanceAdd);
  const silverChance = TAP_MECHANICS.critSilverChance;

  if (roll < goldChance) {
    multiplier = 3;
    tier = 'gold';
  } else if (roll < goldChance + silverChance) {
    multiplier = 2;
    tier = 'silver';
  }

  let commitsDelta = Math.round(base * multiplier);
  const isBurnout = depression >= TAP_MECHANICS.maxDepression;

  if (isBurnout) {
    commitsDelta = Math.max(
      1,
      Math.floor(commitsDelta * TAP_MECHANICS.burnoutCommitMultiplier)
    );
  }

  const totalMultiplier = (1 + (tapBoostPercent || 0) / 100) * (clickPowerMult || 1);
  if (totalMultiplier !== 1) {
    commitsDelta = Math.round(commitsDelta * totalMultiplier);
  }

  return {
    commitsDelta,
    isCrit: multiplier > 1,
    critTier: tier,
    isBurnout
  };
}

export function calculateDepressionDelta(energy, depressionMultiplier = 1) {
  let delta = TAP_MECHANICS.depressionGainPerTap;
  if (energy < 30) delta += TAP_MECHANICS.depressionGainLowEnergy;
  if (energy < 10) delta += TAP_MECHANICS.depressionGainCriticalEnergy;
  return Math.max(0, delta * depressionMultiplier);
}
