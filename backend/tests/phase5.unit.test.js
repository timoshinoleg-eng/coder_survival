import { processDailyLogin, starRecover, calculateRecoveryCost } from '../src/utils/streak.js';
import { checkReferralMilestones, isReferralActive, getUnlockedReferralMilestones } from '../src/utils/referral.js';
import { STAGE2, STAGE3 } from '../src/config/balance.js';

describe('Phase 5: Streaks Polish & Recovery', () => {
  test('processDailyLogin: streak continues when last login was yesterday', () => {
    const result = processDailyLogin({ currentStreak: 5, lastLoginDate: '2026-05-20' }, '2026-05-21');
    expect(result.status).toBe('streak_continued');
    expect(result.streakState.currentStreak).toBe(6);
  });

  test('processDailyLogin: streak breaks when last login was 2+ days ago and free save already used', () => {
    const state = {
      currentStreak: 10,
      lastLoginDate: '2026-05-18',
      protection: { freeUsed: true, starSavesUsed: 0 }
    };
    const result = processDailyLogin(state, '2026-05-21');
    expect(result.status).toBe('streak_broken');
    expect(result.streakState.currentStreak).toBe(1);
    expect(result.brokenStreak).toBe(10);
  });

  test('processDailyLogin: free save triggers when missed and freeUsed is false', () => {
    const state = {
      currentStreak: 7,
      lastLoginDate: '2026-05-18',
      protection: { freeUsed: false }
    };
    const result = processDailyLogin(state, '2026-05-21');
    expect(result.status).toBe('streak_saved_free');
    expect(result.streakState.protection.freeUsed).toBe(true);
  });

  test('calculateRecoveryCost: escalates correctly', () => {
    expect(calculateRecoveryCost(0)).toBe(5);
    expect(calculateRecoveryCost(1)).toBe(10);
    expect(calculateRecoveryCost(2)).toBe(15);
  });

  test('starRecover: restores streak and increments starSavesUsed', () => {
    const state = {
      currentStreak: 1,
      lastLoginDate: '2026-05-20',
      brokenStreak: 14,
      protection: { freeUsed: true, starSavesUsed: 0 }
    };
    const result = starRecover(state, '2026-05-22', 10);
    expect(result.success).toBe(true);
    expect(result.cost).toBe(5);
    expect(result.newState.currentStreak).toBe(14);
    expect(result.newState.protection.starSavesUsed).toBe(1);
  });

  test('starRecover: fails when not enough stars', () => {
    const state = {
      currentStreak: 1,
      lastLoginDate: '2026-05-20',
      brokenStreak: 14,
      protection: { freeUsed: true, starSavesUsed: 0 }
    };
    const result = starRecover(state, '2026-05-22', 3);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('not_enough_stars');
  });

  test('starRecover: fails when streak is not broken (no brokenStreak stored)', () => {
    const state = {
      currentStreak: 5,
      lastLoginDate: '2026-05-21',
      protection: { freeUsed: true }
    };
    const result = starRecover(state, '2026-05-22', 100);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('no_streak');
  });

  test('streak milestones: 7/14/30 only exist', () => {
    const milestones = STAGE2.STREAK.MILESTONES;
    expect(Object.keys(milestones).map(Number).sort((a, b) => a - b)).toEqual([7, 14, 30]);
    expect(milestones[7]).toMatchObject({ commitBoostPercent: 10, durationHours: 24, title: 'week_warrior' });
    expect(milestones[14]).toMatchObject({ skinFragment: 'midnight_office', title: 'office_dweller' });
    expect(milestones[30]).toMatchObject({ skin: 'retro_boombox' });
  });
});

describe('Phase 5: Referral Rebalancing & Anti-Farm', () => {
  test('checkReferralMilestones: blocked when commits < 20', () => {
    const state = { invitedBy: 'inviter1', milestonesReached: [] };
    const result = checkReferralMilestones(state, 19, '2026-05-01');
    expect(result.newlyUnlocked).toHaveLength(0);
  });

  test('checkReferralMilestones: blocked when < 2 days active', () => {
    const state = { invitedBy: 'inviter1', milestonesReached: [] };
    const now = new Date('2026-05-21T12:00:00Z');
    const firstActiveAt = '2026-05-21T00:00:00Z'; // same day
    const result = checkReferralMilestones(state, 25, firstActiveAt, now);
    expect(result.newlyUnlocked).toHaveLength(0);
  });

  test('checkReferralMilestones: unlocks when 2 days + 20 commits met', () => {
    const state = { invitedBy: 'inviter1', milestonesReached: [] };
    const now = new Date('2026-05-21T12:00:00Z');
    const firstActiveAt = '2026-05-18T00:00:00Z'; // 3 days ago
    const result = checkReferralMilestones(state, 25, firstActiveAt, now);
    expect(result.newlyUnlocked).toHaveLength(1);
    expect(result.newlyUnlocked[0].milestone).toBe(1);
  });

  test('checkReferralMilestones: backward compat without firstActiveAt', () => {
    const state = { invitedBy: 'inviter1', milestonesReached: [] };
    const result = checkReferralMilestones(state, 20);
    expect(result.newlyUnlocked).toHaveLength(1);
  });

  test('isReferralActive: false when commits < 20', () => {
    expect(isReferralActive({ commits_total: 10, first_active_at: '2026-05-01' })).toBe(false);
  });

  test('isReferralActive: false when < 2 days', () => {
    const now = Date.now();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    expect(isReferralActive({ commits_total: 25, first_active_at: oneDayAgo })).toBe(false);
  });

  test('isReferralActive: true when both thresholds met', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(isReferralActive({ commits_total: 25, first_active_at: threeDaysAgo })).toBe(true);
  });

  test('getUnlockedReferralMilestones: returns correct tiered rewards', () => {
    const unlocked = getUnlockedReferralMilestones(5, []);
    expect(unlocked).toHaveLength(3);
    expect(unlocked.map((u) => u.milestone)).toEqual([1, 3, 5]);
    expect(unlocked[2].rewards.inviter.skin).toBe('team_lead');
  });

  test('referral milestone rewards: new shape with commits/stars/skins', () => {
    const rewards = STAGE3.REFERRAL.MILESTONE_REWARDS;
    expect(rewards[1].inviter).toMatchObject({ commits: 50, energy: 25 });
    expect(rewards[1].invited).toMatchObject({ commits: 100, inventory: { coffee_cups: 1 } });
    expect(rewards[5].inviter).toMatchObject({ skin: 'team_lead', energy: 100 });
    expect(rewards[5].invited).toMatchObject({ commits: 100, stars: 5 });
  });
});

describe('Phase 5: Anti-farm days config', () => {
  test('ANTI_FARM_DAYS is set to 2', () => {
    expect(STAGE3.REFERRAL.ANTI_FARM_DAYS).toBe(2);
  });
});
