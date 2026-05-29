import { jest } from '@jest/globals';
import {
  addHackathonContribution,
  calculateHackathonTarget,
  getWeekId
} from '../src/utils/teamHackathon.js';
import {
  acceptBattle,
  canChallenge,
  createBattle,
  resolveBattle,
  upsertBattleInState
} from '../src/utils/battle.js';
import {
  checkReferralMilestones,
  getUnlockedReferralMilestones,
  trackReferral
} from '../src/utils/referral.js';
import { STAGE3 } from '../src/config/balance.js';

test('Oracle 1: battle escrow conserves energy after resolution', () => {
  let u1Energy = 50;
  let u2Energy = 50;
  const battle = createBattle('u1', 'u2', 10, 1000, 1000, new Date('2026-05-10T00:00:00Z'));
  u1Energy -= battle.stake;
  u2Energy -= battle.stake;

  expect(u1Energy).toBe(40);
  expect(u2Energy).toBe(40);
  expect(battle.escrow).toBe(20);

  const active = acceptBattle(battle, 1000, 1000, new Date('2026-05-10T00:01:00Z'));
  const resolved = resolveBattle(active, 1050, 1100, new Date('2026-05-11T00:02:00Z'));
  if (resolved.winnerId === 'u2') {
    u2Energy += resolved.stake * STAGE3.DAILY_BATTLE.REWARD_WINNER_MULTIPLIER;
  }

  expect(resolved.winnerId).toBe('u2');
  expect(u1Energy).toBe(40);
  expect(u2Energy).toBe(60);
  expect(u1Energy + u2Energy).toBe(100);
});

test('Oracle 2: referral hard floor blocks 19 commits and unlocks at 20 commits', () => {
  const tracked = trackReferral({}, 'inviter1');
  expect(checkReferralMilestones(tracked.state, 19).newlyUnlocked).toHaveLength(0);
  expect(checkReferralMilestones(tracked.state, 20).newlyUnlocked[0].milestone).toBe(1);
  expect(getUnlockedReferralMilestones(0, [])).toHaveLength(0);
  expect(getUnlockedReferralMilestones(1, [])[0].milestone).toBe(1);
});

test('Oracle 3: hackathon reset moves to the next local week with empty progress', () => {
  const previous = {
    weekId: '2026-W20',
    target: 750,
    progress: 700,
    tierClaimed: 'SILVER',
    contributions: { u1: 700 }
  };
  const nextWeek = getWeekId(new Date('2026-05-18T00:01:00Z'), 0);
  const reset = previous.weekId === nextWeek
    ? previous
    : { weekId: nextWeek, target: calculateHackathonTarget(2), progress: 0, tierClaimed: null, contributions: {} };

  expect(reset.weekId).toBe('2026-W21');
  expect(reset.progress).toBe(0);
  expect(reset.tierClaimed).toBeNull();
});

test('Oracle 4: hackathon target and tiers are deterministic', () => {
  expect(STAGE3.TEAM_HACKATHON.COMMITS_PER_ACTIVE_MEMBER * 5).toBe(750);
  expect(calculateHackathonTarget(3)).toBe(450);
  let state = { target: 750, progress: 0, contributions: {} };
  state = addHackathonContribution(state, 'u1', 400);
  state = addHackathonContribution(state, 'u2', 200);
  expect(state.currentTier).toBe('SILVER');
});

test('Oracle 5: pending battle cooldown rejects concurrent duplicate challenges', () => {
  const createdAt = new Date('2026-05-10T00:00:00Z');
  const battle = createBattle(1, 2, 10, 100, 100, createdAt);
  const state = upsertBattleInState({}, battle);
  jest.spyOn(Date, 'now').mockReturnValue(createdAt.getTime() + 5 * 60 * 1000);
  try {
    expect(canChallenge(state, 2, 1)).toBe(false);
  } finally {
    Date.now.mockRestore();
  }
});
