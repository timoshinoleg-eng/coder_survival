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

export function daysBetween(left, right) {
  const start = new Date(`${left}T00:00:00.000Z`);
  const end = new Date(`${right}T00:00:00.000Z`);
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function isReferralActive(referredProgression) {
  if (!referredProgression) return false;
  const totalCommits = Number(referredProgression.commits_total || 0);
  const firstActiveAt = referredProgression.first_active_at;
  if (!firstActiveAt) return false;
  const daysSinceFirstActive = Math.floor((Date.now() - new Date(firstActiveAt).getTime()) / (1000 * 60 * 60 * 24));
  return totalCommits >= REFERRAL.ACTIVE_THRESHOLD_COMMITS && daysSinceFirstActive >= REFERRAL.ANTI_FARM_DAYS;
}

export function getUnlockedReferralMilestones(activeReferralCount, claimedMilestones = []) {
  const claimed = new Set(claimedMilestones.map(Number));
  return Object.entries(REFERRAL.MILESTONE_REWARDS)
    .map(([milestone, rewards]) => ({ milestone: Number(milestone), rewards }))
    .filter(({ milestone }) => activeReferralCount >= milestone && !claimed.has(milestone));
}

export function checkReferralMilestones(referralState, totalCommits, firstActiveAt, now = new Date()) {
  if (!referralState?.invitedBy) {
    return { state: referralState, newlyUnlocked: [] };
  }

  const commitsOk = Number(totalCommits || 0) >= REFERRAL.ACTIVE_THRESHOLD_COMMITS;
  // If firstActiveAt is not provided (legacy call), default daysOk to true for backward compat
  const daysOk = firstActiveAt
    ? Math.floor((now.getTime() - new Date(firstActiveAt).getTime()) / (1000 * 60 * 60 * 24)) >= REFERRAL.ANTI_FARM_DAYS
    : true;

  if (!commitsOk || !daysOk) {
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

export function buildReferralClaimReward(inviterReward = {}, premiumEligible = false) {
  const reward = { ...inviterReward };
  if (!premiumEligible) return reward;
  for (const key of ['commits', 'energy', 'stars']) {
    if (typeof reward[key] === 'number') {
      reward[key] = reward[key] * 5;
    }
  }
  reward.skin = 'dark_mode_ide';
  return reward;
}
