import { canPlay, calculateCooldownRemaining, validateScore, updateMinigameState, buildReward } from '../src/utils/minigame.js';
import { getActiveEffects, pruneExpiredEffects, addEffect, applyTapBoost } from '../src/utils/activeEffects.js';
import { applyBanScoreIncrement, applyLocPenalty, applyRewardPenaltyToPayload, decayBanScore, detectCpsViolation, detectMissingFatigue, getBanScoreTier } from '../src/utils/anticheat.js';
import { applyProductionAlertDrain, applyRandomEventChoiceState, getRandomEventTapMultiplier, reduceLegacyCodeClick } from '../src/utils/randomEventState.js';
import { calculateTapDelta } from '../src/utils/tap.js';

describe('Phase 6: Mini-Game Engine', () => {
  test('canPlay: allows play when level met and no cooldown', () => {
    const result = canPlay({}, 'hello_world', 5);
    expect(result.canPlay).toBe(true);
  });

  test('canPlay: blocks when level too low', () => {
    const result = canPlay({}, 'hello_world', 1);
    expect(result.canPlay).toBe(false);
    expect(result.reason).toBe('level_too_low');
    expect(result.requiredLevel).toBe(2);
  });

  test('canPlay: blocks when on cooldown', () => {
    const now = new Date('2026-05-22T12:00:00Z');
    const lastPlayed = new Date('2026-05-22T10:00:00Z'); // 2 hours ago, cooldown is 4h
    const state = { hello_world: { lastPlayedAt: lastPlayed.toISOString() } };
    const result = canPlay(state, 'hello_world', 5, now);
    expect(result.canPlay).toBe(false);
    expect(result.reason).toBe('cooldown');
    expect(result.remainingMs).toBe(2 * 60 * 60 * 1000);
  });

  test('canPlay: allows after cooldown expired', () => {
    const now = new Date('2026-05-22T16:00:00Z');
    const lastPlayed = new Date('2026-05-22T10:00:00Z'); // 6 hours ago
    const state = { hello_world: { lastPlayedAt: lastPlayed.toISOString() } };
    const result = canPlay(state, 'hello_world', 5, now);
    expect(result.canPlay).toBe(true);
  });

  test('calculateCooldownRemaining: returns 0 when never played', () => {
    expect(calculateCooldownRemaining({}, 'hello_world')).toBe(0);
  });

  test('calculateCooldownRemaining: returns remaining ms', () => {
    const now = new Date('2026-05-22T12:00:00Z');
    const lastPlayed = new Date('2026-05-22T10:00:00Z');
    const state = { hello_world: { lastPlayedAt: lastPlayed.toISOString() } };
    expect(calculateCooldownRemaining(state, 'hello_world', now)).toBe(2 * 60 * 60 * 1000);
  });

  test('validateScore: accepts valid score', () => {
    expect(validateScore('hello_world', 0)).toBe(true);
    expect(validateScore('hello_world', 5)).toBe(true);
    expect(validateScore('code_review', 3)).toBe(true);
  });

  test('validateScore: rejects invalid score', () => {
    expect(validateScore('hello_world', -1)).toBe(false);
    expect(validateScore('hello_world', 6)).toBe(false);
    expect(validateScore('code_review', 4)).toBe(false);
    expect(validateScore('unknown', 0)).toBe(false);
  });

  test('updateMinigameState: sets lastPlayedAt', () => {
    const now = new Date('2026-05-22T12:00:00Z');
    const result = updateMinigameState({}, 'hello_world', now);
    expect(result.hello_world.lastPlayedAt).toBe(now.toISOString());
  });

  test('buildReward: returns correct reward shape', () => {
    const hw = buildReward('hello_world');
    expect(hw.commits).toBe(50);
    expect(hw.depressionRelief).toBe(10);

    const cr = buildReward('code_review');
    expect(cr.commits).toBe(100);
    expect(cr.depressionRelief).toBe(20);
    expect(cr.tapBoostPercent).toBe(10);
    expect(cr.tapBoostDurationMinutes).toBe(10);
  });
});

describe('Phase 6: Active Effects Engine', () => {
  test('getActiveEffects: keeps only non-expired', () => {
    const now = new Date('2026-05-22T12:00:00Z');
    const effects = {
      tapBoost: { percent: 10, expiresAt: '2026-05-22T13:00:00Z' },
      oldBoost: { percent: 5, expiresAt: '2026-05-22T10:00:00Z' },
    };
    const active = getActiveEffects(effects, now);
    expect(active.tapBoost).toBeDefined();
    expect(active.oldBoost).toBeUndefined();
  });

  test('pruneExpiredEffects: removes expired entries', () => {
    const now = new Date('2026-05-22T12:00:00Z');
    const effects = {
      tapBoost: { percent: 10, expiresAt: '2026-05-22T13:00:00Z' },
      oldBoost: { percent: 5, expiresAt: '2026-05-22T10:00:00Z' },
    };
    const pruned = pruneExpiredEffects(effects, now);
    expect(pruned.tapBoost).toBeDefined();
    expect(pruned.oldBoost).toBeUndefined();
  });

  test('addEffect: creates effect with expiresAt', () => {
    const now = new Date('2026-05-22T12:00:00Z');
    const result = addEffect({}, 'tapBoost', { percent: 15 }, 10, now);
    expect(result.tapBoost.percent).toBe(15);
    expect(new Date(result.tapBoost.expiresAt).getTime()).toBe(now.getTime() + 10 * 60 * 1000);
  });

  test('applyTapBoost: applies percent correctly', () => {
    const effects = {
      tapBoost: { percent: 10, expiresAt: '2026-05-22T13:00:00Z' }
    };
    const now = new Date('2026-05-22T12:00:00Z');
    expect(applyTapBoost(effects, 100, now)).toBe(110);
    expect(applyTapBoost(effects, 50, now)).toBe(55);
  });

  test('applyTapBoost: returns base when no boost', () => {
    expect(applyTapBoost({}, 100)).toBe(100);
    expect(applyTapBoost({ tapBoost: { percent: 10, expiresAt: '2026-05-22T10:00:00Z' } }, 100, new Date('2026-05-22T12:00:00Z'))).toBe(100);
  });
});

