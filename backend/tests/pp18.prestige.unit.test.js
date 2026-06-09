import { describe, expect, test } from '@jest/globals';
import { computePrestige, applyPrestigeBonuses } from '../src/utils/prestige.js';
import { calculateDepressionDelta } from '../src/utils/tap.js';

describe('computePrestige', () => {
  test('handles negative input (returns 0)', () => {
    expect(computePrestige(-10)).toBe(0);
  });

  test('handles NaN input (returns 0)', () => {
    expect(computePrestige(Number.NaN)).toBe(0);
  });

  test('handles Infinity input (returns 0)', () => {
    expect(computePrestige(Number.POSITIVE_INFINITY)).toBe(0);
  });

  test('computes prestige by sqrt formula', () => {
    expect(computePrestige(12.5)).toBe(1);
    expect(computePrestige(40)).toBe(2);
  });
});

describe('applyPrestigeBonuses', () => {
  const baseState = {
    commitsPerTap: 10,
    maxEnergy: 100,
    critChanceAdd: 0,
    energyRecoveryMult: 1,
    depressionResistanceMult: 1,
  };

  test('p=0 returns normalized prestigeLevel 0', () => {
    const result = applyPrestigeBonuses(baseState, 0, {});
    expect(result.prestigeLevel).toBe(0);
    expect(result.commitsPerTap).toBe(10);
    expect(result.maxEnergy).toBe(100);
  });

  test('applies bonuses for prestige level', () => {
    const result = applyPrestigeBonuses(baseState, 2, {});
    expect(result.prestigeLevel).toBe(2);
    expect(result.commitsPerTap).toBeGreaterThan(10);
    expect(result.maxEnergy).toBeGreaterThan(100);
    expect(result.energyRecoveryMult).toBeGreaterThan(1);
  });

  test('caps prestige level by config max', () => {
    const result = applyPrestigeBonuses(baseState, 100, {});
    expect(result.prestigeLevel).toBeLessThanOrEqual(20);
  });
});

describe('calculateDepressionDelta', () => {
  test('negative multiplier result is clamped to zero', () => {
    expect(calculateDepressionDelta(5, -1)).toBe(0);
  });

  test('positive multiplier still works', () => {
    expect(calculateDepressionDelta(5, 2)).toBe(10);
  });
});
