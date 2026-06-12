import assert from 'assert';
import { STAGE2 } from '../src/config/balance.js';
import { calculateGeneratorCost, calculateGeneratorOutput, getFtueAcceleration, isGeneratorUnlocked } from '../src/config/generators.js';
import { generateDailyQuests, getFallbackAvgDailyFarm, rollLootBox } from '../src/utils/dailyQuests.js';
import { getRollingAvgDailyFarm } from '../src/utils/farmLog.js';
import { buildGeneratorStatus } from '../src/utils/generatorState.js';
import {
  addPassXp,
  applyPassXpSourceMultiplier,
  calculateCatchUpXp,
  calculateCappedCatchUpXp,
  calculatePassLevel,
  getClaimableRewards,
  getPassRequiredXp,
  getWeekendXpMultiplier
} from '../src/utils/pass.js';
import { processDailyLogin } from '../src/utils/streak.js';

test('Oracle 1: quest determinism', () => {
  const q1 = generateDailyQuests('test_user', '2026-05-10', 1, 1);
  const q2 = generateDailyQuests('test_user', '2026-05-10', 1, 1);
  assert.deepStrictEqual(q1.map((quest) => quest.id), q2.map((quest) => quest.id));
  assert.deepStrictEqual(q1.map((quest) => quest.id), ['q_login', 'q_tap300', 'q_earn10000', 'q_bonus_buy_generator']);
});

test('Oracle 2: pass XP conservation', () => {
  // 50-level tiered curve totals 10000 XP; reaching MAX_LEVEL caps progressToNext at 1.0
  const result = addPassXp({ currentXp: 0, claimedLevels: [] }, 10000);
  assert.strictEqual(calculatePassLevel(result.newState).currentLevel, 50);
  assert.strictEqual(calculatePassLevel(result.newState).progressToNext, 1.0);
});

test('Oracle 3: streak monotonicity', () => {
  const result = processDailyLogin(
    { currentStreak: 5, lastLoginDate: '2026-05-08', protection: { freeUsed: true } },
    '2026-05-10',
  );
  assert.strictEqual(result.status, 'streak_broken');
  assert.strictEqual(result.streakState.currentStreak, 1);
  assert(result.streakState.currentStreak <= 1);
});

test('Oracle 4: loot box weights are stable under deterministic RNG sweep', () => {
  const sequence = Array.from({ length: 10000 }, (_, index) => ((index * 9301 + 49297) % 233280) / 233280);
  let cursor = 0;
  const counts = { energy_10: 0, skin_frag: 0, stars_5: 0 };
  for (let index = 0; index < 10000; index += 1) {
    const drop = rollLootBox(STAGE2.DAILY_QUEST.FULL_CLEAR.LOOT_BOX.drops, () => sequence[cursor++]);
    counts[drop.id] += 1;
  }
  assert(counts.energy_10 > 6500 && counts.energy_10 < 7500);
  assert(counts.skin_frag > 1500 && counts.skin_frag < 2500);
  assert(counts.stars_5 > 500 && counts.stars_5 < 1500);
});

test('quest generation returns exactly 4 quests and scales base targets', () => {
  const quests = generateDailyQuests('user_42', '2026-05-10', 5, 1);
  assert.strictEqual(quests.length, 4);
  assert.strictEqual(quests.find((quest) => quest.id === 'q_tap300').target, 300);
  assert.strictEqual(quests.find((quest) => quest.id === 'q_login').reward.commitsCurrent, 1250);
});

test('daily quest fallback avg farm follows BALANCE v2 values', () => {
  assert.strictEqual(getFallbackAvgDailyFarm(1), 5000);
  assert.strictEqual(getFallbackAvgDailyFarm(2), 12000);
  assert.strictEqual(getFallbackAvgDailyFarm(3), 25000);
});

test('getRollingAvgDailyFarm: averages 7 day total', async () => {
  const client = {
    query: async () => ({ rows: [{ total_loc: 70000 }] })
  };
  const avg = await getRollingAvgDailyFarm(client, 1);
  assert.strictEqual(avg, 10000);
});

