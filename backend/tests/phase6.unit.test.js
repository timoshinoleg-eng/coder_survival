import { canPlay, calculateCooldownRemaining, validateScore, updateMinigameState, buildReward } from '../src/utils/minigame.js';
import { getActiveEffects, pruneExpiredEffects, addEffect, applyTapBoost } from '../src/utils/activeEffects.js';
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
