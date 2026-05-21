import { TAP_MECHANICS } from '../config/balance.js';

export function calculateTapDelta(baseCommits, energy, depression, streak, commitMultiplier = 1, tapBoostPercent = 0) {
  const energyMultiplier = energy / 100;
  const depressionPenalty = depression / 100;
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

  if (roll < TAP_MECHANICS.critGoldChance) {
    multiplier = 3;
    tier = 'gold';
  } else if (roll < TAP_MECHANICS.critGoldChance + TAP_MECHANICS.critSilverChance) {
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

  if (tapBoostPercent > 0) {
    commitsDelta = Math.round(commitsDelta * (1 + tapBoostPercent / 100));
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
  return delta * depressionMultiplier;
}
