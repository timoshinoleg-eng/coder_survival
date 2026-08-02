const buckets = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

export function memeRateLimit(req, res, next) {
  const userId = req.telegramUser?.user?.id || req.ip || 'anonymous';
  const now = Date.now();
  let bucket = buckets.get(userId);

  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(userId, bucket);
  }

  bucket.count += 1;

  if (bucket.count > MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    });
  }

  next();
}

// Simple cleanup every 5 minutes. The HTTP server keeps this useful in
// production; unref prevents a module import from keeping test processes alive.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now > bucket.resetAt) {
      buckets.delete(key);
    }
  }
}, 300_000);
cleanupTimer.unref();
