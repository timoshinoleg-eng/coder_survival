import { DAILY_QUEST_ALL_CLAIMED_BONUS, DAILY_QUEST_DEFS } from '../config/balance.js';
import { applyReward } from './rewards.js';

const RANK_ORDER = ['Junior', 'Middle', 'Senior', 'Lead', 'CTO'];

// Practical v1 thresholds: 10 levels per rank for Junior–Lead, CTO capped at 10
const XP_THRESHOLDS = {
  1: [0, 20, 45, 75, 110, 150, 195, 245, 300, 360],
  2: [400, 430, 465, 505, 550, 600, 655, 715, 780, 850],
  3: [900, 940, 985, 1035, 1090, 1150, 1215, 1285, 1360, 1440],
  4: [1500, 1550, 1605, 1665, 1730, 1800, 1875, 1955, 2040, 2130],
  5: [2200, 2260, 2330, 2410, 2500, 2600, 2710, 2830, 2960, 3100]
};

const RANK_META = {
  1: { name: 'Junior', commitsPerTap: 1, maxEnergy: 100 },
  2: { name: 'Middle', commitsPerTap: 2, maxEnergy: 120 },
  3: { name: 'Senior', commitsPerTap: 3, maxEnergy: 150 },
  4: { name: 'Lead', commitsPerTap: 5, maxEnergy: 180 },
  5: { name: 'CTO', commitsPerTap: 8, maxEnergy: 220 }
};

const BASE_XP = 1;

export function getRankMeta(rank) {
  return RANK_META[rank] || RANK_META[1];
}

export function getRankXpBounds(rank) {
  const thresholds = XP_THRESHOLDS[rank];
  if (!thresholds) return null;
  const nextThresholds = XP_THRESHOLDS[rank + 1];
  return {
    min: thresholds[0],
    max: nextThresholds ? nextThresholds[0] : null
  };
}

export function resolveLevelState(xpTotal) {
  let resolvedRank = 1;
  let resolvedLevel = 1;

  for (const rank of [1, 2, 3, 4, 5]) {
    const thresholds = XP_THRESHOLDS[rank];
    for (let index = thresholds.length - 1; index >= 0; index -= 1) {
      if (xpTotal >= thresholds[index]) {
        resolvedRank = rank;
        resolvedLevel = index + 1;
        break;
      }
    }
  }

  const thresholds = XP_THRESHOLDS[resolvedRank];
  const currentIndex = resolvedLevel - 1;
  const currentThreshold = thresholds[currentIndex];
  const nextThreshold = thresholds[currentIndex + 1] || null;

  return {
    xpTotal,
    rank: resolvedRank,
    rankName: RANK_ORDER[resolvedRank - 1] || RANK_ORDER[0],
    levelInRank: resolvedLevel,
    currentThreshold,
    nextThreshold,
    progressInLevel: xpTotal - currentThreshold,
    requiredForNextLevel: nextThreshold ? nextThreshold - currentThreshold : null,
    isMaxDefinedLevel: nextThreshold === null,
    ...getRankMeta(resolvedRank)
  };
}

