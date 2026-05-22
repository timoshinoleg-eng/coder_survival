export const CONTEXT_OFFER_GLOBAL_COOLDOWN_MS = 90 * 1000;

export const CONTEXT_OFFER_RULES = {
  low_energy: {
    priority: 1,
    cooldownMs: 90 * 60 * 1000,
    energyPercentThreshold: 15,
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
    depressionThreshold: 20,
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
  },
  {
    questType: 'spend_energy',
    targetValue: 150,
    rewardPayload: { energy: 20, commitsCurrent: 15 }
  },
  {
    questType: 'invite_friend',
    targetValue: 1,
    rewardPayload: { energy: 25 }
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
  depressionGainPerTap: 0.5,
  depressionGainLowEnergy: 0.5,
  depressionGainCriticalEnergy: 1.0,
  depressionRecoveryPerEnergy: 2,
  depressionPenaltyMultiplier: 0.5,
  maxDepression: 100,
  energyRecoveryIntervalSeconds: 60,
  newbieRecoveryMultiplier: 1.5,
  newbiePeriodHours: 72,
  maxEnergy: 100,
  critSilverChance: 0.15,
  critGoldChance: 0.05,
  burnoutCommitMultiplier: 0.5,
  streakBonusPerDay: 0.02,
  streakBonusCap: 0.20
};

export const DEPRESSION_RECOVERY_PER_ENERGY = TAP_MECHANICS.depressionRecoveryPerEnergy;

export const WEEKLY_HACKATHON_TARGET = 650;
export const WEEKLY_HACKATHON_REWARD = {
  energy: 80,
  commitsCurrent: 60,
  depressionRelief: 15
};

export const SHOP_ITEM_EFFECTS = {
  coffee_break: { energy: 50, depressionRelief: 30 },
  depression_cure: { depressionRelief: 60 },
  tier_boost: { xpTotal: 40, commitsCurrent: 50 }
};

// P0-2: Stress v2 A/B configuration
export const STRESS_V2 = {
  DEPRESSION_INCREASE_LOW_ENERGY: 60,
  DEPRESSION_CRITICAL_LOW_ENERGY: 30,
  DEPRESSION_PASSIVE_DECAY_PER_HOUR: 5,
  STRESS_GAIN_PER_TAP_BELOW_50: 1,
  STRESS_GAIN_PER_TAP_BELOW_30: 2
};

// P1-4: escalating streak bonus for daily login quest (applied ON TOP of base reward)
export const LOGIN_STREAK_BONUS = {
  1: { energy: 0 },
  2: { energy: 5 },
  3: { energy: 10 },
  4: { energy: 15 },
  5: { energy: 20 },
  6: { energy: 25 },
  7: { energy: 30, depressionRelief: 10 }
};

// ═══════════════════════════════════════════════════════════════
// STAGE 2: HABIT FORMATION LAYER — CONSTANTS
// ═══════════════════════════════════════════════════════════════

const STAGE2 = {
  DAILY_QUEST: {
    RESET_HOUR: 0,
    // PROG-01: 3 regular quests + 1 bonus
    BASE_QUESTS: [
      { id: 'q_login', type: 'login', target: 1, reward: { energy: 10, xp: 5, passXp: 5 } },
      { id: 'q_tap50', type: 'tap_count', target: 50, reward: { energy: 20, xp: 10, passXp: 30 } },
      { id: 'q_commit100', type: 'commit_total', target: 100, reward: { energy: 25, xp: 15, passXp: 35 } }
    ],
    POOLS: {
      // Bonus pool: higher targets, 2x rewards applied at generation time
      BONUS: [
        { id: 'q_bonus_tap', type: 'tap_count', target: 200, reward: { energy: 30, xp: 20, passXp: 40 } },
        { id: 'q_bonus_crit', type: 'crit_count', target: 20, reward: { commitsCurrent: 60, xp: 20, passXp: 40, skinFragment: 'bug_hunter' } },
        { id: 'q_bonus_commit', type: 'commit_total', target: 500, reward: { energy: 40, xp: 30, passXp: 40 } }
      ]
    },
    FULL_CLEAR: {
      reward: { energy: 30, xp: 20, passXp: 50 },
      LOOT_BOX: {
        drops: [
          { id: 'energy_10', weight: 70, reward: { energy: 10 } },
          { id: 'skin_frag', weight: 20, reward: { skinFragment: 'random_common' } },
          { id: 'stars_5', weight: 10, reward: { stars: 5 } }
        ]
      }
    }
  },

  PASS: {
    SEASON_DAYS: 30,
    SEASON_ID: 'season_1_startup',
    LEVELS: (() => {
      const levels = [];
      for (let i = 1; i <= 20; i++) {
        levels.push({ level: i, requiredXp: 200 + (i - 1) * 15 });
      }
      return levels;
    })(),
    FREE_REWARDS: {
      1: { energy: 25 },
      2: { stars: 5 },
      3: { commitBoostPercent: 5, durationHours: 24 },
      5: { energy: 20, stars: 10 },
      10: { energy: 30, stars: 15 },
      15: { energy: 40, stars: 20 },
      20: { energy: 50, stars: 25, title: 'Survivor' }
    },
    PREMIUM_REWARDS: {
      1: { energy: 50, stars: 10 },
      2: { stars: 15, skinFragment: 1 },
      3: { commitBoostPercent: 10, durationHours: 24 },
      5: { skinFragment: 'startup_hoodie' },
      10: { skin: 'freelancer_pajama' },
      15: { skin: 'team_lead' },
      20: { skin: 'cto_cape', title: 'Legendary Dev', stars: 100 }
    },
    CATCH_UP: {
      missedDayPercent: 0.5,
      weekendMultiplier: 2.0,
      lastChanceDays: 3,
      levelBuyCostStars: 10
    }
  },

  STREAK: {
    DAILY_REWARD: { energy: 10, xp: 5, passXp: 5 },
    MILESTONES: {
      7: { commitBoostPercent: 10, durationHours: 24, title: 'week_warrior' },
      14: { skinFragment: 'midnight_office', title: 'office_dweller' },
      30: { skin: 'retro_boombox' }
    },
    RECOVERY: {
      starBaseCost: 5,
      starCostIncrement: 5
    },
    PROTECTION: {
      freeSavesPerSeason: 1,
      starSaveCost: 25,
      maxStarSavesPerSeason: 2,
      teamSaveThreshold: 3
    }
  },

  REWARDED_VIDEO: {
    TRIGGER_ENERGY_PCT: 0.20,
    REWARD_ENERGY_PCT: 0.50,
    DAILY_LIMIT: 3,
    COOLDOWN_MINUTES: 5,
    BUTTON_TEXT: '☕ Кофе-брейк'
  },

  MINIGAMES: {
    hello_world: {
      requiredLevel: 2,
      cooldownHours: 4,
      timeLimitSeconds: 3,
      maxScore: 5,
      reward: { commits: 50, depressionRelief: 10 }
    },
    code_review: {
      requiredLevel: 4,
      cooldownHours: 6,
      timeLimitSeconds: 15,
      maxScore: 3,
      reward: { commits: 100, depressionRelief: 20, tapBoostPercent: 10, tapBoostDurationMinutes: 10 }
    }
  },

  TAP_MECHANICS
};

const totalStage2PassXp = STAGE2.PASS.LEVELS.reduce((sum, level) => sum + level.requiredXp, 0);
console.assert(totalStage2PassXp === 6850, `Pass XP mismatch: ${totalStage2PassXp}`);
console.assert(STAGE2.PASS.LEVELS.length === 20, 'Level count must be 20');
console.assert(
  STAGE2.DAILY_QUEST.FULL_CLEAR.LOOT_BOX.drops.reduce((sum, drop) => sum + drop.weight, 0) === 100,
  'LootBox weights must sum to 100'
);

export { STAGE2 };

// ═══════════════════════════════════════════════════════════════
// STAGE 3: SOCIAL RETENTION LAYER — CONSTANTS
// ═══════════════════════════════════════════════════════════════

const STAGE3 = {
  TEAM_HACKATHON: {
    WEEK_DURATION_DAYS: 7,
    COMMITS_PER_ACTIVE_MEMBER: 150,
    REWARD_TIERS: {
      BRONZE: { threshold: 0.50, reward: { energy: 30, xp: 20, passXp: 10 } },
      SILVER: { threshold: 0.75, reward: { energy: 50, xp: 40, passXp: 20, skinFragment: 'hackathon_contender' } },
      GOLD: { threshold: 1.00, reward: { energy: 100, xp: 80, passXp: 50, skinFragment: 'hackathon_winner' } }
    },
    NOTIFICATION_HOURS: [9, 15, 21],
    MIN_ACTIVE_MEMBERS: 2
  },

  DAILY_BATTLE: {
    DURATION_HOURS: 24,
    DEFAULT_STAKE: 10,
    MAX_STAKE: 50,
    MATCHMAKING_RANGE: 0.20,
    REWARD_WINNER_MULTIPLIER: 2,
    COOLDOWN_HOURS: 1,
    STATUSES: {
      PENDING: 'pending',
      ACTIVE: 'active',
      COMPLETED: 'completed',
      EXPIRED: 'expired'
    }
  },

  REFERRAL: {
    MILESTONE_REWARDS: {
      1: { inviter: { commits: 50, energy: 25 }, invited: { commits: 100, inventory: { coffee_cups: 1 } } },
      3: { inviter: { commits: 200, energy: 50, stars: 5 }, invited: { commits: 100, energy: 25 } },
      5: { inviter: { skin: 'team_lead', energy: 100 }, invited: { commits: 100, stars: 5 } }
    },
    ACTIVE_THRESHOLD_COMMITS: 20,
    ANTI_FARM_DAYS: 2,
    DEEP_LINK_PREFIX: 'ref_'
  },

  DAILY_SUMMARY: {
    SCORE: {
      PRODUCTIVITY_MAX_COMMITS: 500,
      PRODUCTIVITY_WEIGHT: 40,
      DEPRESSION_WEIGHT: 30,
      SOCIAL_MAX_EVENTS: 5,
      SOCIAL_WEIGHT: 20,
      REFERRAL_MAX_COUNT: 3,
      REFERRAL_WEIGHT: 10
    },
    STATUSES: {
      PRODUCTIVE_GENIUS: { id: 'productive_genius', title: 'Продуктивный гений' },
      BURNT_OUT: { id: 'burnt_out', title: 'Выгорел дня' },
      DEPRESSION_SAVIOR: { id: 'depression_savior', title: 'Спаситель депрессии' }
    },
    REWARDS: {
      RANK_1: { tapBoostPercent: 15, tapBoostDurationHours: 24, skinFragment: 'battle_hero', title: 'daily_hero' },
      RANK_2: { tapBoostPercent: 10, tapBoostDurationHours: 12 },
      RANK_3: { tapBoostPercent: 5, tapBoostDurationHours: 6 }
    },
    POST_HOUR_UTC: 18
  },

  SHARE_CARDS: {
    TEMPLATES: [
      { id: 'depression_scale', aspect: '9:16', trigger: 'depression>75' },
      { id: 'burnout_badge', aspect: '1:1', trigger: 'isBurnout' },
      { id: 'crit_gold', aspect: '1:1', trigger: 'critTier===gold' },
      { id: 'hackathon_result', aspect: '9:16', trigger: 'hackathon_completed' },
      { id: 'battle_victory', aspect: '1:1', trigger: 'battle_won' }
    ],
    CANVAS_WIDTH_STORIES: 1080,
    CANVAS_HEIGHT_STORIES: 1920,
    CANVAS_WIDTH_CHAT: 1080,
    CANVAS_HEIGHT_CHAT: 1080
  }
};

export { STAGE3 };

// ═══════════════════════════════════════════════════════════════
// STAGE 4: EMOTIONAL DEPTH & LIVEOPS — CONSTANTS
// ═══════════════════════════════════════════════════════════════

const STAGE4 = {
  EVENTS: {
    ROTATION: [
      { id: 'coffee_week', name: 'Кофейная неделя', weekIndex: 0, modifiers: { energyRecoveryMult: 2.0 }, bonusQuest: { type: 'consume_coffee', target: 5, reward: { energy: 50 } } },
      { id: 'weekend_hackathon', name: 'Хакатон выходного дня', weekIndex: 1, modifiers: { commitMult: 2.0 }, activeDays: [6, 0] },
      { id: 'bug_hunt', name: 'Охота на баги', weekIndex: 2, modifiers: { critChanceAdd: 0.10 }, bonusQuest: { type: 'crit_count', target: 10, reward: { skinFragment: 'bug_hunter_gold' } } },
      { id: 'crunch_time', name: 'Кранч-тайм', weekIndex: 3, modifiers: { depressionImmunityMinutes: 60 }, activeDays: [5], bonusQuest: { type: 'tap_count', target: 100, reward: { skin: 'overtime_hero' } } }
    ],
    EVENT_DURATION_DAYS: 7,
    MAX_CONCURRENT: 1
  },

  CAREER_STORY: {
    BEATS: {
      1: { rankRequired: 'junior', title: 'День 1', text: 'Ваш менеджер — NPC с календарём дедлайнов. Выживите первую неделю.', illustration: 'beat_01_manager' },
      3: { rankRequired: 'middle', title: 'Первое код-ревью', text: 'Коллега оставил 47 комментариев. Вы чувствуете себя самозванцем.', illustration: 'beat_02_review' },
      5: { rankRequired: 'senior', title: 'Legacy Codebase', text: 'Вы нашли TODO от 2014 года. Автор: unknown. Шанс выжить: 12%.', illustration: 'beat_03_cave' },
      7: { rankRequired: 'lead', title: 'Тимлид', text: 'Теперь от вас зависит команда. Депрессия — это не баг, это фича.', illustration: 'beat_04_team' },
      10: { rankRequired: 'cto', title: 'CTO', text: 'Все смотрят на вас. Даже когда вы просто пьёте кофе.', illustration: 'beat_05_cto' }
    }
  },

  AUDIO: {
    SFX: {
      tap: { file: 'sfx_tap.ogg', volume: 0.6 },
      critSilver: { file: 'sfx_silver.ogg', volume: 0.8 },
      critGold: { file: 'sfx_gold.ogg', volume: 1.0 },
      burnout: { file: 'sfx_burnout.ogg', volume: 0.9 },
      energyEmpty: { file: 'sfx_empty.ogg', volume: 0.5 }
    },
    BGM: {
      track: 'bgm_lofi.ogg',
      volume: 0.3,
      loop: true
    },
    MAX_TOTAL_SIZE_MB: 2
  }
};

export { STAGE4 };
