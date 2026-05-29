import { Router } from "express";
import { pool } from "../index.js";
import { PRODUCT_CATALOG } from "../utils/shopCatalog.js";
import { resolveLevelState } from "../utils/vnext.js";

const router = Router();

const OBSERVATION_SECRET =
  process.env.OBSERVATION_SECRET || process.env.BOT_BACKEND_SECRET;
const MAX_DAYS = 30;
const DEFAULT_DAYS = 7;

router.get("/economy", async (req, res, next) => {
  const headerSecret =
    req.get("X-Bot-Backend-Secret") || req.get("X-Observation-Secret");
  if (!OBSERVATION_SECRET || headerSecret !== OBSERVATION_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const parsedDays = Number.parseInt(
    String(req.query.days ?? DEFAULT_DAYS),
    10,
  );
  const days = Number.isFinite(parsedDays)
    ? Math.max(1, Math.min(parsedDays, MAX_DAYS))
    : DEFAULT_DAYS;

  try {
    const client = await pool.connect();
    try {
      const sqlSlices = {
        dauRetention: await getDauRetentionSlice(client, days),
        dailyQuests: await getDailyQuestsSlice(client, days),
        contextOffers: await getContextOffersSlice(client, days),
        weeklyHackathon: await getWeeklyHackathonSlice(client),
        sprintPass: await getSprintPassSlice(client),
        shopPurchases: await getShopPurchasesSlice(client, days),
        economyHealth: await getEconomyHealthSlice(client),
      };

      return res.json({
        success: true,
        windowDays: days,
        generatedAt: new Date().toISOString(),
        sqlSlices,
        overview: buildOverviewLegacy(sqlSlices),
        offers: buildOffersLegacy(sqlSlices),
        shop: buildShopLegacy(sqlSlices),
        quests: buildQuestsLegacy(sqlSlices),
        pass: buildPassLegacy(sqlSlices),
        event: buildEventLegacy(sqlSlices),
        retention: buildRetentionLegacy(sqlSlices),
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

async function getDauRetentionSlice(client, days) {
  const [byDayResult, d1Result, stickyResult] = await Promise.all([
    client.query(
      `SELECT
         DATE(started_at) AS day,
         COUNT(DISTINCT user_id) AS dau,
         COUNT(*) AS session_count,
         COALESCE(SUM(taps_count), 0) AS taps_total,
         COALESCE(SUM(commits_earned), 0) AS commits_total,
         ROUND(AVG(taps_count), 1) AS avg_taps_per_session
       FROM sessions
       WHERE started_at >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
       GROUP BY DATE(started_at)
       ORDER BY day DESC`,
      [days],
    ),
    client.query(
      `WITH cohorts AS (
         SELECT
           id AS user_id,
           DATE(created_at) AS cohort_date
         FROM users
         WHERE created_at >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
       )
       SELECT
         c.cohort_date,
         COUNT(*) AS cohort_size,
         COUNT(*) FILTER (
           WHERE EXISTS (
             SELECT 1
             FROM sessions s
             WHERE s.user_id = c.user_id
               AND DATE(s.started_at) = c.cohort_date + INTERVAL '1 day'
           )
         ) AS d1_returned
       FROM cohorts c
       GROUP BY c.cohort_date
       ORDER BY c.cohort_date DESC`,
      [days],
    ),
    client.query(
      `SELECT
         COUNT(DISTINCT user_id) FILTER (WHERE DATE(started_at) = CURRENT_DATE - INTERVAL '1 day') AS yesterday_dau,
         (SELECT COUNT(*) FROM users) AS total_users
       FROM sessions`,
    ),
  ]);

  const stickyRow = stickyResult.rows[0] || {};
  const yesterdayDau = Number(stickyRow.yesterday_dau || 0);
  const totalUsers = Number(stickyRow.total_users || 0);

  return {
    byDay: byDayResult.rows.map((row) => ({
      day: row.day,
      dau: Number(row.dau || 0),
      sessionCount: Number(row.session_count || 0),
      tapsTotal: Number(row.taps_total || 0),
      commitsTotal: Number(row.commits_total || 0),
      avgTapsPerSession: Number(row.avg_taps_per_session || 0),
    })),
    d1Retention: d1Result.rows.map((row) => {
      const cohortSize = Number(row.cohort_size || 0);
      const returned = Number(row.d1_returned || 0);
      return {
        cohortDate: row.cohort_date,
        cohortSize,
        d1Returned: returned,
        d1RetentionPct: ratioPct(returned, cohortSize),
      };
    }),
    stickyFactor: {
      yesterdayDau,
      totalUsers,
      stickyFactorPct: ratioPct(yesterdayDau, totalUsers),
    },
  };
}

async function getDailyQuestsSlice(client, days) {
  const [perQuestResult, fullClearResult, timingResult, bottleneckResult] =
    await Promise.all([
      client.query(
        `SELECT
         quest_type,
         target_value,
         COUNT(*) FILTER (WHERE completed) AS completed,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE claimed) AS claimed
       FROM daily_quests
       WHERE quest_date = CURRENT_DATE
       GROUP BY quest_type, target_value
       ORDER BY quest_type`,
      ),
      client.query(
        `WITH per_user_day AS (
         SELECT
           quest_date,
           user_id,
           COUNT(*) AS quest_count,
           COUNT(*) FILTER (WHERE completed) AS completed_count,
           COUNT(*) FILTER (WHERE claimed) AS claimed_count
         FROM daily_quests
         WHERE quest_date >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
         GROUP BY quest_date, user_id
       )
       SELECT
         quest_date,
         COUNT(*) FILTER (WHERE completed_count > 0) AS users_with_any_complete,
         COUNT(*) AS users_with_quests,
         COUNT(*) FILTER (WHERE completed_count = quest_count) AS full_clear_users,
         COUNT(*) FILTER (WHERE claimed_count = quest_count) AS full_claim_users
       FROM per_user_day
       GROUP BY quest_date
       ORDER BY quest_date DESC`,
        [days],
      ),
      client.query(
        `SELECT
         quest_type,
         COUNT(*) AS claimed_count,
         ROUND(AVG(EXTRACT(EPOCH FROM (claimed_at - completed_at)) / 60.0), 1) AS avg_minutes_to_claim
       FROM daily_quests
       WHERE claimed = TRUE
         AND completed_at IS NOT NULL
         AND claimed_at IS NOT NULL
         AND quest_date >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
       GROUP BY quest_type
       ORDER BY quest_type`,
        [days],
      ),
      client.query(
        `WITH last_completion AS (
         SELECT
           user_id,
           quest_date,
           MAX(completed_at) AS last_completed_at
         FROM daily_quests
         WHERE completed = TRUE
           AND completed_at IS NOT NULL
           AND quest_date >= CURRENT_DATE - INTERVAL '3 days'
         GROUP BY user_id, quest_date
       )
       SELECT
         dq.quest_type,
         COUNT(*) AS times_last
       FROM daily_quests dq
       JOIN last_completion lc
         ON dq.user_id = lc.user_id
        AND dq.quest_date = lc.quest_date
        AND dq.completed_at = lc.last_completed_at
       GROUP BY dq.quest_type
       ORDER BY times_last DESC, dq.quest_type`,
      ),
    ]);

  return {
    perQuestToday: perQuestResult.rows.map((row) => {
      const total = Number(row.total || 0);
      const completed = Number(row.completed || 0);
      const claimed = Number(row.claimed || 0);
      return {
        questType: row.quest_type,
        targetValue: Number(row.target_value || 0),
        completed,
        total,
        claimed,
        completionPct: ratioPct(completed, total),
        claimPct: ratioPct(claimed, total),
      };
    }),
    fullClearByDate: fullClearResult.rows.map((row) => {
      const usersWithQuests = Number(row.users_with_quests || 0);
      const fullClearUsers = Number(row.full_clear_users || 0);
      const fullClaimUsers = Number(row.full_claim_users || 0);
      return {
        questDate: row.quest_date,
        usersWithAnyComplete: Number(row.users_with_any_complete || 0),
        usersWithQuests,
        fullClearUsers,
        fullClaimUsers,
        fullClearPct: ratioPct(fullClearUsers, usersWithQuests),
        fullClaimPct: ratioPct(fullClaimUsers, usersWithQuests),
      };
    }),
    claimTiming: timingResult.rows.map((row) => ({
      questType: row.quest_type,
      claimedCount: Number(row.claimed_count || 0),
      avgMinutesToClaim: Number(row.avg_minutes_to_claim || 0),
    })),
    bottleneckQuest: bottleneckResult.rows.map((row) => ({
      questType: row.quest_type,
      timesLast: Number(row.times_last || 0),
    })),
  };
}

async function getContextOffersSlice(client, days) {
  const [
    impressionsResult,
    dismissResult,
    conversionResult,
    fatigueResult,
    sourceBreakdownResult,
    sourceConversionResult,
  ] = await Promise.all([
    client.query(
      `SELECT
         offer_type,
         COUNT(*) AS impressions,
         COUNT(DISTINCT user_id) AS unique_users
       FROM offer_impressions
       WHERE shown_at >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
       GROUP BY offer_type
       ORDER BY impressions DESC, offer_type`,
      [days],
    ),
    client.query(
      `WITH impressions AS (
         SELECT user_id, offer_type, shown_at
         FROM offer_impressions
         WHERE shown_at >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
       ),
       dismisses AS (
         SELECT
           user_id,
           created_at,
           context->>'offerType' AS offer_type
         FROM audit_logs
         WHERE action = 'offer_dismiss'
           AND created_at >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
       )
       SELECT
         i.offer_type,
         COUNT(DISTINCT i.user_id) AS impression_users,
         COUNT(DISTINCT i.user_id) FILTER (
           WHERE EXISTS (
             SELECT 1
             FROM dismisses d
             WHERE d.user_id = i.user_id
               AND d.offer_type = i.offer_type
               AND d.created_at BETWEEN i.shown_at AND i.shown_at + INTERVAL '5 minutes'
           )
         ) AS dismiss_users
       FROM impressions i
       GROUP BY i.offer_type
       ORDER BY i.offer_type`,
      [days],
    ),
    client.query(
      `WITH offer_map(offer_type, item_type) AS (
         VALUES
           ('low_energy', 'energy_refill'),
           ('high_stress', 'depression_cure'),
           ('near_rank', 'tier_boost')
       ),
       impressions AS (
         SELECT user_id, offer_type, shown_at
         FROM offer_impressions
         WHERE shown_at >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
       )
       SELECT
         om.offer_type,
         COUNT(DISTINCT i.user_id) AS impressions,
         COUNT(DISTINCT i.user_id) FILTER (
           WHERE EXISTS (
             SELECT 1
             FROM audit_logs al
             WHERE al.user_id = i.user_id
               AND al.action = 'purchase_intent'
               AND al.context->>'itemType' = om.item_type
               AND al.created_at BETWEEN i.shown_at AND i.shown_at + INTERVAL '10 minutes'
           )
         ) AS proxy_conversions
         ,
         COUNT(DISTINCT i.user_id) FILTER (
           WHERE EXISTS (
             SELECT 1
             FROM purchases p
             WHERE p.user_id = i.user_id
               AND p.item_type = om.item_type
               AND p.status = 'completed'
               AND p.created_at BETWEEN i.shown_at AND i.shown_at + INTERVAL '10 minutes'
           )
         ) AS completed_purchases
       FROM offer_map om
       LEFT JOIN impressions i ON i.offer_type = om.offer_type
       GROUP BY om.offer_type
       ORDER BY om.offer_type`,
      [days],
    ),
    client.query(
      `SELECT
         DATE(shown_at) AS day,
         offer_type,
         ROUND(AVG(cnt), 1) AS avg_impressions_per_user,
         MAX(cnt) AS max_impressions_single_user
       FROM (
         SELECT
           user_id,
           offer_type,
           DATE(shown_at) AS shown_at,
           COUNT(*) AS cnt
         FROM offer_impressions
         WHERE shown_at >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
         GROUP BY user_id, offer_type, DATE(shown_at)
       ) sub
       GROUP BY DATE(shown_at), offer_type
       ORDER BY day DESC, offer_type`,
      [days],
    ),
    client.query(
      `SELECT
         offer_type,
         source,
         COUNT(*) AS impressions,
         COUNT(DISTINCT user_id) AS unique_users
       FROM offer_impressions
       WHERE shown_at >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
       GROUP BY offer_type, source
       ORDER BY offer_type, source`,
      [days],
    ),
    client.query(
      `WITH offer_map(offer_type, item_type) AS (
         VALUES
           ('low_energy', 'energy_refill'),
           ('high_stress', 'depression_cure'),
           ('near_rank', 'tier_boost')
       ),
       impressions AS (
         SELECT user_id, offer_type, source, shown_at
         FROM offer_impressions
         WHERE shown_at >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
       )
       SELECT
         i.offer_type,
         i.source,
         COUNT(DISTINCT i.user_id) AS impression_users,
         COUNT(DISTINCT i.user_id) FILTER (
           WHERE EXISTS (
             SELECT 1
             FROM audit_logs al
             WHERE al.user_id = i.user_id
               AND al.action = 'purchase_intent'
               AND al.context->>'itemType' = om.item_type
               AND al.created_at BETWEEN i.shown_at AND i.shown_at + INTERVAL '10 minutes'
           )
         ) AS purchase_intent_users,
         COUNT(DISTINCT i.user_id) FILTER (
           WHERE EXISTS (
             SELECT 1
             FROM purchases p
             WHERE p.user_id = i.user_id
               AND p.item_type = om.item_type
               AND p.status = 'completed'
               AND p.created_at BETWEEN i.shown_at AND i.shown_at + INTERVAL '10 minutes'
           )
         ) AS completed_purchase_users
       FROM impressions i
       JOIN offer_map om ON om.offer_type = i.offer_type
       GROUP BY i.offer_type, i.source
       ORDER BY i.offer_type, i.source`,
      [days],
    ),
  ]);

  return {
    impressionsByType: impressionsResult.rows.map((row) => ({
      offerType: row.offer_type,
      impressions: Number(row.impressions || 0),
      uniqueUsers: Number(row.unique_users || 0),
    })),
    dismissRateByType: dismissResult.rows.map((row) => {
      const impressionUsers = Number(row.impression_users || 0);
      const dismissUsers = Number(row.dismiss_users || 0);
      return {
        offerType: row.offer_type,
        impressionUsers,
        dismissUsers,
        dismissRatePct: ratioPct(dismissUsers, impressionUsers),
      };
    }),
    proxyConversionByType: conversionResult.rows.map((row) => {
      const impressions = Number(row.impressions || 0);
      const proxyConversions = Number(row.proxy_conversions || 0);
      const completedPurchases = Number(row.completed_purchases || 0);
      return {
        offerType: row.offer_type,
        impressions,
        proxyConversions,
        completedPurchases,
        proxyCtrPct: ratioPct(proxyConversions, impressions),
        completedCtrPct: ratioPct(completedPurchases, impressions),
      };
    }),
    fatigueByDay: fatigueResult.rows.map((row) => ({
      day: row.day,
      offerType: row.offer_type,
      avgImpressionsPerUser: Number(row.avg_impressions_per_user || 0),
      maxImpressionsSingleUser: Number(row.max_impressions_single_user || 0),
    })),
    sourceBreakdown: sourceBreakdownResult.rows.map((row) => ({
      offerType: row.offer_type,
      source: row.source,
      impressions: Number(row.impressions || 0),
      uniqueUsers: Number(row.unique_users || 0),
    })),
    sourceConversionByType: sourceConversionResult.rows.map((row) => {
      const impressionUsers = Number(row.impression_users || 0);
      const purchaseIntentUsers = Number(row.purchase_intent_users || 0);
      const completedPurchaseUsers = Number(row.completed_purchase_users || 0);
      return {
        offerType: row.offer_type,
        source: row.source,
        impressionUsers,
        purchaseIntentUsers,
        completedPurchaseUsers,
        purchaseIntentUserRatePct: ratioPct(
          purchaseIntentUsers,
          impressionUsers,
        ),
        completedPurchaseUserRatePct: ratioPct(
          completedPurchaseUsers,
          impressionUsers,
        ),
      };
    }),
  };
}

async function getWeeklyHackathonSlice(client) {
  const [currentResult, historicalResult, distributionResult, dropOffResult] =
    await Promise.all([
      client.query(
        `SELECT
         e.id AS event_id,
         e.event_type,
         e.title,
         e.target_commits AS target,
         e.start_date,
         e.end_date,
         COUNT(ec.user_id) AS participants,
         COUNT(ec.user_id) FILTER (WHERE ec.commits_contributed >= e.target_commits) AS target_reached,
         COUNT(ec.user_id) FILTER (WHERE ec.claimed = TRUE) AS claimed,
         ROUND(
           COUNT(ec.user_id) FILTER (WHERE ec.claimed = TRUE) * 100.0
           / NULLIF(COUNT(ec.user_id), 0),
           2
         ) AS completion_pct,
         ROUND(AVG(ec.commits_contributed), 0) AS avg_commits,
         MAX(ec.commits_contributed) AS max_commits
       FROM events e
       LEFT JOIN event_contributions ec ON ec.event_id = e.id
       WHERE e.end_date >= CURRENT_DATE
       GROUP BY e.id, e.event_type, e.title, e.target_commits, e.start_date, e.end_date
       ORDER BY e.start_date DESC`,
      ),
      client.query(
        `SELECT
         e.id AS event_id,
         e.event_type,
         e.title,
         e.start_date,
         e.target_commits,
         COUNT(ec.user_id) AS participants,
         COUNT(ec.user_id) FILTER (WHERE ec.claimed = TRUE) AS completed,
         ROUND(
           COUNT(ec.user_id) FILTER (WHERE ec.claimed = TRUE) * 100.0
           / NULLIF(COUNT(ec.user_id), 0),
           2
         ) AS completion_pct
       FROM events e
       LEFT JOIN event_contributions ec ON ec.event_id = e.id
       GROUP BY e.id, e.event_type, e.title, e.start_date, e.target_commits
       ORDER BY e.start_date DESC
       LIMIT 10`,
      ),
      client.query(
        `SELECT
         CASE
           WHEN ec.commits_contributed >= e.target_commits THEN 'reached_target'
           WHEN ec.commits_contributed >= e.target_commits * 0.75 THEN '75_99_pct'
           WHEN ec.commits_contributed >= e.target_commits * 0.50 THEN '50_74_pct'
           WHEN ec.commits_contributed >= e.target_commits * 0.25 THEN '25_49_pct'
           ELSE 'under_25_pct'
         END AS progress_bucket,
         COUNT(*) AS users
       FROM event_contributions ec
       JOIN events e ON e.id = ec.event_id
       WHERE e.end_date >= CURRENT_DATE
       GROUP BY 1
       ORDER BY progress_bucket`,
      ),
      client.query(
        `SELECT
         COUNT(DISTINCT ec.user_id) AS event_participants,
         COUNT(DISTINCT ec.user_id) FILTER (
           WHERE EXISTS (
             SELECT 1
             FROM sessions s
             WHERE s.user_id = ec.user_id
               AND s.started_at >= CURRENT_DATE - INTERVAL '3 days'
           )
         ) AS still_active,
         COUNT(DISTINCT ec.user_id) FILTER (
           WHERE NOT EXISTS (
             SELECT 1
             FROM sessions s
             WHERE s.user_id = ec.user_id
               AND s.started_at >= CURRENT_DATE - INTERVAL '3 days'
           )
         ) AS likely_dropped_off
       FROM event_contributions ec
       JOIN events e ON e.id = ec.event_id
       WHERE e.end_date >= CURRENT_DATE`,
      ),
    ]);

  const dropOff = dropOffResult.rows[0] || {};

  return {
    currentEventProgress: currentResult.rows.map((row) => ({
      eventId: Number(row.event_id || 0),
      eventType: row.event_type,
      title: row.title,
      target: Number(row.target || 0),
      startDate: row.start_date,
      endDate: row.end_date,
      participants: Number(row.participants || 0),
      targetReached: Number(row.target_reached || 0),
      claimed: Number(row.claimed || 0),
      completionPct: Number(row.completion_pct || 0),
      avgCommits: Number(row.avg_commits || 0),
      maxCommits: Number(row.max_commits || 0),
    })),
    historicalCompletionRates: historicalResult.rows.map((row) => ({
      eventId: Number(row.event_id || 0),
      eventType: row.event_type,
      title: row.title,
      startDate: row.start_date,
      targetCommits: Number(row.target_commits || 0),
      participants: Number(row.participants || 0),
      completed: Number(row.completed || 0),
      completionPct: Number(row.completion_pct || 0),
    })),
    commitDistribution: distributionResult.rows.map((row) => ({
      progressBucket: row.progress_bucket,
      users: Number(row.users || 0),
    })),
    dropOffProxy: {
      eventParticipants: Number(dropOff.event_participants || 0),
      stillActive: Number(dropOff.still_active || 0),
      likelyDroppedOff: Number(dropOff.likely_dropped_off || 0),
    },
  };
}

async function getSprintPassSlice(client) {
  const [
    distributionResult,
    velocityResult,
    unclaimedResult,
    premiumTimingResult,
  ] = await Promise.all([
    client.query(
      `SELECT
         current_level,
         COUNT(*) AS players,
         ROUND(AVG(current_xp), 0) AS avg_xp,
         COUNT(*) FILTER (WHERE is_premium = TRUE) AS premium_players,
         ROUND(
           COUNT(*) FILTER (WHERE is_premium = TRUE) * 100.0 / NULLIF(COUNT(*), 0),
           2
         ) AS premium_pct
       FROM player_passes
       GROUP BY current_level
       ORDER BY current_level`,
    ),
    client.query(
      `WITH level_first_claim AS (
         SELECT
           user_id,
           level,
           MIN(claimed_at)::date AS reached_on
         FROM pass_claims
         GROUP BY user_id, level
       ),
       global_first AS (
         SELECT MIN(reached_on) AS first_reached_on
         FROM level_first_claim
       )
       SELECT
         lfc.level,
         COUNT(*) AS players_who_reached,
         ROUND(AVG((lfc.reached_on - gf.first_reached_on)::numeric), 2) AS avg_days_from_first
       FROM level_first_claim lfc
       CROSS JOIN global_first gf
       GROUP BY lfc.level
       ORDER BY lfc.level`,
    ),
    client.query(
      `WITH active_pass AS (
         SELECT id
         FROM sprint_passes
         WHERE is_active = TRUE
           AND start_date <= CURRENT_DATE
           AND end_date >= CURRENT_DATE
         ORDER BY id DESC
         LIMIT 1
       )
       SELECT
         pr.level,
         pr.required_xp,
         COUNT(*) FILTER (
           WHERE pp.current_level >= pr.level
             AND NOT EXISTS (
               SELECT 1
               FROM pass_claims pc
               WHERE pc.user_id = pp.user_id
                 AND pc.pass_id = pp.pass_id
                 AND pc.level = pr.level
                 AND pc.track = 'free'
             )
         ) AS free_unclaimed,
         COUNT(*) FILTER (
           WHERE pp.is_premium = TRUE
             AND pp.current_level >= pr.level
             AND NOT EXISTS (
               SELECT 1
               FROM pass_claims pc
               WHERE pc.user_id = pp.user_id
                 AND pc.pass_id = pp.pass_id
                 AND pc.level = pr.level
                 AND pc.track = 'premium'
             )
         ) AS premium_unclaimed
       FROM active_pass ap
       JOIN pass_rewards pr ON pr.pass_id = ap.id
       JOIN player_passes pp ON pp.pass_id = ap.id
       GROUP BY pr.level, pr.required_xp
       ORDER BY pr.level`,
    ),
    client.query(
      `SELECT
         al.user_id,
         al.created_at,
         pp.current_level AS level_at_unlock,
         pp.current_xp AS xp_at_unlock,
         COALESCE((al.context->>'seasonNumber')::int, NULL) AS season_number
       FROM audit_logs al
       LEFT JOIN player_passes pp ON pp.user_id = al.user_id
       WHERE al.action = 'pass_premium_unlock'
       ORDER BY al.created_at DESC
       LIMIT 50`,
    ),
  ]);

  return {
    currentLevelDistribution: distributionResult.rows.map((row) => ({
      currentLevel: Number(row.current_level || 0),
      players: Number(row.players || 0),
      avgXp: Number(row.avg_xp || 0),
      premiumPlayers: Number(row.premium_players || 0),
      premiumPct: Number(row.premium_pct || 0),
    })),
    levelAdvancementVelocity: velocityResult.rows.map((row) => ({
      level: Number(row.level || 0),
      playersWhoReached: Number(row.players_who_reached || 0),
      avgDaysFromFirst: Number(row.avg_days_from_first || 0),
    })),
    unclaimedRewards: unclaimedResult.rows.map((row) => ({
      level: Number(row.level || 0),
      requiredXp: Number(row.required_xp || 0),
      freeUnclaimed: Number(row.free_unclaimed || 0),
      premiumUnclaimed: Number(row.premium_unclaimed || 0),
    })),
    premiumPurchaseTiming: premiumTimingResult.rows.map((row) => ({
      userId: Number(row.user_id || 0),
      createdAt: row.created_at,
      levelAtUnlock: Number(row.level_at_unlock || 0),
      xpAtUnlock: Number(row.xp_at_unlock || 0),
      seasonNumber:
        row.season_number === null ? null : Number(row.season_number),
    })),
  };
}

async function getShopPurchasesSlice(client, days) {
  const [
    funnelResult,
    completedByDayResult,
    revenuePerUserResult,
    conversionByDayResult,
    intentResult,
    paymentResult,
  ] = await Promise.all([
    client.query(
      `SELECT
         item_type,
         status,
         COUNT(*) AS count,
         COALESCE(SUM(stars_amount), 0) AS total_stars
       FROM purchases
       WHERE created_at >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
       GROUP BY item_type, status
       ORDER BY item_type, status`,
      [days],
    ),
    client.query(
      `SELECT
         DATE(created_at) AS day,
         item_type,
         COUNT(*) AS completed,
         COALESCE(SUM(stars_amount), 0) AS stars_revenue
       FROM purchases
       WHERE status = 'completed'
         AND created_at >= CURRENT_DATE - INTERVAL '13 days'
       GROUP BY DATE(created_at), item_type
       ORDER BY day DESC, item_type`,
    ),
    client.query(
      `WITH paying_users AS (
         SELECT
           user_id,
           COUNT(*) AS purchase_count,
           SUM(stars_amount) AS lifetime_stars
         FROM purchases
         WHERE status = 'completed'
         GROUP BY user_id
         HAVING COUNT(*) > 0
       )
       SELECT
         COUNT(*) AS paying_users,
         ROUND(AVG(purchase_count), 1) AS avg_purchases,
         ROUND(AVG(lifetime_stars), 1) AS avg_lifetime_stars,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY lifetime_stars) AS median_lifetime_stars
       FROM paying_users`,
    ),
    client.query(
      `SELECT
         DATE(created_at) AS day,
         COUNT(*) FILTER (WHERE status = 'pending') AS pending,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed,
         COUNT(*) FILTER (WHERE status = 'failed') AS failed,
         ROUND(
           COUNT(*) FILTER (WHERE status = 'completed') * 100.0
           / NULLIF(COUNT(*), 0),
           2
         ) AS completion_pct
       FROM purchases
       WHERE created_at >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
       GROUP BY DATE(created_at)
       ORDER BY day DESC`,
      [days],
    ),
    client.query(
      `SELECT
         context->>'itemType' AS item_type,
         COUNT(*) AS intent_count
       FROM audit_logs
       WHERE action = 'purchase_intent'
         AND created_at >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
       GROUP BY context->>'itemType'`,
      [days],
    ),
    client.query(
      `SELECT
         item_type,
         status,
         COUNT(*) AS payment_count,
         COALESCE(SUM(stars_amount), 0) AS total_stars
       FROM star_payments
       WHERE created_at >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
       GROUP BY item_type, status
       ORDER BY item_type, status`,
      [days],
    ),
  ]);

  const revenuePerUser = revenuePerUserResult.rows[0] || {};
  const intentsByItem = new Map(
    intentResult.rows.map((row) => [
      row.item_type,
      Number(row.intent_count || 0),
    ]),
  );
  const purchaseStepsByItem = new Map();
  const paymentStepsByItem = new Map();

  for (const row of funnelResult.rows) {
    const current = purchaseStepsByItem.get(row.item_type) || {
      purchaseRows: 0,
      purchasesPending: 0,
      purchasesCompleted: 0,
      purchasesFailed: 0,
      starsCompleted: 0,
    };

    const count = Number(row.count || 0);
    const totalStars = Number(row.total_stars || 0);
    current.purchaseRows += count;
    if (row.status === "pending") current.purchasesPending += count;
    if (row.status === "completed") {
      current.purchasesCompleted += count;
      current.starsCompleted += totalStars;
    }
    if (row.status === "failed") current.purchasesFailed += count;
    purchaseStepsByItem.set(row.item_type, current);
  }

  for (const row of paymentResult.rows) {
    const current = paymentStepsByItem.get(row.item_type) || {
      paymentRecordsTotal: 0,
      paymentRecordsCompleted: 0,
      starsCaptured: 0,
    };

    const count = Number(row.payment_count || 0);
    const totalStars = Number(row.total_stars || 0);
    current.paymentRecordsTotal += count;
    if (row.status === "completed") {
      current.paymentRecordsCompleted += count;
      current.starsCaptured += totalStars;
    }
    paymentStepsByItem.set(row.item_type, current);
  }

  const itemTypes = new Set([
    ...Object.keys(PRODUCT_CATALOG),
    ...Array.from(intentsByItem.keys()),
    ...Array.from(purchaseStepsByItem.keys()),
    ...Array.from(paymentStepsByItem.keys()),
  ]);

  return {
    purchaseStatusFunnel: funnelResult.rows.map((row) => ({
      itemType: row.item_type,
      status: row.status,
      count: Number(row.count || 0),
      totalStars: Number(row.total_stars || 0),
    })),
    completedByDay: completedByDayResult.rows.map((row) => ({
      day: row.day,
      itemType: row.item_type,
      completed: Number(row.completed || 0),
      starsRevenue: Number(row.stars_revenue || 0),
    })),
    revenuePerUser: {
      payingUsers: Number(revenuePerUser.paying_users || 0),
      avgPurchases: Number(revenuePerUser.avg_purchases || 0),
      avgLifetimeStars: Number(revenuePerUser.avg_lifetime_stars || 0),
      medianLifetimeStars: Number(revenuePerUser.median_lifetime_stars || 0),
    },
    purchaseIntentsByItem: Array.from(intentsByItem.entries()).map(
      ([itemType, intentCount]) => ({
        itemType,
        intentCount,
      }),
    ),
    paymentRecordsByItem: paymentResult.rows.map((row) => ({
      itemType: row.item_type,
      status: row.status,
      paymentCount: Number(row.payment_count || 0),
      totalStars: Number(row.total_stars || 0),
    })),
    funnelByItem: Array.from(itemTypes)
      .sort((a, b) => a.localeCompare(b))
      .map((itemType) => {
        const intentCount = intentsByItem.get(itemType) || 0;
        const purchase = purchaseStepsByItem.get(itemType) || {
          purchaseRows: 0,
          purchasesPending: 0,
          purchasesCompleted: 0,
          purchasesFailed: 0,
          starsCompleted: 0,
        };
        const payments = paymentStepsByItem.get(itemType) || {
          paymentRecordsTotal: 0,
          paymentRecordsCompleted: 0,
          starsCaptured: 0,
        };

        return {
          itemType,
          buyRequestCount: intentCount,
          purchaseRows: purchase.purchaseRows,
          purchasesPending: purchase.purchasesPending,
          purchasesCompleted: purchase.purchasesCompleted,
          purchasesFailed: purchase.purchasesFailed,
          paymentRecordsCompleted: payments.paymentRecordsCompleted,
          starsCompleted: purchase.starsCompleted,
          starsCaptured: payments.starsCaptured,
          intentToPurchasePct: ratioPct(purchase.purchaseRows, intentCount),
          intentToCompletedPct: ratioPct(
            purchase.purchasesCompleted,
            intentCount,
          ),
          purchaseToCompletedPct: ratioPct(
            purchase.purchasesCompleted,
            purchase.purchaseRows,
          ),
          completedToPaymentPct: ratioPct(
            payments.paymentRecordsCompleted,
            purchase.purchasesCompleted,
          ),
        };
      }),
    stepCoverage: {
      trackedSteps: [
        "purchase_intent",
        "purchase_row_created",
        "purchase_status_pending",
        "purchase_status_completed",
        "purchase_status_failed",
        "payment_record_completed",
      ],
      missingSteps: [
        "shop_open",
        "invoice_link_created",
        "payment_confirm_duplicate",
        "payment_confirm_failure",
      ],
    },
    completionByDay: conversionByDayResult.rows.map((row) => ({
      day: row.day,
      pending: Number(row.pending || 0),
      completed: Number(row.completed || 0),
      failed: Number(row.failed || 0),
      completionPct: Number(row.completion_pct || 0),
    })),
  };
}

async function getEconomyHealthSlice(client) {
  const [playersResult, yesterdayResult, questsResult] = await Promise.all([
    client.query(
      `SELECT
         p.user_id,
         p.energy,
         p.depression_level,
         p.commits_total,
         COALESCE(pl.xp_total, 0) AS xp_total
       FROM progression p
       LEFT JOIN player_levels pl ON pl.user_id = p.user_id`,
    ),
    client.query(
      `SELECT
         COUNT(*) AS yesterday_sessions,
         COUNT(DISTINCT user_id) AS yesterday_dau
       FROM sessions
       WHERE DATE(started_at) = CURRENT_DATE - INTERVAL '1 day'`,
    ),
    client.query(
      `SELECT
         COUNT(DISTINCT user_id) FILTER (WHERE completed = TRUE) AS completed_any,
         COUNT(DISTINCT user_id) AS total_users
       FROM daily_quests
       WHERE quest_date = CURRENT_DATE`,
    ),
  ]);

  const players = playersResult.rows.map((row) => {
    const resolved = resolveLevelState(Number(row.xp_total || 0));
    return {
      energy: Number(row.energy || 0),
      maxEnergy: Number(resolved.maxEnergy || 0),
      depressionLevel: Number(row.depression_level || 0),
      commitsTotal: Number(row.commits_total || 0),
      rank: Number(resolved.rank || 1),
    };
  });

  const energies = players.map((player) => player.energy).sort((a, b) => a - b);
  const depressionLevels = players.map((player) => player.depressionLevel);
  const commitsTotals = players.map((player) => player.commitsTotal);
  const rankMap = new Map();
  let lowEnergyUsers = 0;
  let highStressUsers = 0;
  let energySum = 0;
  let depressionSum = 0;
  let commitsSum = 0;
  let maxTotalCommits = 0;

  for (const player of players) {
    energySum += player.energy;
    depressionSum += player.depressionLevel;
    commitsSum += player.commitsTotal;
    maxTotalCommits = Math.max(maxTotalCommits, player.commitsTotal);

    if (player.maxEnergy > 0 && player.energy <= player.maxEnergy * 0.25) {
      lowEnergyUsers += 1;
    }
    if (player.depressionLevel >= 55) {
      highStressUsers += 1;
    }

    rankMap.set(player.rank, (rankMap.get(player.rank) || 0) + 1);
  }

  const yesterday = yesterdayResult.rows[0] || {};
  const todayQuests = questsResult.rows[0] || {};

  return {
    snapshot: {
      totalUsers: await getScalar(client, `SELECT COUNT(*) FROM users`),
      yesterdaySessions: Number(yesterday.yesterday_sessions || 0),
      yesterdayDau: Number(yesterday.yesterday_dau || 0),
      avgEnergy: average(energySum, players.length, 1),
      medianEnergy: percentile(energies, 0.5),
      lowEnergyUsers,
      avgDepression: average(depressionSum, depressionLevels.length, 1),
      highStressUsers,
      avgTotalCommits: average(commitsSum, commitsTotals.length, 0),
      maxTotalCommits,
      questAnyCompletionPct: ratioPct(
        Number(todayQuests.completed_any || 0),
        Number(todayQuests.total_users || 0),
      ),
    },
    rankDistribution: Array.from(rankMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([rank, playersCount]) => ({
        rank,
        players: playersCount,
      })),
  };
}

function buildOverviewLegacy(sqlSlices) {
  const byDay = sqlSlices.dauRetention.byDay;
  const today = byDay.find((row) => sameDay(row.day, new Date())) || null;
  const yesterday =
    byDay.find((row) => sameDay(row.day, addDays(new Date(), -1))) || null;

  return {
    newUsers: sum(
      sqlSlices.dauRetention.d1Retention.map((row) => row.cohortSize),
    ),
    totalUsers: sqlSlices.dauRetention.stickyFactor.totalUsers,
    dauToday: today?.dau || 0,
    dauYesterday:
      yesterday?.dau || sqlSlices.dauRetention.stickyFactor.yesterdayDau,
    dauAvgWindow: average(sum(byDay.map((row) => row.dau)), byDay.length, 2),
    sessionsTotal: sum(byDay.map((row) => row.sessionCount)),
    tapsTotal: sum(byDay.map((row) => row.tapsTotal)),
    commitsTotal: sum(byDay.map((row) => row.commitsTotal)),
  };
}

function buildOffersLegacy(sqlSlices) {
  return {
    byType: sqlSlices.contextOffers.impressionsByType.map((row) => ({
      offerType: row.offerType,
      source: "all",
      impressions: row.impressions,
      uniqueUsers: row.uniqueUsers,
    })),
    bySource: sqlSlices.contextOffers.sourceBreakdown.map((row) => ({
      offerType: row.offerType,
      source: row.source,
      impressions: row.impressions,
      uniqueUsers: row.uniqueUsers,
    })),
    dismiss: sqlSlices.contextOffers.dismissRateByType.map((row) => ({
      offerType: row.offerType,
      impressions: row.impressionUsers,
      dismissedImpressions: row.dismissUsers,
      dismissRatePct: row.dismissRatePct,
    })),
    conversion: sqlSlices.contextOffers.proxyConversionByType.map((row) => ({
      offerType: row.offerType,
      impressions: row.impressions,
      purchaseIntents: row.proxyConversions,
      completedPurchases: row.completedPurchases,
      intentRatePct: row.proxyCtrPct,
      completedRatePct: row.completedCtrPct,
    })),
    conversionBySource: sqlSlices.contextOffers.sourceConversionByType.map(
      (row) => ({
        offerType: row.offerType,
        source: row.source,
        impressionUsers: row.impressionUsers,
        purchaseIntentUsers: row.purchaseIntentUsers,
        completedPurchaseUsers: row.completedPurchaseUsers,
        purchaseIntentUserRatePct: row.purchaseIntentUserRatePct,
        completedPurchaseUserRatePct: row.completedPurchaseUserRatePct,
      }),
    ),
  };
}

function buildShopLegacy(sqlSlices) {
  return sqlSlices.shopPurchases.funnelByItem.map((row) => ({
    itemType: row.itemType,
    intentCount: row.buyRequestCount,
    purchasesTotal: row.purchaseRows,
    purchasesCompleted: row.purchasesCompleted,
    purchasesPending: row.purchasesPending,
    purchasesFailed: row.purchasesFailed,
    paymentRecordsCompleted: row.paymentRecordsCompleted,
    starsCompleted: row.starsCompleted,
    starsCaptured: row.starsCaptured,
    completionRatePct: row.purchaseToCompletedPct,
    intentToCompletedRatePct: row.intentToCompletedPct,
  }));
}

function buildQuestsLegacy(sqlSlices) {
  return {
    today: sqlSlices.dailyQuests.perQuestToday.map((row) => ({
      questType: row.questType,
      targetValue: row.targetValue,
      total: row.total,
      completed: row.completed,
      claimed: row.claimed,
      completionRatePct: row.completionPct,
      claimRatePct: row.claimPct,
    })),
    fullClear: sqlSlices.dailyQuests.fullClearByDate.map((row) => ({
      questDate: row.questDate,
      usersWithQuests: row.usersWithQuests,
      fullCompletedUsers: row.fullClearUsers,
      fullClaimedUsers: row.fullClaimUsers,
      fullCompletedRatePct: row.fullClearPct,
      fullClaimedRatePct: row.fullClaimPct,
    })),
    claimTiming: sqlSlices.dailyQuests.claimTiming,
  };
}

function buildPassLegacy(sqlSlices) {
  const distribution = sqlSlices.sprintPass.currentLevelDistribution;
  const players = sum(distribution.map((row) => row.players));
  const premiumPlayers = sum(distribution.map((row) => row.premiumPlayers));

  return {
    players,
    premiumPlayers,
    premiumConversionPct: ratioPct(premiumPlayers, players),
    avgLevel: average(
      sum(distribution.map((row) => row.currentLevel * row.players)),
      players,
      2,
    ),
    avgXp: average(
      sum(distribution.map((row) => row.avgXp * row.players)),
      players,
      2,
    ),
    levelDistribution: distribution.map((row) => ({
      currentLevel: row.currentLevel,
      players: row.players,
    })),
  };
}

function buildEventLegacy(sqlSlices) {
  const row = sqlSlices.weeklyHackathon.currentEventProgress[0];
  if (!row) {
    return null;
  }

  return {
    id: row.eventId,
    eventType: row.eventType,
    title: row.title,
    targetCommits: row.target,
    startDate: row.startDate,
    endDate: row.endDate,
    participants: row.participants,
    targetReached: row.targetReached,
    claimed: row.claimed,
    completionRatePct: row.completionPct,
    claimRatePct: ratioPct(row.claimed, row.participants),
    avgCommitsContributed: row.avgCommits,
    avgProgressPct: row.target ? ratioPct(row.avgCommits, row.target) : 0,
  };
}

function buildRetentionLegacy(sqlSlices) {
  return sqlSlices.dauRetention.d1Retention;
}

async function getScalar(client, query, params = []) {
  const result = await client.query(query, params);
  const value = result.rows[0] ? Object.values(result.rows[0])[0] : 0;
  return Number(value || 0);
}

function ratioPct(numerator, denominator) {
  if (!denominator) {
    return 0;
  }

  return Number(((numerator * 100) / denominator).toFixed(2));
}

function average(total, count, digits) {
  if (!count) {
    return 0;
  }

  return Number((total / count).toFixed(digits));
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) {
    return 0;
  }

  const index = (sortedValues.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sortedValues[lower];
  }

  const weight = index - lower;
  return Number(
    (sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight).toFixed(
      1,
    ),
  );
}

function sum(values) {
  return values.reduce((acc, value) => acc + Number(value || 0), 0);
}

function sameDay(value, date) {
  if (!value) {
    return false;
  }

  const left = new Date(value);
  return (
    left.getUTCFullYear() === date.getUTCFullYear() &&
    left.getUTCMonth() === date.getUTCMonth() &&
    left.getUTCDate() === date.getUTCDate()
  );
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export default router;
