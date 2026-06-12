import { jest } from '@jest/globals';
import {
  detectCpsViolation,
  detectMissingFatigue,
  getBanScoreIncrement,
  decayBanScore,
} from '../src/utils/anticheat.js';
import {
  shannonEntropy,
  coefficientOfVariation,
} from '../src/middleware/antiCheat.js';

describe('antiCheat pure functions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('detectCpsViolation', () => {
    test('intervals with CPS > 20 → true', () => {
      const intervals = [30, 30, 30, 30, 30]; // 33 CPS
      expect(detectCpsViolation(intervals)).toBe(true);
    });

    test('normal human intervals → false', () => {
      const intervals = [120, 110, 130, 125]; // ~8 CPS
      expect(detectCpsViolation(intervals)).toBe(false);
    });

    test('empty array → false', () => {
      expect(detectCpsViolation([])).toBe(false);
    });
  });

  describe('shannonEntropy', () => {
    test('regular intervals → low entropy', () => {
      const intervals = [100, 100, 100, 100, 100];
      const e = shannonEntropy(intervals);
      expect(e).toBeLessThan(1);
    });

    test('chaotic intervals → high entropy', () => {
      const intervals = [50, 200, 80, 300, 150, 25, 400, 120];
      const e = shannonEntropy(intervals);
      expect(e).toBeGreaterThan(2);
    });

    test('empty array → 0', () => {
      expect(shannonEntropy([])).toBe(0);
    });
  });

  describe('coefficientOfVariation', () => {
    test('identical intervals → CV = 0', () => {
      const intervals = [100, 100, 100, 100];
      expect(coefficientOfVariation(intervals)).toBe(0);
    });

    test('diverse intervals → CV > 0', () => {
      const intervals = [50, 150, 100, 200];
      expect(coefficientOfVariation(intervals)).toBeGreaterThan(0);
    });

    test('single element → returns 1', () => {
      expect(coefficientOfVariation([100])).toBe(1);
    });
  });

  describe('detectMissingFatigue', () => {
    test('firstCps=10, lastCps=12, duration>15min → true', () => {
      expect(
        detectMissingFatigue({
          firstFiveMinCps: 10,
          lastThreeMinCps: 12,
          sessionDurationMs: 16 * 60 * 1000,
        })
      ).toBe(true);
    });

    test('duration too short → false', () => {
      expect(
        detectMissingFatigue({
          firstFiveMinCps: 10,
          lastThreeMinCps: 12,
          sessionDurationMs: 5 * 60 * 1000,
        })
      ).toBe(false);
    });

    test('zero cps values → false', () => {
      expect(
        detectMissingFatigue({
          firstFiveMinCps: 0,
          lastThreeMinCps: 12,
          sessionDurationMs: 20 * 60 * 1000,
        })
      ).toBe(false);
    });
  });

  describe('getBanScoreIncrement', () => {
    test('all known reasons return values from DEFAULTS.ANTICHEAT', () => {
      expect(getBanScoreIncrement('layer1_cps_over_20')).toBe(5);
      expect(getBanScoreIncrement('layer1_pixel_perfect')).toBe(3);
      expect(getBanScoreIncrement('layer2_cv_below_0_1')).toBe(10);
      expect(getBanScoreIncrement('layer2_missing_fatigue')).toBe(7);
      expect(getBanScoreIncrement('layer3_balance_mismatch')).toBe(25);
    });

    test('unknown reason → 0', () => {
      expect(getBanScoreIncrement('unknown_reason')).toBe(0);
    });
  });

  describe('decayBanScore', () => {
    test('noNewViolations + taps>50 → score -5', () => {
      expect(decayBanScore(20, { noNewViolationsToday: true, tapsToday: 60 })).toBe(15);
    });

    test('new violations today → unchanged', () => {
      expect(decayBanScore(20, { noNewViolationsToday: false, tapsToday: 60 })).toBe(20);
    });

    test('not enough taps → unchanged', () => {
      expect(decayBanScore(20, { noNewViolationsToday: true, tapsToday: 10 })).toBe(20);
    });

    test('never goes below 0', () => {
      expect(decayBanScore(3, { noNewViolationsToday: true, tapsToday: 60 })).toBe(0);
    });
  });
});
