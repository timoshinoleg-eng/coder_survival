export const CONTEXT_OFFER_GLOBAL_COOLDOWN_MS = 90 * 1000;

export const DEFAULTS = {
  BALANCE_VERSION: '2.0-hook-optimized',
  GENERATORS: {
    GROWTH_RATE: 1.15,
    tiers: {
      junior_dev: { baseOutput: 1, baseCost: 50, unlockAtClicks: 8 },
      middle_dev: { baseOutput: 7, baseCost: 400, requires: { tier: 'junior_dev', owned: 5 } },
      senior_dev: { baseOutput: 42, baseCost: 3200, requires: { tier: 'middle_dev', owned: 5 } },
      tech_lead: { baseOutput: 240, baseCost: 25600, requires: { tier: 'senior_dev', owned: 5 } },
      staff_engineer: { baseOutput: 1300, baseCost: 204800, requires: { tier: 'tech_lead', owned: 5 } }
    }
  },
  FTUE_ACCELERATION: [
    { id: 'minute_0_to_5', minMinutes: 0, maxMinutes: 5, incomeMultiplier: 3.0, costMultiplier: 0.5 },
    { id: 'minute_5_to_15', minMinutes: 5, maxMinutes: 15, incomeMultiplier: 2.0, costMultiplier: 0.7 },
    { id: 'minute_15_to_30', minMinutes: 15, maxMinutes: 30, incomeMultiplier: 1.5, costMultiplier: 0.85 },
    { id: 'minute_30_to_60', minMinutes: 30, maxMinutes: 60, incomeMultiplier: 1.2, costMultiplier: 1.0 },
    { id: 'after_60min', minMinutes: 60, maxMinutes: Infinity, incomeMultiplier: 1.0, costMultiplier: 1.0 }
  ],
  DEPRESSION: {
    triggers: {
      bugEncountered: 4,
      failedDeploy: 12,
      criticalCodeReview: 8,
      energyBelow20Percent: { value: 1, tickIntervalSeconds: 60 }
    },
    selfishDebuff: {
      appliesTo: ['coffee_break', 'energy_refill_discount', 'streak_saver'],
      doesNotApplyTo: ['generators', 'boosters', 'skins', 'pass_premium', 'battle_pass_xp_boost'],
      multiplier: 2.0
    },
    hopelessDebuff: {
      appliesTo: ['tap_action_only'],
      doesNotApplyTo: ['iap_purchases', 'mini_games', 'generator_purchase', 'quest_claim', 'ad_rewards'],
      effect: 'tap_yields_0_loc_this_click',
      probability: 0.5
    },
    heartAttackSessionReset: {
      resetFields: ['session.loc_earned_this_session', 'session.active_boosters', 'session.temporary_multipliers'],
      preserveFields: ['lifetime.loc_total', 'lifetime.prestige_currency', 'lifetime.generators_owned', 'lifetime.unlocked_skins', 'battle_pass.xp_total', 'battle_pass.claimed_rewards', 'streak.days', 'squads.membership', 'inventory.consumables'],
      sessionAnchorField: 'progression.session_started_at'
    }
  },
  RANDOM_EVENTS: {
    positiveGapResolution: 'add_two_events',
    codeReviewRejectDepression: 8,
    productionAlert: { energyDrain: 0.08, tickIntervalSeconds: 60, durationSeconds: 180 },
    FTUE_EVENT_SUPPRESSION: [
      { id: 'first_5_minutes', minMinutes: 0, maxMinutes: 5, rule: 'no_negative_events' },
      { id: 'minute_5_to_15', minMinutes: 5, maxMinutes: 15, rule: 'negative_events_at_50_percent_weight' },
      { id: 'after_15_min', minMinutes: 15, maxMinutes: Infinity, rule: 'full_event_pool' }
    ],
    stateMachine: {
      legacyCode: { refactorClicksRequired: 10, effectWhileActive: { upgradeCostMultiplier: 2 } },
      deployFriday: { choiceTimeoutSeconds: 30, successChance: 0.70, failLocLoss: 0.25, successBadge: 'friday_deployer' }
    }
  },
  DAILY_QUESTS: {
    avgDailyFarm: { method: 'rolling_7_day_average', source: 'daily_farm_log', formula: 'SUM(last_7_days_loc_earned) / 7', fallback: { day1: 5000, day2: 12000, day3: 25000 } },
    rewardSplit: { mainQuest1: 0.10, mainQuest2: 0.10, mainQuest3: 0.10, bonusQuest: 0.05, fullClearBonusStars: 100 },
    frontLoading: { multiplier: 2.5, appliesTo: ['main_quest_1', 'main_quest_2', 'main_quest_3'], doesNotApplyTo: ['bonus_quest', 'full_clear_bonus'] },
    triggerExampleValues: { tapCount: 300, useBooster: 1, watchAd: 1, buyGenerator: 1, earnLoc: 10000 }
  },
  STREAK_SAVER: {
    triggerWindowSeconds: 2 * 60 * 60,
    priceStars: 1,
    discountPercent: 90,
    minIntervalDays: 7
  },
  BATTLE_PASS: {
    avgDailyXP: { method: 'rolling_7_day_personal_average', formula: 'SUM(player_xp_last_7_days) / 7' },
    catchUp: { missedDayPercent: 0.5, capDays: 3, appliesWeekendMultiplier: false },
    weekendDoubleXp: { appliesTo: ['tap_xp', 'quest_xp', 'generator_xp', 'event_xp'], doesNotApplyTo: ['catch_up_xp', 'iap_xp_boosters', 'ad_xp'] },
    premiumTrackRefund: { totalRefundPercent: 0.50, currencySplit: { stars: 0.40, ton: 0.10 }, distribution: 'per_level_claim', perLevelPercent: 0.025 }
  },
  SQUADS: {
    socialObligation: { reductionPercent: 20, trigger: 'any_member.missed_yesterday == true', duration: '24 hours from UTC midnight' },
    timezone: 'UTC',
    teamBonusTarget: { appliesTo: 'squad_passive_loc_multiplier', baseMultiplier: 1.0, fullSquadMultiplier: 1.5, formula: '1.0 + (active_members / total_members) * 0.5' },
    firstSquadBonus: { trigger: 'first_7_days_after_joining_squad', multiplier: 1.5 },
    hackathon: { frequency: 'weekly (Mon 00:00 UTC -> Sun 23:59 UTC)', goalType: 'total_LOC_from_all_members', rewards: ['squad_only_skins', 'squad_only_boosters'] }
  },
  ANTICHEAT: {
    fatigueDetection: { minimumSessionDurationMs: 600000, method: 'compare_first_5_min_cps_vs_last_3_min_cps', expectedDecayRatio: 0.75, suspiciousThresholdRatio: 0.95, flagAfterMs: 900000 },
    banScoreIncrements: { layer1CpsOver20: 5, layer1PixelPerfect: 3, layer2CvBelow01: 10, layer2MissingFatigue: 7, layer3BalanceMismatch: 25 },
    banScoreDecay: { ratePerDay: -5, condition: 'no_new_violations_today AND >50 taps_made', floor: 0 },
    sanctionsScope: { leaderboardBanVisibility: 'hidden_from_global_leaderboard', appealLocation: 'Settings -> Account -> Appeal Ban', appealAvailableAt: 'ban_score >= 50' }
  },
  ADS: {
    adsgramProofValidation: { method: 'server-to-server callback', endpoint: '/api/rewards/adsgram_callback', signatureHeader: 'X-Adsgram-Signature', envVar: 'ADSGRAM_SECRET', validation: 'hmac_sha256(body, ADSGRAM_SECRET) === signature' },
    propellerProofValidation: { method: 'postback URL with hash', endpoint: '/api/rewards/propeller_callback', signatureParam: 'hash', envVar: 'PROPELLER_SECRET', validation: 'md5(event_id + user_id + PROPELLER_SECRET) === hash' },
    replayProtection: { storage: 'KV.rewards:event_id_claimed', ttlHours: 24 },
    adCooldownMinutes: 15,
    maxPerDay: 5,
    ftueAdRules: [
      { id: 'first_30_minutes', minMinutes: 0, maxMinutes: 30, rule: 'no_ads_shown' },
      { id: 'minute_30_to_60', minMinutes: 30, maxMinutes: 60, rule: 'max_1_ad' },
      { id: 'after_60min', minMinutes: 60, maxMinutes: Infinity, rule: 'full_ad_availability' }
    ]
  }
};

