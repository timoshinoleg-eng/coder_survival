import { DEFAULTS } from './balance.js';

export const RANDOM_EVENTS_CONFIG = {
  frequencySeconds: { min: 60, max: 120 },
  targetWeightByType: {
    negative: 40,
    neutral: 45,
    positive: 15
  },
  events: {
    golden_commit: {
      weight: 10,
      type: 'positive',
      effect: { locPerSecMultiplier: 7, durationSeconds: 77 },
      uiText: 'Golden Commit! x7 LOC/s for 77s'
    },
    hot_streak: {
      weight: 5,
      type: 'positive',
      effect: { tapPowerMultiplier: 3, durationSeconds: 60 },
      uiText: 'Hot Streak! x3 tap power for 60s'
    },
    legacy_code: {
      weight: 12,
      type: 'negative',
      effect: { upgradeCostMultiplier: 2, refactorClicksRequired: 10 },
      uiText: 'Legacy Code detected! Upgrades 2x cost until refactored'
    },
    deploy_friday: {
      weight: 12,
      type: 'negative',
      effect: { locLossRisk: 0.25, badgeChance: 0.3 },
      uiText: 'Deploy Friday? Risk 25% LOC, chance for badge'
    },
    code_review_reject: {
      weight: 8,
      type: 'negative',
      effect: { depression: DEFAULTS.RANDOM_EVENTS.codeReviewRejectDepression }
    },
    production_alert: {
      weight: 8,
      type: 'negative',
      effect: { ...DEFAULTS.RANDOM_EVENTS.productionAlert }
    },
    coffee_break: { weight: 15, type: 'neutral', effect: {} },
    standup_meeting: { weight: 10, type: 'neutral', effect: {} },
    slack_notification: { weight: 10, type: 'neutral', effect: {} },
    zoom_call: { weight: 10, type: 'neutral', effect: {} }
  },
  ftueEventSuppression: DEFAULTS.RANDOM_EVENTS.FTUE_EVENT_SUPPRESSION,
  stateMachine: DEFAULTS.RANDOM_EVENTS.stateMachine
};