export async function ensurePlayerLevel(client, userId) {
  const result = await client.query(
    `INSERT INTO player_levels (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [userId]
  );

  return withResolvedLevel(result.rows[0]);
}

function withResolvedLevel(row) {
  const xpTotal = Number(row.xp_total ?? 0);
  return {
    ...row,
    xp_total: xpTotal,
    resolved: resolveLevelState(xpTotal)
  };
}

export function computeTapXp(levelInRank, boostMult = 1) {
  const mult = 1 + 0.1 * (levelInRank - 1);
  return Math.round(BASE_XP * mult * boostMult);
}

export async function addTapXp(client, userId, levelInRank, boostMult = 1) {
  const xpDelta = computeTapXp(levelInRank, boostMult);
  const result = await client.query(
    `INSERT INTO player_levels (user_id, xp_total)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET
       xp_total = player_levels.xp_total + $2,
       updated_at = NOW()
     RETURNING *`,
    [userId, xpDelta]
  );

  return { record: withResolvedLevel(result.rows[0]), xpDelta };
}

export async function ensureDailyQuests(client, userId) {
  await client.query(
    `INSERT INTO daily_quests (user_id, quest_date, quest_type, target_value, reward_payload)
     SELECT $1, CURRENT_DATE, quest_type, target_value, reward_payload
     FROM jsonb_to_recordset($2::jsonb) AS quest_def(
       quest_type text,
       target_value integer,
       reward_payload jsonb
     )
     ON CONFLICT (user_id, quest_date, quest_type) DO NOTHING`,
    [
      userId,
      JSON.stringify(
        DAILY_QUEST_DEFS.map((quest) => ({
          quest_type: quest.questType,
          target_value: quest.targetValue,
          reward_payload: quest.rewardPayload,
        })),
      ),
    ],
  );

  const result = await client.query(
    `SELECT id, quest_date, quest_type, target_value, progress_value, reward_payload, completed, claimed
     FROM daily_quests
     WHERE user_id = $1 AND quest_date = CURRENT_DATE
     ORDER BY id ASC`,
    [userId]
  );

  return result.rows.map(normalizeQuestRow);
}

function normalizeQuestRow(row) {
  return {
    id: row.id,
    questDate: row.quest_date,
    questType: row.quest_type,
    targetValue: row.target_value,
    progressValue: row.progress_value,
    rewardPayload: row.reward_payload || {},
    completed: row.completed,
    claimed: row.claimed
  };
}

export async function updateDailyQuestProgress(client, userId, { tapDelta = 0, commitDelta = 0, energyDelta = 0 }) {
  await ensureDailyQuests(client, userId);

  if (tapDelta > 0) {
    await client.query(
      `UPDATE daily_quests
       SET progress_value = LEAST(target_value, progress_value + $2),
           completed = (progress_value + $2) >= target_value,
           completed_at = CASE
             WHEN completed THEN completed_at
             WHEN (progress_value + $2) >= target_value THEN NOW()
             ELSE completed_at
           END
       WHERE user_id = $1
         AND quest_date = CURRENT_DATE
         AND quest_type = 'tap_count'`,
      [userId, tapDelta]
    );
  }

  if (commitDelta > 0) {
    await client.query(
      `UPDATE daily_quests
       SET progress_value = LEAST(target_value, progress_value + $2),
           completed = (progress_value + $2) >= target_value,
           completed_at = CASE
             WHEN completed THEN completed_at
             WHEN (progress_value + $2) >= target_value THEN NOW()
             ELSE completed_at
           END
       WHERE user_id = $1
         AND quest_date = CURRENT_DATE
         AND quest_type = 'commit_count'`,
      [userId, commitDelta]
    );
  }

  // Track energy spent (absolute value of negative energy delta)
  const energySpent = Math.abs(Math.min(energyDelta, 0));
  if (energySpent > 0) {
    await client.query(
      `UPDATE daily_quests
       SET progress_value = LEAST(target_value, progress_value + $2),
           completed = (progress_value + $2) >= target_value,
           completed_at = CASE
             WHEN completed THEN completed_at
             WHEN (progress_value + $2) >= target_value THEN NOW()
             ELSE completed_at
           END
       WHERE user_id = $1
         AND quest_date = CURRENT_DATE
         AND quest_type = 'spend_energy'`,
      [userId, energySpent]
    );
  }

  const result = await client.query(
    `SELECT id, quest_date, quest_type, target_value, progress_value, reward_payload, completed, claimed
     FROM daily_quests
     WHERE user_id = $1 AND quest_date = CURRENT_DATE
     ORDER BY id ASC`,
    [userId],
  );

  return result.rows.map(normalizeQuestRow);
}

export async function markLoginQuestComplete(client, userId) {
  await ensureDailyQuests(client, userId);
  await client.query(
    `UPDATE daily_quests
     SET progress_value = target_value,
         completed = TRUE,
         completed_at = COALESCE(completed_at, NOW())
     WHERE user_id = $1
       AND quest_date = CURRENT_DATE
       AND quest_type = 'login'`,
    [userId]
  );
}

export async function getDailyQuestSummary(client, userId) {
  const quests = await ensureDailyQuests(client, userId);
  const completed = quests.filter((quest) => quest.completed).length;
  const claimed = quests.filter((quest) => quest.claimed).length;
  const allCompleted = completed === quests.length && quests.length > 0;
  const allClaimed = claimed === quests.length && quests.length > 0;

  const streakResult = await client.query(
    `SELECT streak_days FROM progression WHERE user_id = $1`,
    [userId]
  );
  const streakDays = streakResult.rows[0]?.streak_days ?? 0;

  return {
    total: quests.length,
    completed,
    claimed,
    claimable: quests.filter((quest) => quest.completed && !quest.claimed).length,
    allCompleted,
    allClaimed,
    allCompletedBonusAvailable: allCompleted && !allClaimed,
    allCompletedBonusReward: DAILY_QUEST_ALL_CLAIMED_BONUS,
    streakDays,
    quests
  };
}

export async function claimDailyQuest(client, userId, questId) {
  const questResult = await client.query(
    `SELECT id, quest_type, reward_payload, completed, claimed
     FROM daily_quests
     WHERE id = $1 AND user_id = $2 AND quest_date = CURRENT_DATE
     FOR UPDATE`,
    [questId, userId]
  );

  if (questResult.rows.length === 0) {
    return { error: 'Quest not found', status: 404 };
  }

  const quest = normalizeQuestRow(questResult.rows[0]);
  if (!quest.completed) {
    return { error: 'Quest is not completed yet', status: 409 };
  }
  if (quest.claimed) {
    return { error: 'Quest already claimed', status: 409 };
  }

  const reward = quest.rewardPayload || {};
  await applyReward(client, userId, reward);

  await client.query(
    `UPDATE daily_quests
     SET claimed = TRUE,
         claimed_at = COALESCE(claimed_at, NOW())
     WHERE id = $1`,
    [questId]
  );

  const summary = await getDailyQuestSummary(client, userId);

  // All-quests completion bonus: applied when the last daily reward is claimed
  let bonusReward = null;
  if (summary.allClaimed) {
    bonusReward = DAILY_QUEST_ALL_CLAIMED_BONUS;
    await applyReward(client, userId, bonusReward);
  }

  return { reward, bonusReward, summary, status: 200 };
}

