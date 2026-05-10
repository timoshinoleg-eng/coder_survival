import { STAGE3 } from '../config/balance.js';

const { REFERRAL } = STAGE3;

export function parseReferralCode(refCode) {
  if (!refCode || typeof refCode !== 'string' || !refCode.startsWith(REFERRAL.DEEP_LINK_PREFIX)) {
    return null;
  }
  const id = refCode.slice(REFERRAL.DEEP_LINK_PREFIX.length);
  return id || null;
}

export function trackReferral(referralState, inviterId) {
  if (referralState?.invitedBy) {
    return { status: 'already_referred', state: referralState };
  }

  return {
    status: 'tracked',
    state: {
      ...(referralState || {}),
      invitedBy: inviterId,
      invitedAt: new Date().toISOString(),
      milestonesReached: Array.isArray(referralState?.milestonesReached)
        ? referralState.milestonesReached
        : [],
      pendingRewards: Array.isArray(referralState?.pendingRewards)
        ? referralState.pendingRewards
        : []
    }
  };
}

export function getUnlockedReferralMilestones(activeReferralCount, claimedMilestones = []) {
  const claimed = new Set(claimedMilestones.map(Number));
  return Object.entries(REFERRAL.MILESTONE_REWARDS)
    .map(([milestone, rewards]) => ({ milestone: Number(milestone), rewards }))
    .filter(({ milestone }) => activeReferralCount >= milestone && !claimed.has(milestone));
}

export function checkReferralMilestones(referralState, totalCommits) {
  if (!referralState?.invitedBy || Number(totalCommits || 0) < REFERRAL.ACTIVE_THRESHOLD_COMMITS) {
    return { state: referralState, newlyUnlocked: [] };
  }

  const already = new Set((referralState.milestonesReached || []).map(Number));
  if (already.has(1)) {
    return { state: referralState, newlyUnlocked: [] };
  }

  already.add(1);
  const rewards = REFERRAL.MILESTONE_REWARDS[1];
  return {
    state: {
      ...referralState,
      milestonesReached: Array.from(already),
      pendingRewards: [
        ...(referralState.pendingRewards || []),
        { milestone: 1, rewards, unlockedAt: new Date().toISOString() }
      ]
    },
    newlyUnlocked: [{ milestone: 1, rewards }]
  };
}
