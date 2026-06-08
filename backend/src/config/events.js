import { DEFAULTS } from './balance.js';

export const RANDOM_EVENTS_CONFIG = {
  frequencySeconds: { min: 30, max: 90 },
  targetWeightByType: {
    negative: 47,
    neutral: 38,
    positive: 15
  },
  events: {
    golden_commit: {
      weight: 10,
      type: 'positive',
      effect: { locPerSecMultiplier: 7, durationSeconds: 77 },
      uiText: 'Golden Commit! x7 LOC/s for 77s'
    },
    open_source_contribution: {
      weight: 5,
      type: 'positive',
      effect: { skin: 'open_source_hero', commits: 20 },
      uiText: 'Open Source PR accepted! Exclusive skin earned'
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
      effect: { cancelClicksRequired: 3, locLossRisk: 0.25 },
      uiText: 'Deploy Friday? Cancel in 3 clicks or risk LOC loss'
    },
    bug_production: {
      weight: 15,
      type: 'negative',
      effect: { hotfixClicksRequired: 5, energyDrainPercent: 0.08, durationSeconds: 180 },
      uiText: 'Bug in Production! Hotfix in 5 clicks'
    },
    code_review: {
      weight: 18,
      type: 'neutral',
      effect: { commits: 10, depression: 2 },
      uiText: 'Code Review waiting: accept or reject'
    },
    coffee_stain: {
      weight: 20,
      type: 'neutral',
      effect: { wipeClicksRequired: 3, energy: 8, depressionRelief: 4 },
      uiText: 'Coffee Stain! Wipe it clean'
    },
    stack_overflow_down: {
      weight: 8,
      type: 'negative',
      effect: { disableHelpSeconds: 30, depression: 3 },
      uiText: 'Stack Overflow is down for 30s'
    }
  },
  ftueEventSuppression: DEFAULTS.RANDOM_EVENTS.FTUE_EVENT_SUPPRESSION,
  stateMachine: DEFAULTS.RANDOM_EVENTS.stateMachine
};
