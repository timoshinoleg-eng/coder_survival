import { Router } from 'express';
import { pool } from '../index.js';
import { STAGE2 } from '../config/balance.js';
import {
  applyQuestUpdates,
  ensureDailyQuestState,
  isFullClearAvailable,
  rollLootBox
} from '../utils/dailyQuests.js';
import {
  getWeekStart,
  getWeeklySprintState,
  determineEligibleTier,
  canClaimTier,
  getTierReward,
  getWeeklySprintNarrativeMeta,
  updateWeeklySprintState
} from '../utils/weeklySprint.js';
import { addPassXp, applyPassXpSourceMultiplier, getActivePass } from '../utils/pass.js';
import { applyRewardPenaltyToPayload, normalizeAntiCheatState } from '../utils/anticheat.js';
import { logDailyFarm } from '../utils/farmLog.js';
import { ensurePlayerLevel, addPlayerXp } from '../utils/vnext.js';
import { logPassXp } from '../utils/passXpLog.js';

const router = Router();
const { DAILY_QUEST, WEEKLY_SPRINT } = STAGE2;

function getTimezoneOffset(req, fallback = 180) {
  const raw =
    req.body?.timezoneOffset ??
    req.query?.timezoneOffset ??
    req.headers['x-timezone-offset'] ??
    req.telegramUser?.user?.time_zone_offset;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getTodayDate(timezoneOffset = 180, now = new Date()) {
  const local = new Date(now.getTime() + timezoneOffset * 60000);
  return local.toISOString().slice(0, 10);
}

async function ensureUserAndProgression(client, telegramUser, timezoneOffset = 180) {
  const userResult = await client.query(
    `INSERT INTO users (telegram_id, username, first_name, last_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_id) DO UPDATE SET
       username = COALESCE(EXCLUDED.username, users.username),
       first_name = COALESCE(EXCLUDED.first_name, users.first_name),
       last_name = COALESCE(EXCLUDED.last_name, users.last_name),
       last_active = NOW()
     RETURNING id`,
    [
      telegramUser.id,
      telegramUser.username || null,
      telegramUser.first_name || null,
      telegramUser.last_name || null
    ]
  );
  const userId = userResult.rows[0].id;

  await client.query(
    `INSERT INTO progression (user_id, timezone_offset)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET
       timezone_offset = COALESCE(progression.timezone_offset, EXCLUDED.timezone_offset)`,
    [userId, timezoneOffset]
  );

  await ensurePlayerLevel(client, userId);
  return userId;
}

// Delegates to the shared JSONB SSOT generator in utils/dailyQuests.js so that
// /api/quests and /api/state resolve identical quest identity and day boundaries.
async function getOrCreateQuestState(client, userId, today, lock = false) {
  return ensureDailyQuestState(client, userId, today, lock);
}

function mergeInventory(current, rewards) {
  const next = { ...(current || {}) };
  if (rewards.inventory) {
    for (const [key, value] of Object.entries(rewards.inventory)) {
      next[key] = Number(next[key] || 0) + Number(value || 0);
    }
  }
  for (const fragment of rewards.skinFragments || []) {
    const key = `fragment_${fragment}`;
    next[key] = Number(next[key] || 0) + 1;
  }
  if (rewards.skin) next[`skin_${rewards.skin}`] = 1;
  if (rewards.skinFragment) next[`fragment_${rewards.skinFragment}`] = Number(next[`fragment_${rewards.skinFragment}`] || 0) + 1;
  if (rewards.title) next[`title_${rewards.title}`] = 1;
  if (rewards.stars) next.stars = Number(next.stars || 0) + Number(rewards.stars || 0);
  return next;
}

function aggregateRewards(quests) {
  const rewards = {
    energy: 0,
    xp: 0,
    passXp: 0,
    stars: 0,
    commitsCurrent: 0,
    inventory: {},
    skinFragments: []
  };

  for (const quest of quests) {
    const reward = quest.reward || {};
    rewards.energy += Number(reward.energy || 0);
    rewards.xp += Number(reward.xp || 0);
    rewards.passXp += Number(reward.passXp || 0);
    rewards.stars += Number(reward.stars || 0);
    rewards.commitsCurrent += Number(reward.commitsCurrent || 0);
    if (reward.inventory) {
      for (const [key, value] of Object.entries(reward.inventory)) {
        rewards.inventory[key] = Number(rewards.inventory[key] || 0) + Number(value || 0);
      }
    }
    if (reward.skinFragment) rewards.skinFragments.push(reward.skinFragment);
  }

  return rewards;
}

async function applyStage2Rewards(client, userId, progression, rewards) {
  const antiCheatState = normalizeAntiCheatState(progression.anti_cheat_state || {});
  rewards = applyRewardPenaltyToPayload(rewards, antiCheatState.banScore);
  rewards.passXp = applyPassXpSourceMultiplier(rewards.passXp, 'quest_xp', new Date());
  const levelRow = await ensurePlayerLevel(client, userId);
  const maxEnergy = levelRow.resolved.maxEnergy;
  const inventory = mergeInventory(progression.inventory || {}, rewards);
  let passState = progression.pass_state || {};
  let passUpdate = null;

  if (Number(rewards.passXp || 0) > 0) {
    passUpdate = addPassXp(passState, Number(rewards.passXp || 0));
    passState = passUpdate.newState;
  }

  if (Number(rewards.xp || 0) > 0) {
    await addPlayerXp(client, userId, Number(rewards.xp || 0));
  }

  await client.query(
    `UPDATE progression
     SET energy = LEAST($2, energy + $3),
         commits_current = commits_current + $4,
         inventory = $5,
         pass_state = $6
     WHERE user_id = $1`,
    [
      userId,
      maxEnergy,
      Number(rewards.energy || 0),
      Number(rewards.commitsCurrent || 0),
      JSON.stringify(inventory),
      JSON.stringify(passState)
    ]
  );

  if (Number(rewards.commitsCurrent || 0) > 0) {
    await logDailyFarm(client, userId, Number(rewards.commitsCurrent || 0));
  }

  return { passState, passUpdate, inventory, appliedRewards: rewards };
}

router.get(['/', '/daily'], async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  let client;
  try {
    client = await pool.connect();
    const timezoneOffset = getTimezoneOffset(req);
    const today = getTodayDate(timezoneOffset);
    const userId = await ensureUserAndProgression(client, telegramUser, timezoneOffset);
    const state = await getOrCreateQuestState(client, userId, today, false);
    const fullClearAvailable = isFullClearAvailable(state.quests, state.fullClearClaimed);
    const rerollsRemaining = Math.max(0, 2 - Number(state.rerollsUsed || 0));

    return res.json({
      date: today,
      quests: state.quests,
      accountAgeDays: state.accountAgeDays ?? null,
      avgDailyFarm: state.avgDailyFarm ?? null,
      fullClearAvailable,
      fullClearClaimed: state.fullClearClaimed === true,
      rerollsRemaining,
      daily: {
        quests: state.quests,
        total: state.quests.length,
        completed: state.quests.filter((quest) => quest.completed).length,
        claimable: state.quests.filter((quest) => quest.completed && !quest.claimed).length,
        fullClearAvailable,
        fullClearClaimed: state.fullClearClaimed === true,
        rerollsRemaining,
      }
    });
  } catch (err) {
    console.error('Quests GET error:', err);
    return res.status(500).json({ error: 'Технический сбой' });
  } finally {
    if (client) client.release();
  }
});

