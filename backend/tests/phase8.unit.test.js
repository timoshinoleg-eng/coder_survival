import { validateScore, buildReward } from '../src/utils/minigame.js';
import { buildHackathonFinalMessage, getHackathonTier } from '../src/utils/teamHackathon.js';
import { computeScoreComponents } from '../src/utils/dailySummary.js';
import { STAGE3 } from '../src/config/balance.js';

describe('Phase 8: Dream Interview Mini-Game', () => {
  test('validateScore: accepts 0-5 for dream_interview', () => {
    expect(validateScore('dream_interview', 0)).toBe(true);
    expect(validateScore('dream_interview', 3)).toBe(true);
    expect(validateScore('dream_interview', 5)).toBe(true);
  });

  test('validateScore: rejects out of range', () => {
    expect(validateScore('dream_interview', -1)).toBe(false);
    expect(validateScore('dream_interview', 6)).toBe(false);
  });

  test('buildReward: returns correct reward for dream_interview', () => {
    const reward = buildReward('dream_interview');
    expect(reward.commits).toBe(200);
    expect(reward.depressionRelief).toBe(30);
    expect(reward.skinFragment).toBe('dream_interview_rare');
    expect(reward.tapBoostPercent).toBeUndefined();
  });
});

describe('Phase 8: Team Hackathon Messages', () => {
  test('buildHackathonFinalMessage: success (GOLD)', () => {
    const members = [
      { username: 'alice', contribution: 300 },
      { username: 'bob', contribution: 200 }
    ];
    const msg = buildHackathonFinalMessage('DreamTeam', 500, 500, 'GOLD', members, true);
    expect(msg).toContain('DreamTeam');
    expect(msg).toContain('100%');
    expect(msg).toContain('GOLD');
    expect(msg).toContain('Чемпион хакатона');
    expect(msg).toContain('alice');
    expect(msg).toContain('bob');
  });

  test('buildHackathonFinalMessage: failure', () => {
    const members = [
      { username: 'charlie', contribution: 50 },
      { firstName: 'Dave', contribution: 30 }
    ];
    const msg = buildHackathonFinalMessage('BugHunters', 80, 500, null, members, false);
    expect(msg).toContain('BugHunters');
    expect(msg).toContain('16%');
    expect(msg).toContain('Менеджер уже знает');
    expect(msg).toContain('#мы_старались');
  });

  test('getHackathonTier: returns correct tiers', () => {
    expect(getHackathonTier(250, 500)).toBe('BRONZE');
    expect(getHackathonTier(375, 500)).toBe('SILVER');
    expect(getHackathonTier(500, 500)).toBe('GOLD');
    expect(getHackathonTier(100, 500)).toBeNull();
  });
});

describe('Phase 8: Team Lead Skin Daily Battle Bonus', () => {
  test('computeScoreComponents: base productivity without bonus', () => {
    const result = computeScoreComponents({
      commitsToday: 250,
      depressionLevel: 50,
      socialEvents: 2,
      activeReferrals: 1
    });
    expect(result.productivity).toBe(20); // 250/500 * 40
  });

  test('computeScoreComponents: productivity capped at 40', () => {
    const result = computeScoreComponents({
      commitsToday: 1000,
      depressionLevel: 0,
      socialEvents: 10,
      activeReferrals: 10
    });
    expect(result.productivity).toBe(40);
    expect(result.total).toBe(100);
  });
});
