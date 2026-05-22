import { STAGE3 } from '../config/balance.js';
import { applyReward } from './rewards.js';
import { addEffect } from './activeEffects.js';

const { DAILY_SUMMARY, REFERRAL } = STAGE3;
const DAILY_SUMMARY_LOCK_NAMESPACE = 42002;

function getDateBounds(date) {
  const d = date ? new Date(date) : new Date();
  const dateStr = d.toISOString().split('T')[0];
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { dateStr, start, end };
}

export function normalize(value, max, weight) {
  if (max <= 0) return 0;
  const ratio = Math.min(value / max, 1);
  return ratio * weight;
}

export function computeScoreComponents(details) {
  const scoreProductivity = normalize(
    details.commitsToday,
    DAILY_SUMMARY.SCORE.PRODUCTIVITY_MAX_COMMITS,
    DAILY_SUMMARY.SCORE.PRODUCTIVITY_WEIGHT
  );
  const scoreDepression = normalize(
    100 - details.depressionLevel,
    100,
    DAILY_SUMMARY.SCORE.DEPRESSION_WEIGHT
  );
  const scoreSocial = normalize(
    details.socialEvents,
    DAILY_SUMMARY.SCORE.SOCIAL_MAX_EVENTS,
    DAILY_SUMMARY.SCORE.SOCIAL_WEIGHT
  );
  const scoreReferral = normalize(
    details.activeReferrals,
    DAILY_SUMMARY.SCORE.REFERRAL_MAX_COUNT,
    DAILY_SUMMARY.SCORE.REFERRAL_WEIGHT
  );

  return {
    total: parseFloat((scoreProductivity + scoreDepression + scoreSocial + scoreReferral).toFixed(2)),
    productivity: parseFloat(scoreProductivity.toFixed(2)),
    depression: parseFloat(scoreDepression.toFixed(2)),
    social: parseFloat(scoreSocial.toFixed(2)),
    referral: parseFloat(scoreReferral.toFixed(2))
  };
}

/**
 * Calculate daily summary scores for all active users on a given date.
 *
 * @param {pg.Client} client
 * @param {Date|null} date
 * @returns {Promise<Array<{userId, scores, details}>>}
 */