router.post('/claim', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const timezoneOffset = getTimezoneOffset(req);
    const today = getTodayDate(timezoneOffset);
    const userId = await ensureUserAndProgression(client, telegramUser, timezoneOffset);
    const state = await getOrCreateQuestState(client, userId, today, true);

    const progressionResult = await client.query(
       `SELECT inventory, pass_state, anti_cheat_state
        FROM progression
        WHERE user_id = $1
        FOR UPDATE`,
      [userId]
    );
    const progression = progressionResult.rows[0] || {};
    const requestedQuestId = req.body?.questId ? String(req.body.questId) : null;
    const unclaimed = state.quests.filter((quest) => (
      quest.completed &&
      !quest.claimed &&
      (!requestedQuestId || String(quest.id) === requestedQuestId)
    ));

    if (unclaimed.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Нет наград для получения' });
    }

    const rewards = aggregateRewards(unclaimed);
    state.quests = state.quests.map((quest) => (
      unclaimed.some((claimedQuest) => claimedQuest.id === quest.id)
        ? { ...quest, claimed: true }
        : quest
    ));

    // Increment weekly sprint progress
    const weeklySprintIncs = {
      questsCompleted: unclaimed.length,
      commitsEarned: Number(rewards.commitsCurrent || 0)
    };
    await updateWeeklySprintState(client, userId, weeklySprintIncs);

    const rewardResult = await applyStage2Rewards(client, userId, progression, rewards);

    const activePass = await getActivePass(client);
    if (activePass && Number(rewards.passXp || 0) > 0) {
       await logPassXp(client, userId, activePass.id, 'quest', Number(rewardResult.appliedRewards.passXp || 0), { questIds: unclaimed.map(q => q.id) });
    }

    await client.query(
      `UPDATE progression
       SET daily_quests_state = $2,
           pass_state = $3
       WHERE user_id = $1`,
      [userId, JSON.stringify(state), JSON.stringify(rewardResult.passState)]
    );

    await client.query('COMMIT');

    const fullClearAvailable = isFullClearAvailable(state.quests, state.fullClearClaimed);
    return res.json({
      claimedCount: unclaimed.length,
      rewards: rewardResult.appliedRewards,
      reward: rewardResult.appliedRewards,
      accountAgeDays: state.accountAgeDays ?? null,
      avgDailyFarm: state.avgDailyFarm ?? null,
      passUpdate: rewardResult.passUpdate,
      quests: state.quests,
      fullClearAvailable,
      daily: {
        quests: state.quests,
        total: state.quests.length,
        completed: state.quests.filter((quest) => quest.completed).length,
        claimable: state.quests.filter((quest) => quest.completed && !quest.claimed).length,
        fullClearAvailable,
        fullClearClaimed: state.fullClearClaimed === true
      }
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('Quests claim error:', err);
    return res.status(500).json({ error: 'Технический сбой' });
  } finally {
    if (client) client.release();
  }
});

