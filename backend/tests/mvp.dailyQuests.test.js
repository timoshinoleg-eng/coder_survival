import {
  DAILY_QUESTS_VERSION,
  generateDailyQuests,
  getFallbackAvgDailyFarm,
} from '../src/utils/dailyQuests.js';

describe('MVP Daily Quests v1.0 — locked model + smoke tests', () => {
  test('DAILY_QUESTS_VERSION is v1.0', () => {
    expect(DAILY_QUESTS_VERSION).toBe('v1.0');
  });

  test('new user day 1 gets front-loaded main quest rewards', () => {
    const quests = generateDailyQuests(1, '2026-05-26', 1, 1, null);
    const mainQuest = quests.find((q) => q.id === 'q_login');
    expect(mainQuest).toBeDefined();
    expect(mainQuest.reward.commitsCurrent).toBeGreaterThan(0);
    // fallback day1 = 5000, front-load 2.5x, 10% split → 5000 * 0.10 * 2.5 = 1250
    expect(mainQuest.reward.commitsCurrent).toBe(1250);
  });

  test('veteran user (day 7) gets no front-loading', () => {
    const quests = generateDailyQuests(1, '2026-05-26', 1, 7, 30000);
    const mainQuest = quests.find((q) => q.id === 'q_login');
    expect(mainQuest).toBeDefined();
    // avgDailyFarm 30000, no front-load, 10% split → 30000 * 0.10 = 3000
    expect(mainQuest.reward.commitsCurrent).toBe(3000);
  });

  test('rolling average override is used when provided', () => {
    const quests = generateDailyQuests(1, '2026-05-26', 1, 7, 50000);
    const mainQuest = quests.find((q) => q.id === 'q_tap300');
    expect(mainQuest.reward.commitsCurrent).toBe(5000); // 50000 * 0.10
  });

  test('fallback correctly used when avgDailyFarmOverride is null and accountAge <= 3', () => {
    const quests = generateDailyQuests(1, '2026-05-26', 1, 2, null);
    const mainQuest = quests.find((q) => q.id === 'q_earn10000');
    // day2 fallback = 12000, front-load 2.5x, 10% → 12000 * 0.10 * 2.5 = 3000
    expect(mainQuest.reward.commitsCurrent).toBe(3000);
  });

  test('edge case: zero or negative avgDailyFarm falls back safely without NaN/Infinity', () => {
    const quests = generateDailyQuests(1, '2026-05-26', 1, 7, 0);
    const mainQuest = quests.find((q) => q.id === 'q_login');
    expect(Number.isFinite(mainQuest.reward.commitsCurrent)).toBe(true);
    // zero triggers fallback for day 7 (25000 * 0.10 = 2500)
    expect(mainQuest.reward.commitsCurrent).toBe(2500);
  });

  test('bonus quest reward is 5% of avgDailyFarm', () => {
    const quests = generateDailyQuests(1, '2026-05-26', 1, 7, 20000);
    const bonus = quests.find((q) => q.isBonus);
    expect(bonus).toBeDefined();
    expect(bonus.reward.commitsCurrent).toBe(1000); // 20000 * 0.05
  });

  test('getFallbackAvgDailyFarm returns correct values per day', () => {
    expect(getFallbackAvgDailyFarm(1)).toBe(5000);
    expect(getFallbackAvgDailyFarm(2)).toBe(12000);
    expect(getFallbackAvgDailyFarm(3)).toBe(25000);
    expect(getFallbackAvgDailyFarm(4)).toBe(25000);
    expect(getFallbackAvgDailyFarm(99)).toBe(25000);
  });
});