export const CONTEXT_OFFER_RULES = {
  low_energy: {
    priority: 1,
    cooldownMs: 60 * 60 * 1000,
    energyPercentThreshold: 15,
    title: '⚡ Энергия просела',
    body: 'Нужен быстрый рефилл, иначе сессия закончится раньше времени.',
    productId: 'energy_refill',
    action: 'Зарядиться'
  },
  near_rank: {
    priority: 2,
    cooldownMs: 6 * 60 * 60 * 1000,
    progressThreshold: 0.85,
    title: '🚀 Повышение рядом',
    body: 'Добей уровень сейчас: буст даст XP и подтолкнёт карьерный рост.',
    productId: 'tier_boost',
    action: 'Дожать'
  },
  stress_warning: {
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

export const MIN_IDLE_THRESHOLD_SECONDS = 300;
export const DEPRESSION_PASSIVE_RECOVERY_PER_HOUR = 20;
export const RECOVERY_INTERVAL_NEWBIE_SECONDS = 90;
export const RECOVERY_INTERVAL_VETERAN_SECONDS = 120;

export const DEPRESSION_SCALE = {
  MIN: 0,
  MAX: 200,
  AFFLICTION_THRESHOLD: 100,
  HEART_ATTACK_THRESHOLD: 200
};

export const TAP_MECHANICS = {
  depressionGainPerTap: 0.5,
  depressionGainLowEnergy: 0.5,
  depressionGainCriticalEnergy: 1.0,
  depressionRecoveryPerEnergy: 5,
  depressionPenaltyMultiplier: 0.5,
  maxDepression: DEPRESSION_SCALE.HEART_ATTACK_THRESHOLD,
  afflictionDepression: DEPRESSION_SCALE.AFFLICTION_THRESHOLD,
  energyRecoveryIntervalSeconds: RECOVERY_INTERVAL_VETERAN_SECONDS,
  newbieRecoveryMultiplier: RECOVERY_INTERVAL_VETERAN_SECONDS / RECOVERY_INTERVAL_NEWBIE_SECONDS,
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
  coffee_break: { energy: 50, depressionRelief: 10 },
  depression_cure: { depressionRelief: 50 },
  tier_boost: { xpTotal: 40, commitsCurrent: 50 }
};

// P0-2: Stress v2 A/B configuration
export const STRESS_V2 = {
  DEPRESSION_INCREASE_LOW_ENERGY: 60,
  DEPRESSION_CRITICAL_LOW_ENERGY: 30,
  DEPRESSION_PASSIVE_DECAY_PER_HOUR: DEPRESSION_PASSIVE_RECOVERY_PER_HOUR,
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
      { id: 'q_login', type: 'login', target: 1, reward: { commitsCurrent: 500 } },
      { id: 'q_tap300', type: 'tap_count', target: 300, reward: { commitsCurrent: 500 } },
      { id: 'q_earn10000', type: 'commit_total', target: 10000, reward: { commitsCurrent: 500 } }
    ],
    POOLS: {
      // Bonus pool: higher targets, 2x rewards applied at generation time
      BONUS: [
        { id: 'q_bonus_watch_ad', type: 'watch_ad', target: 1, reward: { commitsCurrent: 250 } },
        { id: 'q_bonus_buy_generator', type: 'buy_generator', target: 1, reward: { commitsCurrent: 250 } },
        { id: 'q_bonus_commit', type: 'commit_total', target: 10000, reward: { commitsCurrent: 250 } },
        { id: 'q_bonus_burnout', type: 'burnout_recover', target: 1, reward: { commitsCurrent: 250 } },
        { id: 'q_bonus_premium_buy', type: 'shop_purchase', target: 1, reward: { commitsCurrent: 250 } },
        { id: 'q_bonus_referral', type: 'referral_invite', target: 1, reward: { commitsCurrent: 250 } },
        { id: 'q_bonus_team', type: 'team_hackathon', target: 1000, reward: { commitsCurrent: 250 } }
      ]
    },
    FULL_CLEAR: {
      reward: { stars: 100 },
      LOOT_BOX: {
        drops: [
          { id: 'energy_10', weight: 70, reward: { energy: 10 } },
          { id: 'skin_frag', weight: 20, reward: { skinFragment: 'random_common' } },
          { id: 'stars_5', weight: 10, reward: { stars: 5 } }
        ]
      }
    },
    TRIGGERS: {
      tapCount: DEFAULTS.DAILY_QUESTS.triggerExampleValues.tapCount,
      useBooster: DEFAULTS.DAILY_QUESTS.triggerExampleValues.useBooster,
      watchAd: DEFAULTS.DAILY_QUESTS.triggerExampleValues.watchAd,
      buyGenerator: DEFAULTS.DAILY_QUESTS.triggerExampleValues.buyGenerator,
      earnLoc: DEFAULTS.DAILY_QUESTS.triggerExampleValues.earnLoc
    }
  },

  PASS: {
    SEASON_DAYS: 30,
    SEASON_ID: 'season_1_startup',
    MAX_LEVEL: 50,
    LEVELS: (() => {
      const levels = [];
      const tiers = [
        { start: 1, end: 10, xp: 100 },
        { start: 11, end: 20, xp: 150 },
        { start: 21, end: 30, xp: 200 },
        { start: 31, end: 40, xp: 250 },
        { start: 41, end: 50, xp: 300 },
      ];
      for (const tier of tiers) {
        for (let i = tier.start; i <= tier.end; i++) {
          levels.push({ level: i, requiredXp: tier.xp });
        }
      }
      return levels;
    })(),
    FREE_REWARDS: {
      1: { energy: 15 },
      2: { energy: 15 },
      3: { commitsCurrent: 15 },
      4: { energy: 20 },
      5: { energy: 25, commitsCurrent: 20 },
      10: { energy: 30, stars: 5 },
      15: { energy: 35, skinFragment: 'pass_rare_1' },
      20: { energy: 40, stars: 10 },
      25: { energy: 45, stars: 10 },
      30: { energy: 50, stars: 15 },
      35: { energy: 55, skinFragment: 'pass_epic_1' },
      40: { energy: 60, stars: 20 },
      45: { energy: 65, stars: 25 },
      50: { energy: 100, stars: 30, skin: 'season_hero' }
    },
    PREMIUM_REWARDS: {
      1: { energy: 30, commitsCurrent: 10 },
      2: { energy: 30, commitsCurrent: 10 },
      3: { energy: 40, commitsCurrent: 15 },
      4: { energy: 40, commitsCurrent: 20 },
      5: { energy: 50, commitsCurrent: 40, skinFragment: 'pass_common_1' },
      10: { energy: 80, stars: 15, skin: 'pass_junior_hoodie' },
      15: { energy: 100, avatarFrame: 'gold_coder', stars: 10 },
      20: { energy: 120, stars: 25, skin: 'pass_middle_blazer', muCurrency: 1 },
      25: { energy: 130, avatarFrame: 'sprint_master', stars: 15 },
      30: { energy: 150, stars: 30, skin: 'pass_senior_cape' },
      35: { energy: 170, avatarFrame: 'bug_hunter', muCurrency: 2, stars: 20 },
      40: { energy: 200, stars: 40, skin: 'pass_lead_armor' },
      45: { energy: 220, avatarFrame: 'cto_glow', muCurrency: 3, stars: 25 },
      50: { energy: 300, stars: 100, skin: 'legendary_architect', muCurrency: 5, title: 'Season Legend' }
    },
    premiumXpMultiplier: 1.2,
    CATCH_UP: {
      missedDayPercent: DEFAULTS.BATTLE_PASS.catchUp.missedDayPercent,
      weekendMultiplier: 2.0,
      catchUpCapDays: DEFAULTS.BATTLE_PASS.catchUp.capDays,
      catchUpAppliesWeekendMultiplier: DEFAULTS.BATTLE_PASS.catchUp.appliesWeekendMultiplier,
      premiumTrackRefundPercent: DEFAULTS.BATTLE_PASS.premiumTrackRefund.totalRefundPercent,
      premiumTrackRefundCurrencySplit: DEFAULTS.BATTLE_PASS.premiumTrackRefund.currencySplit,
      premiumTrackRefundDistribution: DEFAULTS.BATTLE_PASS.premiumTrackRefund.distribution,
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
    },
    SAVER: {
      triggerWindowSeconds: DEFAULTS.STREAK_SAVER.triggerWindowSeconds,
      priceStars: DEFAULTS.STREAK_SAVER.priceStars,
      discountPercent: DEFAULTS.STREAK_SAVER.discountPercent,
      minIntervalDays: DEFAULTS.STREAK_SAVER.minIntervalDays
    }
  },

  REWARDED_VIDEO: {
    TRIGGER_ENERGY_PCT: 0.20,
    REWARD_ENERGY_PCT: 0.50,
    DAILY_LIMIT: DEFAULTS.ADS.maxPerDay,
    COOLDOWN_MINUTES: DEFAULTS.ADS.adCooldownMinutes,
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
    },
    dream_interview: {
      requiredLevel: 6,
      cooldownHours: 24,
      timeLimitSeconds: 60,
      maxScore: 5,
      minSuccessScore: 4,
      reward: { commits: 200, depressionRelief: 30, skinFragment: 'dream_interview_rare' }
    },
    architectural_committee: {
      requiredLevel: 8,
      cooldownHours: 24,
      timeLimitSeconds: 120,
      maxScore: 1,
      minSuccessScore: 1,
      reward: { commits: 500, depressionRelief: 40 }
    },
    ipo: {
      requiredLevel: 10,
      cooldownHours: 168,
      timeLimitSeconds: 90,
      maxScore: 1,
      minSuccessScore: 1,
      reward: { commits: 1000, depressionRelief: 50, skin: 'cto_cape' }
    }
  },

  WEEKLY_SPRINT: {
    NARRATIVE_ARC: ['Planning', 'Coding', 'Testing', 'Deploy'],
    REWARD_CHOICE: {
      type: 'choice',
      options: ['skin', 'booster', 'currency'],
      count: 3
    },
    TIERS: {
      EASY: {
        targetCommits: 500,
        targetQuests: 3,
        reward: { energy: 30, xp: 20 }
      },
      MEDIUM: {
        targetCommits: 1500,
        targetQuests: 5,
        targetMinigames: 1,
        reward: { energy: 50, xp: 40, skinFragment: 'sprint_contender' }
      },
      HARD: {
        targetCommits: 3000,
        targetQuests: 7,
        targetMinigames: 2,
        targetMemeShares: 1,
        reward: { energy: 100, xp: 80, skinFragment: 'sprint_hero', title: 'sprint_master' }
      }
    }
  },

  TAP_MECHANICS
};