router.post('/full-clear', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const timezoneOffset = getTimezoneOffset(req);
    const today = getTodayDate(timezoneOffset);
    const userId = await ensureUserAndProgression(client, telegramUser, timezoneOffset);
    const state = await getOrCreateQuestState(client, userId, today, true);

    if (!isFullClearAvailable(state.quests, state.fullClearClaimed)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Бонус дня недоступен' });
    }

    const progressionResult = await client.query(
       `SELECT inventory, pass_state, anti_cheat_state
        FROM progression
        WHERE user_id = $1
        FOR UPDATE`,
      [userId]
    );
    const progression = progressionResult.rows[0] || {};
    const lootBox = rollLootBox(DAILY_QUEST.FULL_CLEAR.LOOT_BOX.drops);
     const rewards = {
       stars: Number(DAILY_QUEST.FULL_CLEAR.reward.stars || 0) + Number(lootBox.reward.stars || 0),
       skinFragment: lootBox.reward.skinFragment || null,
       lootBox
     };

    state.fullClearClaimed = true;
    const rewardResult = await applyStage2Rewards(client, userId, progression, rewards);

    await client.query(
      `UPDATE progression
       SET daily_quests_state = $2,
           pass_state = $3
       WHERE user_id = $1`,
      [userId, JSON.stringify(state), JSON.stringify(rewardResult.passState)]
    );

    await client.query('COMMIT');
    console.log('full_clear_claimed', { userId, date: today, lootBox: lootBox.id });

     return res.json({
       rewards: rewardResult.appliedRewards,
       lootBox,
       accountAgeDays: state.accountAgeDays ?? null,
       avgDailyFarm: state.avgDailyFarm ?? null,
       passUpdate: rewardResult.passUpdate,
       fullClearClaimed: true
     });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('Full clear error:', err);
    return res.status(500).json({ error: 'Технический сбой' });
  } finally {
    if (client) client.release();
  }
});

// Weekly sprint helpers
async function getOrCreateWeeklySprintState(client, userId, timezoneOffset = 180) {
  const result = await client.query(
    `SELECT weekly_sprint_quest_state
     FROM progression
     WHERE user_id = $1`,
    [userId]
  );
  const weekStart = getWeekStart(timezoneOffset);
  const state = getWeeklySprintState(result.rows[0]?.weekly_sprint_quest_state, weekStart);
  if (state.weekStart !== (result.rows[0]?.weekly_sprint_quest_state?.weekStart)) {
    await client.query(
      `UPDATE progression SET weekly_sprint_quest_state = $2 WHERE user_id = $1`,
      [userId, JSON.stringify(state)]
    );
  }
  return state;
}

router.get('/weekly', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  let client;
  try {
    client = await pool.connect();
    const timezoneOffset = getTimezoneOffset(req);
    const userId = await ensureUserAndProgression(client, telegramUser, timezoneOffset);
    const state = await getOrCreateWeeklySprintState(client, userId, timezoneOffset);
    const eligibleTier = determineEligibleTier(state);

    return res.json({
      weekStart: state.weekStart,
      progress: {
        questsCompleted: state.questsCompleted,
        commitsEarned: state.commitsEarned,
        minigamesCompleted: state.minigamesCompleted,
        memeShares: state.memeShares
      },
      narrative: getWeeklySprintNarrativeMeta(state),
      eligibleTier,
      tierClaimed: state.tierClaimed,
      tiers: WEEKLY_SPRINT.TIERS
    });
  } catch (err) {
    console.error('Weekly sprint GET error:', err);
    return res.status(500).json({ error: 'Технический сбой' });
  } finally {
    if (client) client.release();
  }
});

