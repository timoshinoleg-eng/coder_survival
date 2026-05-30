export async function logDailyFarm(client, userId, locEarned, date = null) {
  const amount = Math.max(0, Math.floor(Number(locEarned || 0)));
  if (amount <= 0) return null;
  const farmDate = date || new Date().toISOString().slice(0, 10);
  await client.query(
    `INSERT INTO daily_farm_log (user_id, farm_date, loc_earned, updated_at)
     VALUES ($1, $2::date, $3, NOW())
     ON CONFLICT (user_id, farm_date) DO UPDATE SET
       loc_earned = daily_farm_log.loc_earned + EXCLUDED.loc_earned,
       updated_at = NOW()`,
    [userId, farmDate, amount]
  );
  return { userId, farmDate, locEarned: amount };
}

export async function getRollingAvgDailyFarm(client, userId) {
  const result = await client.query(
    `SELECT COALESCE(SUM(loc_earned), 0) AS total_loc
     FROM daily_farm_log
     WHERE user_id = $1
       AND farm_date >= CURRENT_DATE - INTERVAL '6 days'`,
    [userId]
  );
  return Math.floor(Number(result.rows[0]?.total_loc || 0) / 7);
}

export async function getDailyFarmSummary(client, userId) {
  const [avgDailyFarm, recentRows] = await Promise.all([
    getRollingAvgDailyFarm(client, userId),
    client.query(
      `SELECT farm_date, loc_earned
       FROM daily_farm_log
       WHERE user_id = $1
       ORDER BY farm_date DESC
       LIMIT 7`,
      [userId]
    )
  ]);

  return {
    avgDailyFarm,
    recent: recentRows.rows.map((row) => ({
      date: row.farm_date,
      locEarned: Number(row.loc_earned || 0)
    }))
  };
}
