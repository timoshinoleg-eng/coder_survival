import {
  applyEventModifiers,
  generateEventBonusQuest,
  getCurrentEvent,
  getEventRecoveryMultiplier,
  isEventActiveToday
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
  const baseQuests = Array.from({ length: 5 }, (_, index) => ({
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
  expect(isFullClearAvailable([...baseQuests.slice(0, 4), { id: 'q_4', completed: false }, eventQuest], false)).toBe(false);
});