router.post('/weekly/claim', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  const requestedTier = req.body?.tier;
  if (!requestedTier || !WEEKLY_SPRINT.TIERS[requestedTier]) {
    return res.status(400).json({ error: 'Некорректный тир' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const timezoneOffset = getTimezoneOffset(req);
    const userId = await ensureUserAndProgression(client, telegramUser, timezoneOffset);
    const state = await getOrCreateWeeklySprintState(client, userId, timezoneOffset);

    if (!canClaimTier(state, requestedTier)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Тир недоступен или уже получен' });
    }

    const progressionResult = await client.query(
      `SELECT inventory, pass_state
       FROM progression
       WHERE user_id = $1
       FOR UPDATE`,
      [userId]
    );
    const progression = progressionResult.rows[0] || {};
    const rewards = getTierReward(requestedTier);

    state.tierClaimed = requestedTier;
    const rewardResult = await applyStage2Rewards(client, userId, progression, rewards);

    await client.query(
      `UPDATE progression
       SET weekly_sprint_quest_state = $2,
           pass_state = $3
       WHERE user_id = $1`,
      [userId, JSON.stringify(state), JSON.stringify(rewardResult.passState)]
    );

    await client.query('COMMIT');

    return res.json({
      claimedTier: requestedTier,
      rewards,
      passUpdate: rewardResult.passUpdate,
      sprintState: state,
      narrative: getWeeklySprintNarrativeMeta(state)
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('Weekly sprint claim error:', err);
    return res.status(500).json({ error: 'Технический сбой' });
  } finally {
    if (client) client.release();
  }
});

// POST /api/quests/reroll — reroll the daily bonus quest
// Max 2 rerolls/day: 1st free, 2nd costs 50 stars
router.post('/reroll', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const timezoneOffset = getTimezoneOffset(req);
    const today = getTodayDate(timezoneOffset);
    const userId = await ensureUserAndProgression(client, telegramUser, timezoneOffset);
    const state = await getOrCreateQuestState(client, userId, today, true);

    const rerollsUsed = Number(state.rerollsUsed || 0);
    if (rerollsUsed >= 2) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Все замены на сегодня использованы', rerollsRemaining: 0 });
    }

    const isPaid = rerollsUsed >= 1;
    if (isPaid) {
      const progressionResult = await client.query(
        `SELECT inventory FROM progression WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );
      const inventory = progressionResult.rows[0]?.inventory || {};
      const starsAvailable = Number(inventory.stars || 0);
      if (starsAvailable < 50) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Недостаточно звёзд', rerollsRemaining: 2 - rerollsUsed });
      }
      await client.query(
        `UPDATE progression
         SET inventory = jsonb_set(inventory, '{stars}', (COALESCE(inventory->>'stars','0')::int - 50)::text::jsonb)
         WHERE user_id = $1`,
        [userId]
      );
    }

    const currentBonusQuest = state.quests.find((q) => q.isBonus === true);
    const currentBonusId = currentBonusQuest?.id;
    const pool = DAILY_QUEST.POOLS.BONUS;
    const filtered = pool.filter((q) => q.id !== currentBonusId);
    const newTemplate = filtered[Math.floor(Math.random() * filtered.length)] || pool[0];

    const avgDailyFarm = state.avgDailyFarm || 100;
    const rawReward = avgDailyFarm * 0.5;
    const bonusQuestReward = Math.floor(Number.isFinite(rawReward) ? rawReward : 250);

    const newBonusQuest = {
      id: newTemplate.id,
      type: newTemplate.type,
      target: newTemplate.target,
      reward: { commitsCurrent: bonusQuestReward },
      isBonus: true,
      progress: 0,
      completed: false,
      claimed: false,
      expiresAt: null,
    };

    state.quests = state.quests.map((q) => (q.isBonus === true ? newBonusQuest : q));
    state.rerollsUsed = rerollsUsed + 1;

    await client.query(
      `UPDATE progression SET daily_quests_state = $2 WHERE user_id = $1`,
      [userId, JSON.stringify(state)]
    );

    await client.query(
      `INSERT INTO audit_logs (user_id, action, context)
       VALUES ($1, 'quest_reroll', $2::jsonb)`,
      [userId, JSON.stringify({
        oldQuestId: currentBonusId,
        newQuestId: newBonusQuest.id,
        paid: isPaid,
        rerollsUsed: state.rerollsUsed,
      })]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      newQuest: newBonusQuest,
      rerollsRemaining: Math.max(0, 2 - state.rerollsUsed),
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('Quest reroll error:', err);
    return res.status(500).json({ error: 'Технический сбой' });
  } finally {
    if (client) client.release();
  }
});

export { applyQuestUpdates };
export default router;
