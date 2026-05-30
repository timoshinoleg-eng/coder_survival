import { DEFAULTS } from '../config/balance.js';

const { ANTICHEAT } = DEFAULTS;

export function normalizeAntiCheatState(state = {}) {
  return {
    banScore: Math.max(0, Number(state.banScore || 0)),
    lastViolationAt: state.lastViolationAt || null,
    leaderboardHidden: state.leaderboardHidden === true,
  };
}

export function getBanScoreIncrement(reason) {
  switch (reason) {
    case 'layer1_cps_over_20':
      return ANTICHEAT.banScoreIncrements.layer1CpsOver20;
    case 'layer1_pixel_perfect':
      return ANTICHEAT.banScoreIncrements.layer1PixelPerfect;
    case 'layer2_cv_below_0_1':
      return ANTICHEAT.banScoreIncrements.layer2CvBelow01;
    case 'layer2_missing_fatigue':
      return ANTICHEAT.banScoreIncrements.layer2MissingFatigue;
    case 'layer3_balance_mismatch':
      return ANTICHEAT.banScoreIncrements.layer3BalanceMismatch;
    default:
      return 0;
  }
}

export function detectCpsViolation(intervalsMs = []) {
  if (!Array.isArray(intervalsMs) || intervalsMs.length === 0) return false;
  const cpsValues = intervalsMs
    .filter((interval) => Number.isFinite(interval) && interval > 0)
    .map((interval) => 1000 / interval);
  return cpsValues.some((cps) => cps > 20);
}

export function detectPixelPerfectViolation(points = []) {
  if (!Array.isArray(points) || points.length < 2) return false;
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const next = points[index];
    if (!prev || !next) continue;
    const dx = Number(next.x || 0) - Number(prev.x || 0);
    const dy = Number(next.y || 0) - Number(prev.y || 0);
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 0.001) return true;
  }
  return false;
}

export function detectCvViolation(cv) {
  return Number.isFinite(cv) && cv < 0.1;
}

export function detectMissingFatigue({ firstFiveMinCps = 0, lastThreeMinCps = 0, sessionDurationMs = 0 }) {
  if (sessionDurationMs <= ANTICHEAT.fatigueDetection.flagAfterMs) return false;
  if (firstFiveMinCps <= 0 || lastThreeMinCps <= 0) return false;
  return lastThreeMinCps >= firstFiveMinCps * ANTICHEAT.fatigueDetection.suspiciousThresholdRatio;
}

export function getBanScoreTier(score) {
  const value = Number(score || 0);
  if (value >= 80) return { id: 'tier_3', action: 'ban_7_days', effects: ['ban_7_days', 'appeal_button_for_human_review'] };
  if (value >= 50) return { id: 'tier_2', action: 'restrict', effects: ['rewards_minus_50_percent', 'leaderboard_ban'] };
  if (value >= 20) return { id: 'tier_1', action: 'warn', effects: ['rewards_minus_10_percent'] };
  return { id: 'none', action: null, effects: [] };
}

export function getRewardPenaltyMultiplier(score) {
  const tier = getBanScoreTier(score);
  if (tier.id === 'tier_2') return 0.5;
  if (tier.id === 'tier_1') return 0.9;
  return 1;
}

export function applyLocPenalty(value, score) {
  const numeric = Math.max(0, Number(value || 0));
  return Math.max(0, Math.floor(numeric * getRewardPenaltyMultiplier(score)));
}

export function applyRewardPenaltyToPayload(payload = {}, score = 0) {
  const multiplier = getRewardPenaltyMultiplier(score);
  if (multiplier === 1) return { ...payload };

  const next = { ...payload };
  for (const key of ['energy', 'xp', 'passXp', 'stars', 'commitsCurrent', 'depressionRelief']) {
    if (typeof next[key] === 'number') {
      next[key] = Math.max(0, Math.floor(next[key] * multiplier));
    }
  }
  return next;
}

export function applyBanScoreIncrement(state = {}, incrementReason, now = new Date()) {
  const next = normalizeAntiCheatState(state);
  next.banScore += getBanScoreIncrement(incrementReason);
  next.lastViolationAt = now.toISOString();
  next.leaderboardHidden = next.banScore >= 50;
  return next;
}

export function decayBanScore(score, { noNewViolationsToday = false, tapsToday = 0 } = {}) {
  const value = Math.max(0, Number(score || 0));
  if (!noNewViolationsToday || Number(tapsToday || 0) <= 50) return value;
  return Math.max(ANTICHEAT.banScoreDecay.floor, value + ANTICHEAT.banScoreDecay.ratePerDay);
}
