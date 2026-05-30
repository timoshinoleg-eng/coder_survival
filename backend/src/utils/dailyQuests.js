import crypto from 'crypto';
import { STAGE2, DEFAULTS } from '../config/balance.js';
import { getRollingAvgDailyFarm } from './farmLog.js';

const { DAILY_QUEST } = STAGE2;

export const DAILY_QUESTS_VERSION = 'v1.0';

const FALLBACK = DEFAULTS.DAILY_QUESTS.avgDailyFarm.fallback;
const REWARD_SPLIT = DEFAULTS.DAILY_QUESTS.rewardSplit;
const FRONT_LOADING = DEFAULTS.DAILY_QUESTS.frontLoading;

export function getFallbackAvgDailyFarm(accountAgeDays = 4) {
  if (accountAgeDays <= 1) return FALLBACK.day1;
  if (accountAgeDays === 2) return FALLBACK.day2;
  if (accountAgeDays === 3) return FALLBACK.day3;
  return FALLBACK.day3;
}

function getMainQuestReward(avgDailyFarm, accountAgeDays) {
  const multiplier = accountAgeDays <= 3 ? FRONT_LOADING.multiplier : 1.0;
  const raw = avgDailyFarm * REWARD_SPLIT.mainQuest1 * multiplier;
  if (!Number.isFinite(raw)) {
    console.warn('[DailyQuests] Invalid main quest reward calculation:', { avgDailyFarm, accountAgeDays, raw });
  }
  return Math.floor(raw);
}

function getBonusQuestReward(avgDailyFarm) {
  const raw = avgDailyFarm * REWARD_SPLIT.bonusQuest;
  if (!Number.isFinite(raw)) {
    console.warn('[DailyQuests] Invalid bonus quest reward calculation:', { avgDailyFarm, raw });
  }
  return Math.floor(raw);
}

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

// Local calendar date (YYYY-MM-DD) for a given timezone offset in minutes.
// Shared by /api/state and /api/quests so both resolve the same quest day.
export function getQuestDateString(timezoneOffset = 180, now = new Date()) {
  const local = new Date(now.getTime() + timezoneOffset * 60000);
  return local.toISOString().slice(0, 10);
}