export async function calculateDailySummaryScores(client, date = null) {
  const { dateStr, start, end } = getDateBounds(date);

  // Fetch all users who had any session activity today + their progression metrics
  const activityResult = await client.query(
    `SELECT
       u.id AS user_id,
       COALESCE(SUM(s.commits_earned), 0) AS commits_today,
       p.depression_level,
       p.daily_quests_state,
       p.minigame_state,
       p.social_state,
       p.referral_state,
       p.first_active_at,
       p.commits_total
     FROM users u
     LEFT JOIN sessions s ON s.user_id = u.id
       AND s.started_at >= $1::timestamptz
       AND s.started_at < $2::timestamptz
     LEFT JOIN progression p ON p.user_id = u.id
     GROUP BY u.id, p.depression_level, p.daily_quests_state, p.minigame_state,
              p.social_state, p.referral_state, p.first_active_at, p.commits_total
     HAVING COALESCE(SUM(s.commits_earned), 0) > 0
        OR p.depression_level IS NOT NULL`,
    [start.toISOString(), end.toISOString()]
  );

  if (activityResult.rows.length === 0) {
    return [];
  }

  // Fetch meme shares today for all users
  const memeSharesResult = await client.query(
    `SELECT user_id, COUNT(*) AS cnt
     FROM meme_shares
     WHERE created_at >= $1::timestamptz
       AND created_at < $2::timestamptz
     GROUP BY user_id`,
    [start.toISOString(), end.toISOString()]
  );
  const memeSharesMap = new Map(memeSharesResult.rows.map(r => [r.user_id, parseInt(r.cnt, 10)]));

  // Fetch active referrals for all users
  // A referral is active if referred user has commits_total >= 20 and first_active_at >= 2 days ago
  const referralsResult = await client.query(
    `SELECT
       r.inviter_id,
       COUNT(*) AS cnt
     FROM referrals r
     JOIN progression p ON p.user_id = r.invited_id
     WHERE p.commits_total >= $1
       AND p.first_active_at IS NOT NULL
       AND p.first_active_at <= $2::timestamptz
     GROUP BY r.inviter_id`,
    [REFERRAL.ACTIVE_THRESHOLD_COMMITS, start.toISOString()]
  );
  const activeReferralsMap = new Map(referralsResult.rows.map(r => [r.inviter_id, parseInt(r.cnt, 10)]));

  // Fetch equipped team_lead skins for all active users
  const userIds = activityResult.rows.map(r => r.user_id);
  const skinsResult = await client.query(
    `SELECT user_id FROM user_skins WHERE user_id = ANY($1::int[]) AND skin_id = 'team_lead' AND equipped = true`,
    [userIds]
  );
  const teamLeadUsers = new Set(skinsResult.rows.map(r => r.user_id));

  const results = [];

  for (const row of activityResult.rows) {
    const userId = row.user_id;
    const commitsToday = parseInt(row.commits_today, 10) || 0;
    const depressionLevel = Number(row.depression_level || 0);

    // Social activity = meme shares + completed quests + mini-games played today
    const memeShares = memeSharesMap.get(userId) || 0;
    const questsCompleted = countCompletedQuests(row.daily_quests_state);
    const miniGamesPlayed = countMiniGamesPlayed(row.minigame_state, dateStr);
    const socialEvents = memeShares + questsCompleted + miniGamesPlayed;

    const activeReferrals = activeReferralsMap.get(userId) || 0;

    let scores = computeScoreComponents({ commitsToday, depressionLevel, socialEvents, activeReferrals });

    // Team Lead skin bonus: +15% productivity score in Daily Battle
    if (teamLeadUsers.has(userId)) {
      const boostedProductivity = Math.min(
        scores.productivity * 1.15,
        DAILY_SUMMARY.SCORE.PRODUCTIVITY_WEIGHT
      );
      scores = {
        ...scores,
        productivity: parseFloat(boostedProductivity.toFixed(2)),
        total: parseFloat((scores.total - scores.productivity + boostedProductivity).toFixed(2))
      };
    }

    results.push({
      userId,
      scores,
      details: {
        commitsToday,
        depressionLevel,
        socialEvents,
        memeShares,
        questsCompleted,
        miniGamesPlayed,
        activeReferrals
      }
    });
  }

  return results;
}

function countCompletedQuests(dailyQuestsState) {
  if (!dailyQuestsState || !dailyQuestsState.quests) return 0;
  return dailyQuestsState.quests.filter(q => q.completed).length;
}

