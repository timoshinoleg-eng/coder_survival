import { jest } from '@jest/globals';
import { analyzeAndRecordTap, clearUserTapHistory } from '../src/middleware/antiCheat.js';

describe('MVP tap anti-cheat false positive guard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    clearUserTapHistory(777001);
    clearUserTapHistory(777002);
  });

  test('does not pattern-ban a legitimate fast tap burst below the CPS hard limit', () => {
    let now = Date.parse('2026-05-26T08:00:00.000Z');
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    const results = [];
    for (let index = 0; index < 12; index += 1) {
      results.push(analyzeAndRecordTap(777001));
      now += 75;
    }

    expect(results.every((result) => result.allowed)).toBe(true);
    expect(results.every((result) => result.incrementReason == null)).toBe(true);
  });

  test('still pattern-bans sustained taps above the CPS hard limit', () => {
    let now = Date.parse('2026-05-26T08:00:00.000Z');
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    let blocked = null;
    for (let index = 0; index < 12; index += 1) {
      const result = analyzeAndRecordTap(777002);
      if (!result.allowed) {
        blocked = result;
        break;
      }
      now += 40;
    }

    expect(blocked).toMatchObject({
      allowed: false,
      reason: 'pattern_ban',
      incrementReason: 'layer1_cps_over_20',
    });
  });
});
