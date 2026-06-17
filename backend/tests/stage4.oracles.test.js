import {
  applyEventModifiers,
  generateEventBonusQuest,
  getCurrentEvent,
  getEventRecoveryMultiplier,
  getFtueEventSuppression,
  getRandomEventBalanceGaps,
  getRandomEventDefinitions,
  getRandomEventWeightSummary,
  isEventActiveToday,
  pickRandomEvent
} from '../src/utils/events.js';
import { isFullClearAvailable } from '../src/utils/dailyQuests.js';
import { STAGE4 } from '../src/config/balance.js';

test('Oracle 1: event rotation returns exactly one event per week index', () => {
  expect(STAGE4.EVENTS.MAX_CONCURRENT).toBe(1);
  expect(getCurrentEvent(0).id).toBe('coffee_week');
  expect(getCurrentEvent(1).id).toBe('weekend_hackathon');
  expect(getCurrentEvent(4).id).toBe('coffee_week');
});

test('Oracle 2: activeDays gate weekend and friday events deterministically', () => {
  const weekend = getCurrentEvent(1);
  const crunch = getCurrentEvent(3);
  expect(isEventActiveToday(weekend, new Date('2026-05-09T12:00:00Z'))).toBe(true);
  expect(isEventActiveToday(weekend, new Date('2026-05-11T12:00:00Z'))).toBe(false);
  expect(isEventActiveToday(crunch, new Date('2026-05-08T12:00:00Z'))).toBe(true);
});

test('Oracle 3: event modifiers are pure functions and do not replace base systems', () => {
  expect(applyEventModifiers(60, { energyRecoveryMult: 2 }, 'energyRecovery')).toBe(120);
  expect(applyEventModifiers(5, { commitMult: 2 }, 'commits')).toBe(10);
  expect(applyEventModifiers(0.05, { critChanceAdd: 0.10 }, 'critChance')).toBeCloseTo(0.15);
  expect(applyEventModifiers(40, null, 'commits')).toBe(40);
});

test('Oracle 4: event quest is generated as a bonus sixth-slot quest', () => {
  const quest = generateEventBonusQuest(getCurrentEvent(0));
  expect(quest.id).toBe('q_event_bonus');
  expect(quest.isEvent).toBe(true);
  expect(quest.completed).toBe(false);
  expect(quest.claimed).toBe(false);
});

test('Oracle 5: expired event state does not accelerate energy recovery', () => {
  const active = {
    eventId: 'coffee_week',
    expiresAt: '2026-05-11T00:00:00.000Z',
    modifiersApplied: { energyRecoveryMult: 2 }
  };
  const expired = { ...active, expiresAt: '2026-05-01T00:00:00.000Z' };
  expect(getEventRecoveryMultiplier(active, new Date('2026-05-10T00:00:00Z'))).toBe(2);
  expect(getEventRecoveryMultiplier(expired, new Date('2026-05-10T00:00:00Z'))).toBe(1);
});

test('Oracle 6: invalid energy recovery multipliers are ignored', () => {
  const base = {
    eventId: 'coffee_week',
    expiresAt: '2026-05-11T00:00:00.000Z'
  };
  expect(getEventRecoveryMultiplier({ ...base, modifiersApplied: { energyRecoveryMult: 0 } }, new Date('2026-05-10T00:00:00Z'))).toBe(1);
  expect(getEventRecoveryMultiplier({ ...base, modifiersApplied: { energyRecoveryMult: 999 } }, new Date('2026-05-10T00:00:00Z'))).toBe(1);
  expect(getEventRecoveryMultiplier({ ...base, modifiersApplied: { energyRecoveryMult: 5 } }, new Date('2026-05-10T00:00:00Z'))).toBe(5);
});

test('Oracle 7: full clear ignores optional event quest', () => {
  const baseQuests = Array.from({ length: 4 }, (_, index) => ({
    id: `q_${index}`,
    completed: true,
    claimed: false
  }));
  const eventQuest = {
    id: 'q_event_bonus',
    isEvent: true,
    completed: false,
    claimed: false
  };
  expect(isFullClearAvailable([...baseQuests, eventQuest], false)).toBe(true);
  expect(isFullClearAvailable([...baseQuests.slice(0, 3), { id: 'q_3', completed: false }, eventQuest], false)).toBe(false);
});

test('Oracle 8: random event config preserves explicit prompt weights', () => {
  const events = getRandomEventDefinitions();
  const golden = events.find((event) => event.id === 'golden_commit');
  const legacy = events.find((event) => event.id === 'legacy_code');
  const deploy = events.find((event) => event.id === 'deploy_friday');
  expect(golden.effect.locPerSecMultiplier).toBe(7);
  expect(golden.effect.durationSeconds).toBe(77);
  expect(golden.weight).toBe(10);
  expect(legacy.effect.upgradeCostMultiplier).toBe(2);
  expect(legacy.effect.refactorClicksRequired).toBe(10);
  expect(deploy.effect.locLossRisk).toBe(0.25);
});

test('Oracle 9: random event balance gaps expose TBD items instead of inventing values', () => {
  expect(getRandomEventWeightSummary()).toEqual({ negative: 47, neutral: 38, positive: 15 });
  expect(getRandomEventBalanceGaps()).toEqual([]);
});

test('Oracle 10: random event picker uses resolved BALANCE v2 pool', () => {
  expect(getRandomEventWeightSummary({ includeBalanceBlocked: false })).toEqual({ negative: 47, neutral: 38, positive: 15 });
  expect(pickRandomEvent(0)?.id).toBe('golden_commit');
  expect(pickRandomEvent(0.999)?.id).toBe('stack_overflow_down');
});

test('Oracle 11: FTUE event suppression blocks or dampens negative events', () => {
  expect(getFtueEventSuppression(3).rule).toBe('no_negative_events');
  expect(getFtueEventSuppression(10).rule).toBe('negative_events_at_50_percent_weight');
  expect(getFtueEventSuppression(16).rule).toBe('full_event_pool');
  expect(pickRandomEvent(0.2, { accountAgeMinutes: 3 }).type).not.toBe('negative');
});
