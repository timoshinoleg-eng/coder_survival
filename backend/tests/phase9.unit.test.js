import {
  getWeekStart,
  getWeeklySprintState,
  determineEligibleTier,
  canClaimTier,
  getTierReward,
  getWeeklySprintNarrativeMeta,
  incrementSprintProgress
} from '../src/utils/weeklySprint.js';
import { validateScore, buildReward } from '../src/utils/minigame.js';
import { STAGE2 } from '../src/config/balance.js';

describe('Phase 9: Weekly Sprint Quest', () => {
  test('getWeekStart: returns Monday for Sunday', () => {
    const sunday = new Date('2026-05-24T12:00:00Z'); // Sunday
    const result = getWeekStart(0, sunday);
    expect(result).toBe('2026-05-18'); // Previous Monday
  });

  test('getWeekStart: returns same Monday for Monday', () => {
    const monday = new Date('2026-05-18T12:00:00Z');
    const result = getWeekStart(0, monday);
    expect(result).toBe('2026-05-18');
  });

  test('getWeeklySprintState: resets on new week', () => {
    const state = getWeeklySprintState({ weekStart: '2026-05-11', questsCompleted: 5 }, '2026-05-18');
    expect(state.weekStart).toBe('2026-05-18');
    expect(state.questsCompleted).toBe(0);
    expect(state.tierClaimed).toBeNull();
  });

  test('getWeeklySprintState: preserves current week', () => {
    const state = getWeeklySprintState({ weekStart: '2026-05-18', questsCompleted: 5, commitsEarned: 1000 }, '2026-05-18');
    expect(state.questsCompleted).toBe(5);
    expect(state.commitsEarned).toBe(1000);
  });

  test('determineEligibleTier: EASY only', () => {
    const state = { questsCompleted: 3, commitsEarned: 500, minigamesCompleted: 0, memeShares: 0 };
    expect(determineEligibleTier(state)).toBe('EASY');
  });

  test('determineEligibleTier: MEDIUM', () => {
    const state = { questsCompleted: 5, commitsEarned: 1500, minigamesCompleted: 1, memeShares: 0 };
    expect(determineEligibleTier(state)).toBe('MEDIUM');
  });

  test('determineEligibleTier: HARD', () => {
    const state = { questsCompleted: 7, commitsEarned: 3000, minigamesCompleted: 2, memeShares: 1 };
    expect(determineEligibleTier(state)).toBe('HARD');
  });

  test('determineEligibleTier: null if insufficient', () => {
    const state = { questsCompleted: 0, commitsEarned: 0, minigamesCompleted: 0, memeShares: 0 };
    expect(determineEligibleTier(state)).toBeNull();
  });

  test('canClaimTier: true when eligible and unclaimed', () => {
    const state = { questsCompleted: 5, commitsEarned: 1500, minigamesCompleted: 1, memeShares: 0, tierClaimed: null };
    expect(canClaimTier(state, 'MEDIUM')).toBe(true);
  });

  test('canClaimTier: false when already claimed', () => {
    const state = { questsCompleted: 7, commitsEarned: 3000, minigamesCompleted: 2, memeShares: 1, tierClaimed: 'EASY' };
    expect(canClaimTier(state, 'MEDIUM')).toBe(false);
  });

  test('canClaimTier: false when ineligible', () => {
    const state = { questsCompleted: 1, commitsEarned: 100, minigamesCompleted: 0, memeShares: 0, tierClaimed: null };
    expect(canClaimTier(state, 'EASY')).toBe(false);
  });

  test('getTierReward: returns correct reward', () => {
    const easy = getTierReward('EASY');
    expect(easy.energy).toBe(30);
    expect(easy.xp).toBe(20);

    const hard = getTierReward('HARD');
    expect(hard.energy).toBe(100);
    expect(hard.skinFragment).toBe('sprint_hero');
    expect(hard.title).toBe('sprint_master');
  });

  test('incrementSprintProgress: adds increments correctly', () => {
    const state = { questsCompleted: 2, commitsEarned: 300, minigamesCompleted: 0, memeShares: 0 };
    const next = incrementSprintProgress(state, { questsCompleted: 1, commitsEarned: 200, minigamesCompleted: 1 });
    expect(next.questsCompleted).toBe(3);
    expect(next.commitsEarned).toBe(500);
    expect(next.minigamesCompleted).toBe(1);
  });

  test('getWeeklySprintNarrativeMeta: exposes narrative arc and reward choice', () => {
    const meta = getWeeklySprintNarrativeMeta({ questsCompleted: 3, minigamesCompleted: 1, memeShares: 0 });
    expect(meta.arc).toEqual(['Planning', 'Coding', 'Testing', 'Deploy']);
    expect(meta.currentStage).toBe('Testing');
    expect(meta.rewardChoice).toEqual({ type: 'choice', options: ['skin', 'booster', 'currency'], count: 3 });
  });
});

describe('Phase 9: Mini-Game Configs', () => {
  test('architectural_committee config exists', () => {
    const config = STAGE2.MINIGAMES.architectural_committee;
    expect(config).toBeDefined();
    expect(config.requiredLevel).toBe(8);
    expect(config.cooldownHours).toBe(24);
    expect(config.maxScore).toBe(1);
    expect(config.reward.commits).toBe(500);
  });

  test('ipo config exists', () => {
    const config = STAGE2.MINIGAMES.ipo;
    expect(config).toBeDefined();
    expect(config.requiredLevel).toBe(10);
    expect(config.cooldownHours).toBe(168);
    expect(config.maxScore).toBe(3);
    expect(config.minSuccessScore).toBe(3);
    expect(config.reward.commits).toBe(1000);
    expect(config.reward.skin).toBe('cto_cape');
  });

  test('validateScore: architectural_committee accepts 0-1', () => {
    expect(validateScore('architectural_committee', 0)).toBe(true);
    expect(validateScore('architectural_committee', 1)).toBe(true);
    expect(validateScore('architectural_committee', 2)).toBe(false);
  });

  test('validateScore: ipo accepts 0-3', () => {
    expect(validateScore('ipo', 0)).toBe(true);
    expect(validateScore('ipo', 1)).toBe(true);
    expect(validateScore('ipo', 2)).toBe(true);
    expect(validateScore('ipo', 3)).toBe(true);
    expect(validateScore('ipo', 4)).toBe(false);
  });

  test('buildReward: architectural_committee', () => {
    const reward = buildReward('architectural_committee');
    expect(reward.commits).toBe(500);
    expect(reward.depressionRelief).toBe(40);
  });

  test('buildReward: ipo includes skin', () => {
    const reward = buildReward('ipo');
    expect(reward.commits).toBe(1000);
    expect(reward.depressionRelief).toBe(50);
    expect(reward.skin).toBe('cto_cape');
  });
});

describe('Phase 9: Skin Definitions', () => {
  test('WEEKLY_SPRINT config has three tiers', () => {
    const tiers = STAGE2.WEEKLY_SPRINT.TIERS;
    expect(Object.keys(tiers)).toEqual(['EASY', 'MEDIUM', 'HARD']);
  });

  test('EASY tier targets', () => {
    const easy = STAGE2.WEEKLY_SPRINT.TIERS.EASY;
    expect(easy.targetCommits).toBe(500);
    expect(easy.targetQuests).toBe(3);
  });

  test('HARD tier targets', () => {
    const hard = STAGE2.WEEKLY_SPRINT.TIERS.HARD;
    expect(hard.targetCommits).toBe(3000);
    expect(hard.targetQuests).toBe(7);
    expect(hard.targetMinigames).toBe(2);
    expect(hard.targetMemeShares).toBe(1);
  });
});
