import { Router } from 'express';
import { pool } from '../index.js';
import { getRankXpBounds } from '../utils/vnext.js';
import { LEAGUES, getLeagueForCommits } from '../utils/leagues.js';

const router = Router();

/**
 * GET /api/leaderboard — топ игроков
 * Query: ?limit=50&period=all|week|today&rank=1|2|3|4|5&aroundMe=1
 */
router.get('/', async (req, res, next) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const period = req.query.period || 'all';
  const rankFilter = req.query.rank ? parseInt(req.query.rank, 10) : null;
  const aroundMe = req.query.aroundMe === '1';
  const telegramUser = req.telegramUser?.user;

  try {
    const client = await pool.connect();
    try {
      const topParams = [limit];
      const topQuery = buildTopQuery(period, rankFilter, topParams);
      const result = await client.query(topQuery, topParams);

      const players = result.rows.map((row, index) => mapLeaderboardRow(row, index + 1));

      let myPosition = null;
      if (aroundMe && telegramUser) {
        const aroundParams = [telegramUser.id];
        const aroundQuery = buildAroundMeQuery(period, rankFilter, aroundParams);
        const aroundResult = await client.query(aroundQuery, aroundParams);
        if (aroundResult.rows.length > 0) {
          const aroundPlayers = aroundResult.rows.map((row) => mapLeaderboardRow(row, Number(row.rank)));
          const mine = aroundPlayers.find((player) => Number(player.telegramId) === Number(telegramUser.id));
          if (mine) {
            myPosition = {
              rank: mine.rank,
              players: aroundPlayers
            };
          }
        }
      }

      // Weekly league context for the caller (always, not only aroundMe).
      let league = null;
      if (telegramUser) {
        const weekLeague = await resolveLeagueContext(client, telegramUser.id);
        if (weekLeague) league = weekLeague;
      }

      res.json({
        period,
        limit,
        count: players.length,
        players,
        myPosition,
        league,
        leagueTiers: LEAGUES.map(({ id, min, rewardStars, title }) => ({ id, min, rewardStars, title }))
      });

    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * Weekly league context for the caller: current tier, progress to the next
 * tier and the caller's place within their tier this week (null if inactive).
 */
async function resolveLeagueContext(client, telegramId) {
  const mine = await client.query(
    `SELECT COALESCE(SUM(s.commits_earned), 0)::int AS weekly_commits
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE u.telegram_id = $1
       AND s.started_at >= date_trunc('week', NOW())`,
    [telegramId]
  );
  const weeklyCommits = Number(mine.rows[0]?.weekly_commits || 0);
  const { league, next } = getLeagueForCommits(weeklyCommits);

  let placementInLeague = null;
  if (weeklyCommits > 0 && next) {
    // Place within tier = players in the same tier band with more commits this week + 1.
    const ahead = await client.query(
      `SELECT COUNT(*)::int AS ahead
       FROM (
         SELECT s.user_id, SUM(s.commits_earned)::int AS commits
         FROM sessions s
         WHERE s.started_at >= date_trunc('week', NOW())
         GROUP BY s.user_id
         HAVING SUM(s.commits_earned) >= $1 AND SUM(s.commits_earned) < $2
       ) band
       WHERE band.commits > $3`,
      [league.min, next.min, weeklyCommits]
    );
    placementInLeague = Number(ahead.rows[0]?.ahead || 0) + 1;
  }

  return {
    tier: league.id,
    title: league.title,
    weeklyCommits,
    nextTier: next ? { id: next.id, title: next.title, minCommits: next.min } : null,
    nextTierCommitsLeft: next ? Math.max(0, next.min - weeklyCommits) : 0,
    rewardStars: league.rewardStars,
    placementInLeague
  };
}

function buildRankWhereClause(rankFilter, params) {  if (!rankFilter) return '';

  const bounds = getRankXpBounds(rankFilter);
  if (!bounds) return '';

  params.push(bounds.min);
  let clause = ` AND pl.xp_total >= $${params.length}`;
  if (bounds.max !== null) {
    params.push(bounds.max);
    clause += ` AND pl.xp_total < $${params.length}`;
  }
  return clause;
}

function buildRankJoin(rankFilter, params) {
  const rankWhereClause = buildRankWhereClause(rankFilter, params);
  return rankFilter
    ? `JOIN player_levels pl ON pl.user_id = u.id${rankWhereClause}`
    : '';
}

function buildTopQuery(period, rankFilter, params) {
  const rankJoin = buildRankJoin(rankFilter, params);
  const antiCheatWhere = `COALESCE((p.anti_cheat_state->>'banScore')::int, 0) < 50`;

  if (period === 'today') {
    return `
      SELECT
        u.id,
        u.telegram_id,
        u.username,
        u.first_name,
        COALESCE(SUM(s.commits_earned), 0) as score,
        COALESCE(SUM(s.taps_count), 0) as taps_today,
        p.tier,
        p.streak_days
      FROM users u
      LEFT JOIN sessions s ON s.user_id = u.id AND s.started_at >= CURRENT_DATE
      LEFT JOIN progression p ON p.user_id = u.id
      ${rankJoin}
      WHERE ${antiCheatWhere}
      GROUP BY u.id, u.telegram_id, u.username, u.first_name, p.tier, p.streak_days
      HAVING COALESCE(SUM(s.commits_earned), 0) > 0
      ORDER BY score DESC, u.id ASC
      LIMIT $1
    `;
  }

  if (period === 'week') {
    return `
      SELECT
        u.id,
        u.telegram_id,
        u.username,
        u.first_name,
        COALESCE(SUM(s.commits_earned), 0) as score,
        p.tier,
        p.streak_days
      FROM users u
      LEFT JOIN sessions s ON s.user_id = u.id AND s.started_at >= CURRENT_DATE - INTERVAL '7 days'
      LEFT JOIN progression p ON p.user_id = u.id
      ${rankJoin}
      WHERE ${antiCheatWhere}
      GROUP BY u.id, u.telegram_id, u.username, u.first_name, p.tier, p.streak_days
      HAVING COALESCE(SUM(s.commits_earned), 0) > 0
      ORDER BY score DESC, u.id ASC
      LIMIT $1
    `;
  }

  return `
    SELECT
      u.id,
      u.telegram_id,
      u.username,
      u.first_name,
      p.tier,
      p.commits_total as score,
      p.streak_days
    FROM users u
    JOIN progression p ON p.user_id = u.id
    ${rankJoin}
    WHERE ${antiCheatWhere}
    ORDER BY score DESC, u.id ASC
    LIMIT $1
  `;
}

function buildAroundMeQuery(period, rankFilter, params) {
  const rankJoin = buildRankJoin(rankFilter, params);
  const antiCheatWhere = `COALESCE((p.anti_cheat_state->>'banScore')::int, 0) < 50`;

  if (period === 'today') {
    return `
      WITH scored AS (
        SELECT
          u.id,
          u.telegram_id,
          u.username,
          u.first_name,
          COALESCE(SUM(s.commits_earned), 0) as score,
          COALESCE(SUM(s.taps_count), 0) as taps_today,
          p.tier,
          p.streak_days
        FROM users u
        LEFT JOIN sessions s ON s.user_id = u.id AND s.started_at >= CURRENT_DATE
        LEFT JOIN progression p ON p.user_id = u.id
        ${rankJoin}
        WHERE ${antiCheatWhere}
        GROUP BY u.id, u.telegram_id, u.username, u.first_name, p.tier, p.streak_days
        HAVING COALESCE(SUM(s.commits_earned), 0) > 0
      ), ranked AS (
        SELECT scored.*, ROW_NUMBER() OVER (ORDER BY score DESC, id ASC) as rank
        FROM scored
      ), mine AS (
        SELECT rank FROM ranked WHERE telegram_id = $1 LIMIT 1
      )
      SELECT ranked.*
      FROM ranked
      CROSS JOIN mine
      WHERE ranked.rank BETWEEN GREATEST(1, mine.rank - 2) AND mine.rank + 2
      ORDER BY ranked.rank ASC
    `;
  }

  if (period === 'week') {
    return `
      WITH scored AS (
        SELECT
          u.id,
          u.telegram_id,
          u.username,
          u.first_name,
          COALESCE(SUM(s.commits_earned), 0) as score,
          p.tier,
          p.streak_days
        FROM users u
        LEFT JOIN sessions s ON s.user_id = u.id AND s.started_at >= CURRENT_DATE - INTERVAL '7 days'
        LEFT JOIN progression p ON p.user_id = u.id
        ${rankJoin}
        WHERE ${antiCheatWhere}
        GROUP BY u.id, u.telegram_id, u.username, u.first_name, p.tier, p.streak_days
        HAVING COALESCE(SUM(s.commits_earned), 0) > 0
      ), ranked AS (
        SELECT scored.*, ROW_NUMBER() OVER (ORDER BY score DESC, id ASC) as rank
        FROM scored
      ), mine AS (
        SELECT rank FROM ranked WHERE telegram_id = $1 LIMIT 1
      )
      SELECT ranked.*
      FROM ranked
      CROSS JOIN mine
      WHERE ranked.rank BETWEEN GREATEST(1, mine.rank - 2) AND mine.rank + 2
      ORDER BY ranked.rank ASC
    `;
  }

  return `
    WITH ranked AS (
      SELECT
        u.id,
        u.telegram_id,
        u.username,
        u.first_name,
        p.tier,
        p.commits_total as score,
        p.streak_days,
        ROW_NUMBER() OVER (ORDER BY p.commits_total DESC, u.id ASC) as rank
      FROM users u
      JOIN progression p ON p.user_id = u.id
      ${rankJoin}
      WHERE ${antiCheatWhere}
    ), mine AS (
      SELECT rank FROM ranked WHERE telegram_id = $1 LIMIT 1
    )
    SELECT ranked.*
    FROM ranked
    CROSS JOIN mine
    WHERE ranked.rank BETWEEN GREATEST(1, mine.rank - 2) AND mine.rank + 2
    ORDER BY ranked.rank ASC
  `;
}

function mapLeaderboardRow(row, rank) {
  return {
    rank,
    userId: row.id,
    telegramId: row.telegram_id,
    username: row.username,
    firstName: row.first_name,
    tier: row.tier,
    tierName: getTierName(row.tier),
    commits: parseInt(row.score || 0, 10),
    streakDays: row.streak_days || 0
  };
}

function getTierName(tier) {
  const names = {
    1: 'Junior',
    2: 'Middle',
    3: 'Senior',
    4: 'Lead',
    5: 'CTO'
  };
  return names[tier] || 'Unknown';
}

export default router;
