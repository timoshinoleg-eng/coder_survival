/**
 * Weekly leagues: Bronze -> Legend by commits earned in the ISO week
 * (sessions.commits_earned). Snapshots run every Monday 00:05 UTC for the
 * previous week and grant internal stars (progression.stars).
 */
export const LEAGUES = [
  { id: 'bronze', min: 0, rewardStars: 10, title: 'Бронза' },
  { id: 'silver', min: 500, rewardStars: 25, title: 'Серебро' },
  { id: 'gold', min: 2000, rewardStars: 50, title: 'Золото' },
  { id: 'platinum', min: 6000, rewardStars: 100, title: 'Платина' },
  { id: 'diamond', min: 15000, rewardStars: 200, title: 'Алмаз' },
  { id: 'legend', min: 40000, rewardStars: 500, title: 'Легенда' },
];

export function getLeagueForCommits(weeklyCommits) {
  const commits = Math.max(0, Math.floor(Number(weeklyCommits) || 0));
  let league = LEAGUES[0];
  let next = null;
  for (let i = 0; i < LEAGUES.length; i += 1) {
    if (commits >= LEAGUES[i].min) {
      league = LEAGUES[i];
      next = LEAGUES[i + 1] || null;
    }
  }
  return { league, next, commits };
}

export function getLeagueById(id) {
  return LEAGUES.find((l) => l.id === id) || null;
}

/** Monday (UTC) of the week containing `date`. */
export function getWeekMonday(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day);
  return d;
}

/**
 * Snapshot the finished week [weekStart, weekStart + 7d): write placements
 * (idempotent via UNIQUE(user_id, week_start)) and grant tier rewards.
 * Returns { placed, rewarded, byTier }.
 */
export async function snapshotLeagueWeek(client, weekStart) {
  const weekStartDate = weekStart instanceof Date
    ? weekStart.toISOString().slice(0, 10)
    : String(weekStart).slice(0, 10);

  const scored = await client.query(
    `SELECT s.user_id, SUM(s.commits_earned)::int AS weekly_commits
     FROM sessions s
     WHERE s.started_at >= $1::date AND s.started_at < ($1::date + INTERVAL '7 days')
     GROUP BY s.user_id
     HAVING SUM(s.commits_earned) > 0
     ORDER BY weekly_commits DESC`,
    [weekStartDate]
  );

  let placed = 0;
  let rewarded = 0;
  const byTier = {};

  for (let i = 0; i < scored.rows.length; i += 1) {
    const row = scored.rows[i];
    const userId = row.user_id;
    const weeklyCommits = Number(row.weekly_commits);
    const placement = i + 1;
    const { league } = getLeagueForCommits(weeklyCommits);
    byTier[league.id] = (byTier[league.id] || 0) + 1;

    const insert = await client.query(
      `INSERT INTO league_placements (user_id, league_tier, week_start, weekly_commits, placement, reward_stars)
       VALUES ($1, $2, $3::date, $4, $5, $6)
       ON CONFLICT (user_id, week_start) DO NOTHING
       RETURNING id`,
      [userId, league.id, weekStartDate, weeklyCommits, placement, league.rewardStars]
    );
    if (insert.rows.length === 0) continue; // already snapshotted (idempotent rerun)
    placed += 1;

    if (league.rewardStars > 0) {
      await client.query(
        `UPDATE progression SET stars = stars + $2, updated_at = NOW() WHERE user_id = $1`,
        [userId, league.rewardStars]
      );
      rewarded += 1;
    }
  }

  return { placed, rewarded, byTier };
}
