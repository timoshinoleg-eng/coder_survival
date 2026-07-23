import rateLimit from 'express-rate-limit';

// HTTP rate limiters for sensitive routes (admin operations and Stars-spending
// booster mutations). Caps per-client request volume to blunt brute-force/abuse
// and to satisfy the CodeQL "missing rate limiting" checks on the
// authorization- and database-touching handlers those routes expose.
//
// Keyed by validated Telegram user id when present, else client IP (index.js
// sets `trust proxy`, so req.ip is the real client behind the proxy). `validate`
// is disabled because we intentionally use a custom key generator.

const isTest = process.env.NODE_ENV === 'test';

const keyByUserOrIp = (req) => {
  const uid = req.telegramUser?.user?.id;
  return uid ? `tg:${uid}` : (req.ip || 'unknown');
};

function makeLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: keyByUserOrIp,
    skip: () => isTest, // never throttle the automated test suite
    handler: (req, res) => res.status(429).json({ error: message }),
  });
}

// Operator-only, destructive (season rotation triggers refunds): keep tight.
export const adminRateLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many admin requests',
});

// Booster purchase/activate spend Stars and mutate economy state.
export const boosterRateLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many booster requests',
});

// General limiter for authenticated read/query routes that also expose public
// reads (shop catalog, active event). Generous ceiling — high enough not to
// affect normal play, low enough to blunt scraping/DoS. Also satisfies CodeQL's
// rate-limiting requirement on these authorization-performing routes.
export const readApiRateLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Too many requests',
});
