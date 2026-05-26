import net from 'node:net';

/**
 * Rate limiting для taps.
 * - Per-user: max 15 taps/sec (soft ban > 25/sec)
 * - Per-IP: max 10,000 taps/day
 */
export async function checkTapRateLimit(client, userId, ipAddress, tapIncrement = 1) {
  if (!userId) {
    return { allowed: false, status: 401, payload: { error: 'User not authenticated' } };
  }
  tapIncrement = Math.max(1, Math.min(20, Math.floor(Number(tapIncrement) || 1)));

  const MAX_TAPS_PER_SECOND = parseInt(process.env.RATE_LIMIT_MAX_TAPS_PER_SECOND, 10) || 20;
  const SOFT_BAN_THRESHOLD = parseInt(process.env.RATE_LIMIT_SOFT_BAN_THRESHOLD, 10) || 40;
  const DAILY_CAP_PER_IP = parseInt(process.env.RATE_LIMIT_DAILY_CAP_PER_IP, 10) || 10000;

  const userResult = await client.query(
    `INSERT INTO rate_limit_user (user_id, tap_count, window_start)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       tap_count = CASE
         WHEN rate_limit_user.window_start < NOW() - INTERVAL '2 seconds'
         THEN $2
         ELSE rate_limit_user.tap_count + $2
       END,
       window_start = CASE
         WHEN rate_limit_user.window_start < NOW() - INTERVAL '2 seconds'
         THEN NOW()
         ELSE rate_limit_user.window_start
       END
     RETURNING tap_count`,
    [userId, tapIncrement]
  );

  const userTapCount = userResult.rows[0].tap_count;

  if (userTapCount > SOFT_BAN_THRESHOLD) {
    console.warn('[RateLimit] Soft ban triggered for user', userId, 'tapCount:', userTapCount);
    return {
      allowed: false,
      status: 429,
      payload: { error: 'Rate limit exceeded (soft ban)', retryAfter: 60, type: 'soft_ban' }
    };
  }

  const effectiveBurstLimit = Math.max(MAX_TAPS_PER_SECOND, tapIncrement);
  if (userTapCount > effectiveBurstLimit) {
    console.warn('[RateLimit] Burst limit triggered for user', userId, 'tapCount:', userTapCount);
    return {
      allowed: false,
      status: 429,
      payload: { error: 'Rate limit exceeded', retryAfter: 1, type: 'burst_limit' }
    };
  }

  const safeIpAddress = normalizeIp(ipAddress);
  const ipResult = await client.query(
    `INSERT INTO rate_limit_ip (ip_address, tap_date, tap_count)
     VALUES ($1::inet, CURRENT_DATE, $2)
     ON CONFLICT (ip_address, tap_date) DO UPDATE SET
       tap_count = rate_limit_ip.tap_count + $2
     RETURNING tap_count`,
    [safeIpAddress, tapIncrement]
  );

  const ipTapCount = ipResult.rows[0].tap_count;

  if (ipTapCount > DAILY_CAP_PER_IP) {
    console.warn('[RateLimit] Daily IP cap triggered for IP', safeIpAddress, 'count:', ipTapCount);
    return {
      allowed: false,
      status: 429,
      payload: { error: 'Daily tap limit exceeded for this IP', retryAfter: 86400, type: 'daily_cap' }
    };
  }

  return {
    allowed: true,
    info: { userTapCount, ipTapCount, maxPerSecond: MAX_TAPS_PER_SECOND, dailyCap: DAILY_CAP_PER_IP }
  };
}

function normalizeIp(ipAddress) {
  const first = String(ipAddress || '127.0.0.1').split(',')[0].trim();
  const normalized = first.replace(/^::ffff:/, '') || '127.0.0.1';
  return net.isIP(normalized) ? normalized : '127.0.0.1';
}