function countMiniGamesPlayed(minigameState, dateStr) {
  if (!minigameState || typeof minigameState !== 'object') return 0;
  let count = 0;
  for (const key of Object.keys(minigameState)) {
    const game = minigameState[key];
    if (game && game.lastPlayedAt) {
      const playedDate = game.lastPlayedAt.split('T')[0];
      if (playedDate === dateStr) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Determine the three special statuses from the ranked results.
 *
 * @param {Array} results — output from calculateDailySummaryScores, already sorted by total score desc
 * @param {Map<number, object>} progressionMap — user_id -> progression row
 * @returns {Array} — same results with `.status` field added where applicable
 */
export function determineStatuses(results, progressionMap) {
  if (results.length === 0) return [];

  // Find highest depression level (burnt out) and lowest (savior)
  let maxDepressionIdx = -1;
  let maxDepressionLevel = -1;
  let minDepressionIdx = -1;
  let minDepressionLevel = Infinity;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const prog = progressionMap.get(r.userId);
    const depressionLevel = prog ? Number(prog.depression_level || 0) : r.details.depressionLevel;

    if (depressionLevel > maxDepressionLevel) {
      maxDepressionLevel = depressionLevel;
      maxDepressionIdx = i;
    }
    if (depressionLevel < minDepressionLevel) {
      minDepressionLevel = depressionLevel;
      minDepressionIdx = i;
    }
  }

  // Find highest productivity score, excluding the burnt-out player
  let maxProductivityIdx = -1;
  let maxProductivity = -1;
  for (let i = 0; i < results.length; i++) {
    if (i === maxDepressionIdx) continue;
    if (results[i].scores.productivity > maxProductivity) {
      maxProductivity = results[i].scores.productivity;
      maxProductivityIdx = i;
    }
  }
  // If everyone is burnt out (single player case), fall back to highest productivity
  if (maxProductivityIdx === -1) {
    for (let i = 0; i < results.length; i++) {
      if (results[i].scores.productivity > maxProductivity) {
        maxProductivity = results[i].scores.productivity;
        maxProductivityIdx = i;
      }
    }
  }

  const next = results.map((r, idx) => ({ ...r }));

  if (maxProductivityIdx >= 0 && next[maxProductivityIdx]) {
    next[maxProductivityIdx].status = DAILY_SUMMARY.STATUSES.PRODUCTIVE_GENIUS.id;
  }
  if (maxDepressionIdx >= 0 && next[maxDepressionIdx]) {
    next[maxDepressionIdx].status = DAILY_SUMMARY.STATUSES.BURNT_OUT.id;
  }
  if (minDepressionIdx >= 0 && next[minDepressionIdx] && minDepressionIdx !== maxDepressionIdx) {
    next[minDepressionIdx].status = DAILY_SUMMARY.STATUSES.DEPRESSION_SAVIOR.id;
  }

  return next;
}

/**
 * Distribute daily summary rewards for a given date.
 * Idempotent: safe to call multiple times for the same date.
 *
 * @param {pg.Client} client
 * @param {Date|null} date
 * @returns {Promise<{distributed: number, results: Array, alreadyDistributed?: boolean, date: string}>}
 */
export async function distributeDailySummaryRewards(client, date = null) {
  const { dateStr } = getDateBounds(date);

  await client.query('BEGIN');

  try {
    await client.query(
      `SELECT pg_advisory_xact_lock($1, hashtext($2))`,
      [DAILY_SUMMARY_LOCK_NAMESPACE, dateStr]
    );

    // Idempotency check
    const existing = await client.query(
      `SELECT COUNT(*) AS cnt FROM daily_summary_results WHERE summary_date = $1`,
      [dateStr]
    );
    if (parseInt(existing.rows[0].cnt, 10) > 0) {
      await client.query('COMMIT');
      return { distributed: 0, results: [], alreadyDistributed: true, date: dateStr };
    }

    const scores = await calculateDailySummaryScores(client, date);
    if (scores.length === 0) {
      await client.query('COMMIT');
      return { distributed: 0, results: [], date: dateStr };
    }

    // Sort by total score desc
    scores.sort((a, b) => b.scores.total - a.scores.total);

    // Fetch progression for status determination
    const userIds = scores.map(s => s.userId);
    const progResult = await client.query(
      `SELECT user_id, depression_level FROM progression WHERE user_id = ANY($1::int[])`,
      [userIds]
    );
    const progressionMap = new Map(progResult.rows.map(r => [r.user_id, r]));

    const rankedWithStatuses = determineStatuses(scores, progressionMap);

    // Assign ranks
    for (let i = 0; i < rankedWithStatuses.length; i++) {
      rankedWithStatuses[i].rank = i + 1;
    }

    const distributed = [];

    for (const entry of rankedWithStatuses) {
      const rank = entry.rank;
      let rewardPayload = {};

      if (rank === 1) {
        rewardPayload = { ...DAILY_SUMMARY.REWARDS.RANK_1 };
      } else if (rank === 2) {
        rewardPayload = { ...DAILY_SUMMARY.REWARDS.RANK_2 };
      } else if (rank === 3) {
        rewardPayload = { ...DAILY_SUMMARY.REWARDS.RANK_3 };
      }

      // Insert result record
      await client.query(
        `INSERT INTO daily_summary_results
         (user_id, summary_date, score_total, score_productivity, score_depression, score_social, score_referral, rank, status, reward_payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          entry.userId,
          dateStr,
          entry.scores.total,
          entry.scores.productivity,
          entry.scores.depression,
          entry.scores.social,
          entry.scores.referral,
          rank,
          entry.status || null,
          JSON.stringify(rewardPayload)
        ]
      );

      // Apply rewards
      if (Object.keys(rewardPayload).length > 0) {
        // Apply tap boost via active_effects if specified
        if (rewardPayload.tapBoostPercent && rewardPayload.tapBoostDurationHours) {
          const effectsResult = await client.query(
            `SELECT active_effects FROM progression WHERE user_id = $1`,
            [entry.userId]
          );
          const currentEffects = effectsResult.rows[0]?.active_effects || {};
          const updatedEffects = addEffect(
            currentEffects,
            'tapBoost',
            { percent: rewardPayload.tapBoostPercent },
            rewardPayload.tapBoostDurationHours * 60
          );
          await client.query(
            `UPDATE progression SET active_effects = $2 WHERE user_id = $1`,
            [entry.userId, JSON.stringify(updatedEffects)]
          );
        }

        // Apply title to inventory if specified
        if (rewardPayload.title) {
          await client.query(
            `UPDATE progression
             SET inventory = COALESCE(inventory, '{}') || jsonb_build_object($2, true)
             WHERE user_id = $1`,
            [entry.userId, `title_${rewardPayload.title}`]
          );
        }

        // Apply skin fragment if specified
        if (rewardPayload.skinFragment) {
          await client.query(
            `UPDATE progression
             SET inventory = COALESCE(inventory, '{}') || jsonb_build_object($2, COALESCE((inventory->>$2)::int, 0) + 1)
             WHERE user_id = $1`,
            [entry.userId, `fragment_${rewardPayload.skinFragment}`]
          );
        }

        // Apply any standard rewards (energy, commits, etc.)
        const standardReward = {};
        if (typeof rewardPayload.energy === 'number') standardReward.energy = rewardPayload.energy;
        if (typeof rewardPayload.commitsCurrent === 'number') standardReward.commitsCurrent = rewardPayload.commitsCurrent;
        if (Object.keys(standardReward).length > 0) {
          await applyReward(client, entry.userId, standardReward);
        }
      }

      distributed.push({
        userId: entry.userId,
        rank,
        status: entry.status || null,
        scores: entry.scores,
        reward: rewardPayload
      });
    }

    await client.query('COMMIT');

    return {
      distributed: distributed.length,
      results: distributed,
      date: dateStr
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

/**
 * Build a chat message for the daily summary.
 *
 * @param {Array} topResults — top results to display
 * @param {string} dateStr
 * @returns {string} — Markdown-formatted message
 */
export function buildChatMessage(topResults, dateStr) {
  const statusLabels = {
    [DAILY_SUMMARY.STATUSES.PRODUCTIVE_GENIUS.id]: DAILY_SUMMARY.STATUSES.PRODUCTIVE_GENIUS.title,
    [DAILY_SUMMARY.STATUSES.BURNT_OUT.id]: DAILY_SUMMARY.STATUSES.BURNT_OUT.title,
    [DAILY_SUMMARY.STATUSES.DEPRESSION_SAVIOR.id]: DAILY_SUMMARY.STATUSES.DEPRESSION_SAVIOR.title
  };

  let text = `🏆 *Ежедневная битва — ${dateStr}*\n\n`;

  if (topResults.length === 0) {
    text += 'Сегодня никто не кодил. Депрессия победила? 😶\n';
    return text;
  }

  // Top 3 podium
  const medals = ['🥇', '🥈', '🥉'];
  for (let i = 0; i < Math.min(3, topResults.length); i++) {
    const r = topResults[i];
    const medal = medals[i] || `${i + 1}.`;
    const statusText = r.status ? ` (${statusLabels[r.status] || r.status})` : '';
    text += `${medal} #${r.rank} — score: ${r.scores.total}${statusText}\n`;
  }

  // All statuses awarded today
  const statuses = topResults.filter(r => r.status);
  if (statuses.length > 0) {
    text += '\n*Статусы дня:*\n';
    for (const s of statuses) {
      const label = statusLabels[s.status] || s.status;
      text += `• ${label}\n`;
    }
  }

  text += '\n_Увидимся завтра в 18:00!_ 🚀';
  return text;
}