const totalStage2PassXp = STAGE2.PASS.LEVELS.reduce((sum, level) => sum + level.requiredXp, 0);
console.assert(totalStage2PassXp === 10000, `Pass XP mismatch: ${totalStage2PassXp}`);
console.assert(STAGE2.PASS.LEVELS.length === 50, 'Level count must be 50');
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
    FINAL_POST_DAY_UTC: 0,
    FINAL_POST_HOUR_UTC: 21,
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
      1: { inviter: { stars: 50 }, invited: { commits: 100, inventory: { coffee_cups: 1 } } },
      3: { inviter: { stars: 200 }, invited: { commits: 100, energy: 25 } },
      5: { inviter: { stars: 500, skin: 'team_lead' }, invited: { commits: 100, stars: 5 } }
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
      { id: 'crunch_time', name: 'Кранч-тайм', weekIndex: 3, modifiers: { depressionImmunityMinutes: 60 }, activeDays: [5], bonusQuest: { type: 'tap_count', target: 100, reward: { skin: 'overtime_hero' } } },
      {
        id: 'ship_week',
        name: 'Ship Week',
        description: 'Commuting code to prod! Commits count x3.',
        duration: 7,
        modifiers: {
          commitMult: 3.0,
          energyRecoveryMult: 1.5,
        },
        bonusQuest: {
          type: 'q_bonus_ship',
          name: 'Ship 3 commits',
          description: 'Ship 3 commits this week',
          target: 3,
          reward: { type: 'skin_fragment', amount: 2 },
        },
        tiers: {
          bronze: { threshold: 0.5, rewards: { energy: 50, xp: 200 } },
          silver: { threshold: 0.75, rewards: { energy: 100, xp: 500, passXp: 200 } },
          gold: { threshold: 1.0, rewards: { energy: 200, xp: 1000, passXp: 500, stars: 50 } },
        },
      },
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

