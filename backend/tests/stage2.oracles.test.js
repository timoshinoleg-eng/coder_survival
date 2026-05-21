import assert from 'assert';
import { STAGE2 } from '../src/config/balance.js';
import { generateDailyQuests, rollLootBox } from '../src/utils/dailyQuests.js';
import { addPassXp, calculatePassLevel, getClaimableRewards } from '../src/utils/pass.js';
import { processDailyLogin } from '../src/utils/streak.js';

test('Oracle 1: quest determinism', () => {
  const q1 = generateDailyQuests('test_user', '2026-05-10', 1);
  const q2 = generateDailyQuests('test_user', '2026-05-10', 1);
  assert.deepStrictEqual(q1.map((quest) => quest.id), q2.map((quest) => quest.id));
  assert.deepStrictEqual(q1.map((quest) => quest.id), ['q_login', 'q_tap50', 'q_commit100', 'q_bonus_crit']);
});

test('Oracle 2: pass XP conservation', () => {
  const result = addPassXp({ currentXp: 0, claimedLevels: [] }, 11500);
  assert.strictEqual(calculatePassLevel(result.newState).currentLevel, 20);
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
  const quests = generateDailyQuests('user_42', '2026-05-10', 5);
  assert.strictEqual(quests.length, 4);
  assert.strictEqual(quests.find((quest) => quest.id === 'q_tap50').target, 75);
});

test('pass boundary: 199/200 XP plus 2 XP unlocks level 1 claimable reward', () => {
  const result = addPassXp({ currentXp: 199, claimedLevels: [] }, 2);
  assert.strictEqual(result.newLevel, 1);
  assert.strictEqual(result.leveledUp, true);
  assert.strictEqual(getClaimableRewards(result.newState).length, 1);
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
