import crypto from 'crypto';
import { STAGE2 } from '../config/balance.js';

const { DAILY_QUEST } = STAGE2;

export function hashSeed(userId, dateString) {
  const hex = crypto.createHash('md5').update(`${userId}:${dateString}`).digest('hex');
  return parseInt(hex.slice(0, 8), 16);
}

function cloneQuest(quest) {
  return {
    ...quest,
    reward: { ...(quest.reward || {}) }
  };
}

export function selectFromPool(pool, hashValue, offset) {
  const idx = (hashValue >>> offset) % pool.length;
  return pool[idx];
}

export function generateDailyQuests(userId, dateString, rankTier = 1) {
  const seed = hashSeed(userId, dateString);

  const base = DAILY_QUEST.BASE_QUESTS.map((quest) => ({
    ...cloneQuest(quest),
    target: quest.target + rankTier * 5,
    progress: 0,
    completed: false,
    claimed: false,
    expiresAt: null
  }));

  const morning = {
    ...cloneQuest(selectFromPool(DAILY_QUEST.POOLS.MORNING, seed, 0)),
    progress: 0,
    completed: false,
    claimed: false,
    windowStart: '09:00',
    windowEnd: '12:00'
  };

  const afternoon = {
    ...cloneQuest(selectFromPool(DAILY_QUEST.POOLS.AFTERNOON, seed, 6)),
    progress: 0,
    completed: false,
    claimed: false,
    windowStart: '12:00',
    windowEnd: '18:00'
  };

  const evening = {
    ...cloneQuest(selectFromPool(DAILY_QUEST.POOLS.EVENING, seed, 4)),
    progress: 0,
    completed: false,
    claimed: false,
    windowStart: '18:00',
    windowEnd: '23:59'
  };

  return [...base, morning, afternoon, evening];
}

export function checkQuestProgress(quests, eventType, eventValue) {
  return quests.map((quest) => {
    if (quest.completed || quest.type !== eventType) {
      return {
        questId: quest.id,
        wasCompleted: false,
        newProgress: Number(quest.progress || 0)
      };
    }

    let newProgress = Number(quest.progress || 0);

    switch (eventType) {
      case 'tap_count':
        newProgress += typeof eventValue === 'number' ? eventValue : 1;
        break;
      case 'login':
        newProgress = 1;
        break;
      case 'crit_count':
        if (eventValue?.isCrit) newProgress += 1;
        break;
      case 'commit_total':
        if (typeof eventValue === 'number') newProgress = eventValue;
        break;
      case 'social_visit':
      case 'social_share':
        newProgress += typeof eventValue === 'number' ? eventValue : 1;
        break;
      default:
        break;
    }

    newProgress = Math.min(newProgress, Number(quest.target || 0));
    const wasCompleted = newProgress >= Number(quest.target || 0);

    return { questId: quest.id, wasCompleted, newProgress };
  });
}

export function applyQuestUpdates(quests, updates) {
  let changed = false;
  const byId = new Map(updates.map((update) => [update.questId, update]));
  const next = quests.map((quest) => {
    const update = byId.get(quest.id);
    if (!update) return quest;

    const progressChanged = Number(quest.progress || 0) !== update.newProgress;
    const completionChanged = !quest.completed && update.wasCompleted;
    if (!progressChanged && !completionChanged) return quest;

    changed = true;
    return {
      ...quest,
      progress: update.newProgress,
      completed: quest.completed || update.wasCompleted
    };
  });

  return { quests: next, changed };
}

export function isFullClearAvailable(quests, fullClearClaimed) {
  if (!Array.isArray(quests) || fullClearClaimed) return false;
  const baseQuests = quests.filter((quest) => quest.isEvent !== true);
  return baseQuests.length === 5 && baseQuests.every((quest) => quest.completed);
}

export function rollLootBox(drops, rng = Math.random) {
  const totalWeight = drops.reduce((sum, drop) => sum + drop.weight, 0);
  let roll = rng() * totalWeight;
  for (const drop of drops) {
    roll -= drop.weight;
    if (roll <= 0) return drop;
  }
  return drops[drops.length - 1];
}