describe('Phase 6: Tap Delta with Tap Boost', () => {
  test('calculateTapDelta: applies tapBoostPercent', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.999; // no crit
    const result = calculateTapDelta(10, 100, 0, 0, 1, 10);
    Math.random = originalRandom;
    expect(result.commitsDelta).toBe(11);
  });

  test('calculateTapDelta: no boost when percent is 0', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.999; // no crit
    const result = calculateTapDelta(10, 100, 0, 0, 1, 0);
    Math.random = originalRandom;
    expect(result.commitsDelta).toBe(10);
  });

  test('calculateTapDelta: backward compat without boost arg', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.999; // no crit
    const result = calculateTapDelta(10, 100, 0, 0, 1);
    Math.random = originalRandom;
    expect(result.commitsDelta).toBe(10);
  });
});

describe('Anticheat policy layer', () => {
  test('detectCpsViolation flags >20 clicks per second', () => {
    expect(detectCpsViolation([40, 50, 45])).toBe(true);
    expect(detectCpsViolation([80, 90, 100])).toBe(false);
  });

  test('detectMissingFatigue follows BALANCE v2 thresholds', () => {
    expect(detectMissingFatigue({ firstFiveMinCps: 10, lastThreeMinCps: 9.6, sessionDurationMs: 16 * 60 * 1000 })).toBe(true);
    expect(detectMissingFatigue({ firstFiveMinCps: 10, lastThreeMinCps: 7.0, sessionDurationMs: 16 * 60 * 1000 })).toBe(false);
  });

  test('getBanScoreTier returns graduated sanctions', () => {
    expect(getBanScoreTier(10).id).toBe('none');
    expect(getBanScoreTier(20).id).toBe('tier_1');
    expect(getBanScoreTier(50).id).toBe('tier_2');
    expect(getBanScoreTier(80).id).toBe('tier_3');
  });

  test('decayBanScore reduces score only for honest active day', () => {
    expect(decayBanScore(40, { noNewViolationsToday: true, tapsToday: 60 })).toBe(35);
    expect(decayBanScore(40, { noNewViolationsToday: false, tapsToday: 60 })).toBe(40);
  });

  test('applyBanScoreIncrement persists leaderboard hide at 50+', () => {
    const next = applyBanScoreIncrement({ banScore: 45 }, 'layer1_cps_over_20', new Date('2026-05-25T00:00:00Z'));
    expect(next.banScore).toBe(50);
    expect(next.leaderboardHidden).toBe(true);
  });

  test('applyLocPenalty applies graduated reward cuts', () => {
    expect(applyLocPenalty(100, 0)).toBe(100);
    expect(applyLocPenalty(100, 20)).toBe(90);
    expect(applyLocPenalty(100, 50)).toBe(50);
  });

  test('applyRewardPenaltyToPayload scales numeric quest/ad rewards', () => {
    const penalized = applyRewardPenaltyToPayload({ energy: 10, xp: 5, passXp: 5, stars: 5, commitsCurrent: 20 }, 50);
    expect(penalized).toEqual({ energy: 5, xp: 2, passXp: 2, stars: 2, commitsCurrent: 10 });
  });

  test('getRandomEventTapMultiplier returns x3 during hot streak', () => {
    expect(getRandomEventTapMultiplier({ randomEventState: { hotStreakUntil: '2999-01-01T00:00:00.000Z' } }, new Date('2026-05-25T00:00:00Z'))).toBe(3);
  });

  test('applyProductionAlertDrain applies 8% maxEnergy per minute tick', () => {
    const result = applyProductionAlertDrain({ randomEventState: { productionAlertUntil: '2026-05-25T00:10:00.000Z', productionAlertLastAppliedAt: '2026-05-25T00:00:00.000Z' } }, 100, new Date('2026-05-25T00:02:10.000Z'));
    expect(result.energyDrain).toBe(16);
  });

  test('applyRandomEventChoiceState activates legacy_code and hot_streak states', () => {
    const now = new Date('2026-05-25T00:00:00Z');
    const legacy = applyRandomEventChoiceState({}, 'legacy_code', 'solve', now);
    const hot = applyRandomEventChoiceState({}, 'hot_streak', 'solve', now);
    expect(legacy.legacyCodeClicksRemaining).toBe(10);
    expect(hot.hotStreakUntil).toBe('2026-05-25T00:01:00.000Z');
  });

  test('reduceLegacyCodeClick decrements and floors at zero', () => {
    expect(reduceLegacyCodeClick({ legacyCodeClicksRemaining: 2 }).legacyCodeClicksRemaining).toBe(1);
    expect(reduceLegacyCodeClick({ legacyCodeClicksRemaining: 1 }).legacyCodeClicksRemaining).toBe(0);
    expect(reduceLegacyCodeClick({ legacyCodeClicksRemaining: 0 }).legacyCodeClicksRemaining).toBe(0);
  });
});
