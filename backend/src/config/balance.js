export const CONTEXT_OFFER_GLOBAL_COOLDOWN_MS = 90 * 1000;

export const CONTEXT_OFFER_RULES = {
  low_energy: {
    priority: 1,
    cooldownMs: 90 * 60 * 1000,
    energyPercentThreshold: 25,
    title: '⚡ Энергия просела',
    body: 'Нужен быстрый рефилл, иначе сессия закончится раньше времени.',
    productId: 'energy_refill',
    action: 'Зарядиться'
  },
  near_rank: {
    priority: 2,
    cooldownMs: 2 * 60 * 60 * 1000,
    progressThreshold: 0.72,
    title: '🚀 Повышение рядом',
    body: 'Добей уровень сейчас: буст даст XP и подтолкнёт карьерный рост.',
    productId: 'tier_boost',
    action: 'Дожать'
  },
  high_stress: {
    priority: 3,
    cooldownMs: 3 * 60 * 60 * 1000,
    depressionThreshold: 55,
    title: '🧠 Стресс режет отдачу',
    body: 'Сними напряжение, пока штраф к эффективности не съел прогресс.',
    productId: 'depression_cure',
    action: 'Сбросить стресс'
  }
};

export const CONTEXT_OFFER_PRIORITY = Object.entries(CONTEXT_OFFER_RULES)
  .sort(([, left], [, right]) => left.priority - right.priority)
  .map(([offerType]) => offerType);

export const DAILY_QUEST_DEFS = [
  {
    questType: 'tap_count',
    targetValue: 40,
    rewardPayload: { energy: 15 }
  },
  {
    questType: 'commit_count',
    targetValue: 80,
    rewardPayload: { commitsCurrent: 30, energy: 10 }
  },
  {
    questType: 'login',
    targetValue: 1,
    rewardPayload: { energy: 10 }
  }
];

export const DAILY_QUEST_ALL_CLAIMED_BONUS = { energy: 25 };

export const REFERRAL_ACTIVE_THRESHOLD_COMMITS = 20;
export const REFERRAL_MILESTONE_REWARDS = {
  1: { energy: 30 },
  3: { energy: 60 },
  5: { energy: 100 }
};

export const BATTLE_REWARD_PREVIEW = {
  top1: { energy: 50 },
  top2: { energy: 30 },
  top3: { energy: 15 }
};

export const TAP_MECHANICS = {
  streakBonusPerDay: 0.05,
  streakBonusCap: 0.5,
  depressionPenaltyMultiplier: 0.5,
  lowEnergyStressThreshold: 20,
  criticalEnergyStressThreshold: 10,
  lowEnergyStressDelta: 1,
  criticalEnergyStressDelta: 2
};

export const DEPRESSION_RECOVERY_PER_ENERGY = 5;

export const WEEKLY_HACKATHON_TARGET = 650;
export const WEEKLY_HACKATHON_REWARD = {
  energy: 80,
  commitsCurrent: 60,
  depressionRelief: 15
};

export const SPRINT_PASS_LEVELS = [
  { level: 1, requiredXp: 20, freeReward: { energy: 10 }, premiumReward: { energy: 20 } },
  { level: 2, requiredXp: 20, freeReward: { commitsCurrent: 15 }, premiumReward: { commitsCurrent: 30 } },
  { level: 3, requiredXp: 25, freeReward: { energy: 10 }, premiumReward: { energy: 20 } },
  { level: 4, requiredXp: 25, freeReward: { commitsCurrent: 15 }, premiumReward: { commitsCurrent: 30, depressionRelief: 10 } },
  { level: 5, requiredXp: 30, freeReward: { energy: 15, commitsCurrent: 20 }, premiumReward: { energy: 30, commitsCurrent: 40 } },
  { level: 6, requiredXp: 30, freeReward: { energy: 10 }, premiumReward: { energy: 20 } },
  { level: 7, requiredXp: 35, freeReward: { commitsCurrent: 20 }, premiumReward: { commitsCurrent: 40 } },
  { level: 8, requiredXp: 35, freeReward: { energy: 10 }, premiumReward: { energy: 20, depressionRelief: 10 } },
  { level: 9, requiredXp: 40, freeReward: { commitsCurrent: 20 }, premiumReward: { energy: 30 } },
  { level: 10, requiredXp: 45, freeReward: { energy: 20, commitsCurrent: 30 }, premiumReward: { energy: 40, commitsCurrent: 50 } },
  { level: 11, requiredXp: 45, freeReward: { energy: 10 }, premiumReward: { energy: 20 } },
  { level: 12, requiredXp: 50, freeReward: { commitsCurrent: 20 }, premiumReward: { commitsCurrent: 45 } },
  { level: 13, requiredXp: 50, freeReward: { energy: 15 }, premiumReward: { energy: 25, depressionRelief: 10 } },
  { level: 14, requiredXp: 55, freeReward: { commitsCurrent: 25 }, premiumReward: { commitsCurrent: 45 } },
  { level: 15, requiredXp: 60, freeReward: { energy: 20, commitsCurrent: 35 }, premiumReward: { energy: 50, commitsCurrent: 60 } },
  { level: 16, requiredXp: 60, freeReward: { energy: 15 }, premiumReward: { energy: 30 } },
  { level: 17, requiredXp: 65, freeReward: { commitsCurrent: 25 }, premiumReward: { commitsCurrent: 50 } },
  { level: 18, requiredXp: 70, freeReward: { energy: 20 }, premiumReward: { energy: 40, depressionRelief: 15 } },
  { level: 19, requiredXp: 75, freeReward: { commitsCurrent: 30 }, premiumReward: { commitsCurrent: 60 } },
  { level: 20, requiredXp: 80, freeReward: { energy: 30, commitsCurrent: 50 }, premiumReward: { energy: 80, commitsCurrent: 100, depressionRelief: 25 } }
];

export const SHOP_ITEM_EFFECTS = {
  depression_cure: { depressionRelief: 60 },
  tier_boost: { xpTotal: 40, commitsCurrent: 50 }
};