// ═══════════════════════════════════════════════════════════════
// PHASE 10: VIRAL POLISH — CONSTANTS
// ═══════════════════════════════════════════════════════════════

const PHASE10 = {
  SKIN_PRICES: {
    office_cat: 100
  },
  GIF: {
    DEBUG_STAGES: {
      width: 256,
      height: 256,
      frames: 5,
      frameDelayMs: 700
    },
    DEADLINE: {
      width: 256,
      height: 256,
      frames: 2,
      frameDelayMs: 1400
    }
  }
};

export { STAGE4, PHASE10 };

// ═══════════════════════════════════════════════════════════════
// PP-18: PRESTIGE SYSTEM
// ═══════════════════════════════════════════════════════════════

export const PRESTIGE = {
  THRESHOLD_XP: 3100,
  // Safety ceiling for prestige bonus scaling. The stored prestige_level keeps
  // incrementing (trophy count), but bonus multipliers are clamped to this many
  // levels so crit/recovery/tap stay sane. Balance lever — adjust here only.
  MAX_PRESTIGE_LEVEL: 20,
  BONUSES: {
    TAP_MULT_PER_LEVEL: 0.10,
    ENERGY_RECOVERY_MULT_PER_LEVEL: 0.05,
    CRIT_CHANCE_ADD_PER_LEVEL: 0.005,
    MAX_ENERGY_ADD_PER_LEVEL: 10,
    DEPRESSION_RESISTANCE_PER_LEVEL: 0.05,
  },
  SHOP: {
    SKIN:         { cost: 50,  id: 'prestige_skin_veteran',   desc: 'Permanent veteran skin' },
    TAP_BOOST:    { cost: 100, id: 'prestige_tap_boost',       desc: 'Permanent x1.2 tap multiplier' },
    STREAK_SAVE:  { cost: 30,  id: 'prestige_streak_save',    desc: '+1 streak protection per season' },
    TITLE:        { cost: 25,  id: 'prestige_title_10x',      desc: '"10x Developer" title badge' },
    CTO_CAPE:     { cost: 200, id: 'prestige_cto_cape',       desc: 'Rare CTO cape skin' },
  }
};