export function generateDailyQuests(userId, dateString, rankTier = 1, accountAgeDays = 4, avgDailyFarmOverride = null) {
  const seed = hashSeed(userId, dateString);
  const avgDailyFarm = Number.isFinite(Number(avgDailyFarmOverride)) && Number(avgDailyFarmOverride) > 0
    ? Number(avgDailyFarmOverride)
    : getFallbackAvgDailyFarm(accountAgeDays);
  const mainQuestReward = getMainQuestReward(avgDailyFarm, accountAgeDays);
  const bonusQuestReward = getBonusQuestReward(avgDailyFarm);

  const base = [
    {
      id: 'q_login',
      type: 'login',
      target: 1,
      reward: { commitsCurrent: mainQuestReward },
    },
    {
      id: 'q_tap300',
      type: 'tap_count',
      target: DAILY_QUEST.TRIGGERS.tapCount,
      reward: { commitsCurrent: mainQuestReward },
    },
    {
      id: 'q_earn10000',
      type: 'commit_total',
      target: DAILY_QUEST.TRIGGERS.earnLoc,
      reward: { commitsCurrent: mainQuestReward },
    }
  ].map((quest) => ({
    ...cloneQuest(quest),
    progress: 0,
    completed: false,
    claimed: false,
    expiresAt: null
  }));

  const bonusTemplate = selectFromPool(DAILY_QUEST.POOLS.BONUS, seed, 0);
  const bonus = {
    ...cloneQuest(bonusTemplate),
    isBonus: true,
    reward: { ...(bonusTemplate.reward || {}), commitsCurrent: bonusQuestReward },
    progress: 0,
    completed: false,
    claimed: false,
    expiresAt: null
  };

  return [...base, bonus];
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
      case 'watch_ad':
      case 'buy_generator':
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

export async function updateDailyQuestStateForEvent(client, userId, eventType, eventValue = 1) {
  const result = await client.query(
    `SELECT daily_quests_state FROM progression WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );
  const state = result.rows[0]?.daily_quests_state || {};
  if (!Array.isArray(state.quests) || state.quests.length === 0) return null;
  const updates = checkQuestProgress(state.quests, eventType, eventValue);
  const applied = applyQuestUpdates(state.quests, updates);
  if (!applied.changed) return { changed: false, state };
  const nextState = { ...state, quests: applied.quests };
  await client.query(
    `UPDATE progression SET daily_quests_state = $2 WHERE user_id = $1`,
    [userId, JSON.stringify(nextState)]
  );
  return { changed: true, state: nextState };
}

export function isFullClearAvailable(quests, fullClearClaimed) {
  if (!Array.isArray(quests) || fullClearClaimed) return false;
  const baseQuests = quests.filter((quest) => quest.isEvent !== true);
  return baseQuests.length === 4 && baseQuests.every((quest) => quest.completed);
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

// JSONB SSOT helpers (progression.daily_quests_state)
//
// progression.daily_quests_state is the single source of truth for daily quest
// status across every player-facing endpoint (/api/state, /api/quests,
// /api/quests/daily, /api/tap). The SQL `daily_quests` table is an analytics
// mirror only - never read it for player-facing quest status.

function buildInitialQuestState(userId, today, rankTier, accountAgeDays, avgDailyFarm) {
  return {
    lastDate: today,
    accountAgeDays,
    avgDailyFarm,
    quests: generateDailyQuests(String(userId), today, rankTier, accountAgeDays, avgDailyFarm),
    fullClearClaimed: false
  };
}

/**
 * Resolve (and lazily (re)generate) the JSONB daily quest state for `today`.
 * This is the ONE generation path shared by /api/state and /api/quests so the
 * two endpoints can never diverge on quest identity or day boundaries.
 *
 * @param {pg.Client} client
 * @param {number} userId
 * @param {string} today YYYY-MM-DD in the user's local timezone
 * @param {boolean} lock acquire FOR UPDATE on the progression row
 * @returns {Promise<object>} daily_quests_state
 */
export async function ensureDailyQuestState(client, userId, today, lock = false) {
  const result = await client.query(
    `SELECT daily_quests_state, tier, created_at
     FROM progression
     WHERE user_id = $1
     ${lock ? 'FOR UPDATE' : ''}`,
    [userId]
  );
  const row = result.rows[0];
  const rankTier = Number(row?.tier || 1);
  const createdAt = row?.created_at ? new Date(row.created_at) : null;
  const accountAgeDays = createdAt && !Number.isNaN(createdAt.getTime())
    ? Math.max(1, Math.floor((Date.now() - createdAt.getTime()) / 86400000) + 1)
    : 4;
  let state = row?.daily_quests_state || {};

  if (state.lastDate !== today || !Array.isArray(state.quests) || state.quests.length !== 4) {
    const avgDailyFarm = await getRollingAvgDailyFarm(client, userId);
    state = buildInitialQuestState(userId, today, rankTier, accountAgeDays, avgDailyFarm > 0 ? avgDailyFarm : null);
    await client.query(
      `UPDATE progression
       SET daily_quests_state = $2
       WHERE user_id = $1`,
      [userId, JSON.stringify(state)]
    );
  }

  return state;
}

/**
 * Idempotently mark the login quest complete inside a quest-state object.
 * Pure: returns { state, changed } without touching the DB. Never resets
 * `claimed`, so re-running after a claim cannot trigger a double reward.
 */
export function markLoginCompleteInQuestState(state) {
  if (!state || !Array.isArray(state.quests)) return { state, changed: false };
  const updates = checkQuestProgress(state.quests, 'login', 1);
  const applied = applyQuestUpdates(state.quests, updates);
  if (!applied.changed) return { state, changed: false };
  return { state: { ...state, quests: applied.quests }, changed: true };
}

/**
 * Race-safe login completion against the JSONB SSOT.
 *
 * 1. ensureDailyQuestState lazily (re)generates today's quests.
 * 2. A single atomic UPDATE flips ONLY the login quest's completed/progress in
 *    place. Because the read-modify-write happens inside one SQL statement it
 *    cannot lose a concurrent /api/quests/daily claim's write, and it never
 *    touches `claimed`, so it can never cause a double reward. This is why we
 *    avoid a JS read-modify-write here: /api/state runs in autocommit, so a
 *    FOR UPDATE lock would not survive across statements.
 *
 * @returns {Promise<object>} the up-to-date daily_quests_state
 */
export async function markLoginQuestCompleteInState(client, userId, today) {
  await ensureDailyQuestState(client, userId, today, false);
  const result = await client.query(
    `UPDATE progression
     SET daily_quests_state = jsonb_set(
       daily_quests_state,
       '{quests}',
       (
         SELECT jsonb_agg(
           CASE
             WHEN quest->>'id' = 'q_login' OR quest->>'type' = 'login'
               THEN quest || jsonb_build_object(
                 'completed', true,
                 'progress', COALESCE((quest->>'target')::numeric, 1)
               )
             ELSE quest
           END
         )
         FROM jsonb_array_elements(daily_quests_state->'quests') AS quest
       )
     )
     WHERE user_id = $1
       AND daily_quests_state->>'lastDate' = $2
       AND jsonb_typeof(daily_quests_state->'quests') = 'array'
     RETURNING daily_quests_state`,
    [userId, today]
  );
  return result.rows[0]?.daily_quests_state || null;
}
