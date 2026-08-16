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
      weight: 7,
      type: 'negative',
      effect: { upgradeCostMultiplier: 2, refactorClicksRequired: 10 },
      uiText: 'Legacy Code detected! Upgrades 2x cost until refactored'
    },
    deploy_friday: {
      weight: 7,
      type: 'negative',
      effect: { cancelClicksRequired: 3, locLossRisk: 0.25 },
      uiText: 'Deploy Friday? Cancel in 3 clicks or risk LOC loss'
    },
    bug_production: {
      weight: 6,
      type: 'negative',
      effect: { hotfixClicksRequired: 5, energyDrainPercent: 0.08, durationSeconds: 180 },
      uiText: 'Bug in Production! Hotfix in 5 clicks'
    },
    code_review: {
      weight: 8,
      type: 'neutral',
      effect: { commits: 10, depression: 2 },
      uiText: 'Code Review waiting: accept or reject'
    },
    slack_huddle: {
      weight: 8,
      type: 'neutral',
      effect: { commits: 12, depression: 2 },
      uiText: 'Slack Huddle: join for context or decline for focus'
    },
    scope_creep: {
      weight: 7,
      type: 'neutral',
      effect: { commits: 8, depression: 3 },
      uiText: 'Scope Creep: one tiny request has entered the sprint through the ceiling'
    },
    slack_thread_storm: {
      weight: 7,
      type: 'neutral',
      effect: { commits: 4, depression: 1 },
      uiText: 'Slack Thread Storm: everyone is typing and nobody owns the incident'
    },
    coffee_stain: {
      weight: 8,
      type: 'neutral',
      effect: { wipeClicksRequired: 3, energy: 8, depressionRelief: 4 },
      uiText: 'Coffee Stain! Wipe it clean'
    },
    merge_conflict: {
      weight: 3,
      type: 'negative',
      effect: { commits: 5, depression: 3 },
      uiText: 'Merge Conflict: choose a side before both branches become archaeology'
    },
    canary_rollback: {
      weight: 5,
      type: 'negative',
      effect: { commits: -2, depression: 1 },
      uiText: 'Canary Rollback: the canary is singing in 500s'
    },
    production_500_spike: {
      weight: 5,
      type: 'negative',
      effect: { commits: 4, depression: 2 },
      uiText: 'HTTP 500 Spike: feature flag or refresh the dashboard?'
    },
    ci_pipeline_red: {
      weight: 6,
      type: 'negative',
      effect: { commits: -1, depression: 1 },
      uiText: 'CI Pipeline Red: tests failed in a file nobody changed'
    },
    friday_release_outage: {
      weight: 6,
      type: 'negative',
      effect: { commits: -3, depression: 2 },
      uiText: 'Friday Release Outage: production is down at 18:57 and SRE asks who deployed last'
    },
    stack_overflow_down: {
      weight: 2,
      type: 'negative',
      effect: { disableHelpSeconds: 30, depression: 3 },
      uiText: 'Stack Overflow is down for 30s'
    }
  },
  ftueEventSuppression: DEFAULTS.RANDOM_EVENTS.FTUE_EVENT_SUPPRESSION,
  stateMachine: DEFAULTS.RANDOM_EVENTS.stateMachine
};
