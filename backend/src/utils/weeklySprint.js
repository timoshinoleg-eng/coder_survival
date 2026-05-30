import { STAGE2 } from '../config/balance.js';

const { WEEKLY_SPRINT } = STAGE2;

export function getWeekStart(timezoneOffset = 180, now = new Date()) {
  const local = new Date(now.getTime() + timezoneOffset * 60000);
  const day = local.getDay();
  const diff = local.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(local);
  monday.setDate(diff);
  return monday.toISOString().slice(0, 10);
}

export function getWeeklySprintState(state, weekStart) {
  if (!state || state.weekStart !== weekStart) {
    return {
      weekStart,
      questsCompleted: 0,
      commitsEarned: 0,
      minigamesCompleted: 0,
      memeShares: 0,
      tierClaimed: null
    };
  }
  return {
    weekStart: state.weekStart || weekStart,
    questsCompleted: Number(state.questsCompleted || 0),
    commitsEarned: Number(state.commitsEarned || 0),
    minigamesCompleted: Number(state.minigamesCompleted || 0),
    memeShares: Number(state.memeShares || 0),
    tierClaimed: state.tierClaimed || null
  };
}

export function determineEligibleTier(sprintState) {
  const tiers = Object.entries(WEEKLY_SPRINT.TIERS);
  let eligible = null;
  for (const [tierName, config] of tiers) {
    const meetsCommits = sprintState.commitsEarned >= (config.targetCommits || 0);
    const meetsQuests = sprintState.questsCompleted >= (config.targetQuests || 0);
    const meetsMinigames = !config.targetMinigames || sprintState.minigamesCompleted >= config.targetMinigames;
    const meetsMemes = !config.targetMemeShares || sprintState.memeShares >= config.targetMemeShares;
    if (meetsCommits && meetsQuests && meetsMinigames && meetsMemes) {
      eligible = tierName;
    }
  }
  return eligible;
}

export function canClaimTier(sprintState, tierName) {
  if (!sprintState || !tierName) return false;
  if (sprintState.tierClaimed) return false;
  const eligible = determineEligibleTier(sprintState);
  return eligible === tierName;
}

export function getTierReward(tierName) {
  const config = WEEKLY_SPRINT.TIERS[tierName];
  return config ? { ...config.reward } : {};
}

export function incrementSprintProgress(state, increments) {
  return {
    ...state,
    questsCompleted: state.questsCompleted + Number(increments.questsCompleted || 0),
    commitsEarned: state.commitsEarned + Number(increments.commitsEarned || 0),
    minigamesCompleted: state.minigamesCompleted + Number(increments.minigamesCompleted || 0),
    memeShares: state.memeShares + Number(increments.memeShares || 0)
  };
}

export function getWeeklySprintNarrativeMeta(state = {}) {
  const stages = WEEKLY_SPRINT.NARRATIVE_ARC || [];
  const progressPoints = Number(state.questsCompleted || 0) + Number(state.minigamesCompleted || 0) + Number(state.memeShares || 0);
  const stageIndex = Math.min(stages.length - 1, Math.max(0, Math.floor(progressPoints / 2)));
  return {
    arc: stages,
    currentStage: stages[stageIndex] || stages[0] || null,
    stageIndex,
    rewardChoice: WEEKLY_SPRINT.REWARD_CHOICE || null
  };
}

export async function updateWeeklySprintState(client, userId, increments) {
  const result = await client.query(
    `SELECT weekly_sprint_quest_state, timezone_offset
     FROM progression
     WHERE user_id = $1`,
    [userId]
  );
  const tz = Number(result.rows[0]?.timezone_offset || 180);
  const weekStart = getWeekStart(tz);
  let state = getWeeklySprintState(result.rows[0]?.weekly_sprint_quest_state, weekStart);
  state = incrementSprintProgress(state, increments);
  await client.query(
    `UPDATE progression SET weekly_sprint_quest_state = $2 WHERE user_id = $1`,
    [userId, JSON.stringify(state)]
  );
  return state;
}
