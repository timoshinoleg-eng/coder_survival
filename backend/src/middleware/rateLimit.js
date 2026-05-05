import { pool } from '../index.js';

/**
 * Middleware: rate limiting для taps
 * - Per-user: max 15 taps/sec (soft ban > 25/sec)
 * - Per-IP: max 10,000 taps/day
 */
export async function rateLimitMiddleware(req, res, next) {
  const userId = req.telegramUser?.user?.id;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  
  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  const MAX_TAPS_PER_SECOND = parseInt(process.env.RATE_LIMIT_MAX_TAPS_PER_SECOND, 10) || 15;
  const SOFT_BAN_THRESHOLD = parseInt(process.env.RATE_LIMIT_SOFT_BAN_THRESHOLD, 10) || 25;
  const DAILY_CAP_PER_IP = parseInt(process.env.RATE_LIMIT_DAILY_CAP_PER_IP, 10) || 10000;

  try {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // 1. Per-user burst rate limit (1-second window)
      const userResult = await client.query(
        `INSERT INTO rate_limit_user (user_id, tap_count, window_start)
         VALUES ($1, 1, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           tap_count = CASE 
             WHEN rate_limit_user.window_start < NOW() - INTERVAL '1 second' 
             THEN 1 
             ELSE rate_limit_user.tap_count + 1 
           END,
           window_start = CASE 
             WHEN rate_limit_user.window_start < NOW() - INTERVAL '1 second' 
             THEN NOW() 
             ELSE rate_limit_user.window_start 
           END
         RETURNING tap_count`,
        [userId]
      );

      const userTapCount = userResult.rows[0].tap_count;

      // Soft ban check (> 25/sec)
      if (userTapCount > SOFT_BAN_THRESHOLD) {
        await client.query('ROLLBACK');
        return res.status(429).json({ 
          error: 'Rate limit exceeded (soft ban)', 
          retryAfter: 60,
          type: 'soft_ban'
        });
      }

      // Hard limit check (> 15/sec)
      if (userTapCount > MAX_TAPS_PER_SECOND) {
        await client.query('ROLLBACK');
        return res.status(429).json({ 
          error: 'Rate limit exceeded', 
          retryAfter: 1,
          type: 'burst_limit'
        });
      }

      // 2. Per-IP daily cap
      const ipResult = await client.query(
        `INSERT INTO rate_limit_ip (ip_address, tap_date, tap_count)
         VALUES ($1::inet, CURRENT_DATE, 1)
         ON CONFLICT (ip_address, tap_date) DO UPDATE SET
           tap_count = rate_limit_ip.tap_count + 1
         RETURNING tap_count`,
        [ipAddress]
      );

      const ipTapCount = ipResult.rows[0].tap_count;

      if (ipTapCount > DAILY_CAP_PER_IP) {
        await client.query('ROLLBACK');
        return res.status(429).json({ 
          error: 'Daily tap limit exceeded for this IP', 
          retryAfter: 86400,
          type: 'daily_cap'
        });
      }

      await client.query('COMMIT');
      
      // Сохраняем rate limit info в request для логирования
      req.rateLimit = {
        userTapCount,
        ipTapCount,
        maxPerSecond: MAX_TAPS_PER_SECOND,
        dailyCap: DAILY_CAP_PER_IP
      };

      next();
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Rate limit check failed:', err);
    // В случае ошибки rate limiter — пропускаем (fail open для dev)
    // В production лучше fail closed
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({ error: 'Rate limit check failed' });
    }
    next();
  }
}