test('pass boundary: 99/100 XP plus 2 XP unlocks level 1 claimable reward', () => {
  const result = addPassXp({ currentXp: 99, claimedLevels: [] }, 2);
  assert.strictEqual(result.newLevel, 1);
  assert.strictEqual(result.leveledUp, true);
  assert.strictEqual(getClaimableRewards(result.newState).length, 1);
});

test('sprint pass config uses 50-level tiered XP curve totalling 10000 XP', () => {
  assert.strictEqual(STAGE2.PASS.SEASON_DAYS, 30);
  assert.strictEqual(STAGE2.PASS.LEVELS.length, 50);
  assert.strictEqual(STAGE2.PASS.MAX_LEVEL, 50);
  // Tiered curve: 1-10 = 100, 11-20 = 150, 21-30 = 200, 31-40 = 250, 41-50 = 300
  assert.strictEqual(getPassRequiredXp(1), 100);
  assert.strictEqual(getPassRequiredXp(10), 100);
  assert.strictEqual(getPassRequiredXp(11), 150);
  assert.strictEqual(getPassRequiredXp(20), 150);
  assert.strictEqual(getPassRequiredXp(21), 200);
  assert.strictEqual(getPassRequiredXp(50), 300);
  const totalXp = STAGE2.PASS.LEVELS.reduce((sum, level) => sum + level.requiredXp, 0);
  assert.strictEqual(totalXp, 10000);
});

test('catch-up and weekend XP helpers follow prompt formulas', () => {
  assert.strictEqual(calculateCatchUpXp(3, 120), 180);
  assert.strictEqual(calculateCappedCatchUpXp(5, 120), 180);
  assert.strictEqual(getWeekendXpMultiplier(new Date('2026-05-09T00:00:00Z')), 2.0);
  assert.strictEqual(getWeekendXpMultiplier(new Date('2026-05-11T00:00:00Z')), 1.0);
  assert.strictEqual(applyPassXpSourceMultiplier(10, 'tap_xp', new Date('2026-05-09T00:00:00Z')), 20);
  assert.strictEqual(applyPassXpSourceMultiplier(10, 'ad_xp', new Date('2026-05-09T00:00:00Z')), 10);
});

test('generator defaults use BALANCE v2 FTUE acceleration', () => {
  assert.strictEqual(getFtueAcceleration(3).incomeMultiplier, 3.0);
  assert.strictEqual(calculateGeneratorCost('junior_dev', 0, 3), 25);
  assert.strictEqual(calculateGeneratorOutput('junior_dev', 6, 3), 18);
  assert.strictEqual(calculateGeneratorCost('middle_dev', 0, 61), 400);
  assert.strictEqual(calculateGeneratorOutput('middle_dev', 1, 61), 7);
  assert.strictEqual(isGeneratorUnlocked('middle_dev', { junior_dev: 5 }), true);
  assert.strictEqual(isGeneratorUnlocked('senior_dev', { middle_dev: 4 }), false);
});

test('generator status aggregates passive LOC/sec across owned tiers', () => {
  const status = buildGeneratorStatus({ owned: { junior_dev: 5, middle_dev: 1 } }, 61);
  assert.strictEqual(status.passiveLocPerSecond, 12);
  assert.strictEqual(status.tiers.find((tier) => tier.id === 'senior_dev').unlocked, false);
});

test('streak free save is used once then next missed day breaks', () => {
  const saved = processDailyLogin(
    { currentStreak: 5, lastLoginDate: '2026-05-08', protection: { freeUsed: false } },
    '2026-05-10',
  );
  assert.strictEqual(saved.status, 'streak_saved_free');
  assert.strictEqual(saved.streakState.protection.freeUsed, true);

  const broken = processDailyLogin(saved.streakState, '2026-05-12');
  assert.strictEqual(broken.status, 'streak_broken');
  assert.strictEqual(broken.streakState.currentStreak, 1);
});

test('streak team save is consumed after free save is unavailable', () => {
  const result = processDailyLogin(
    { currentStreak: 8, lastLoginDate: '2026-05-08', protection: { freeUsed: true, teamSaveAvailable: true } },
    '2026-05-10',
  );
  assert.strictEqual(result.status, 'streak_saved_team');
  assert.strictEqual(result.streakState.protection.teamSaveAvailable, false);
});
