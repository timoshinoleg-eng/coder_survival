/**
 * HTTP-level rate-limit middleware (draft for B4 / Phase C anti-abuse).
 *
 * IMPORTANT — name/duty separation:
 * `backend/src/middleware/rateLimit.js` already exists and implements the
 * **tap** limiter (DB-backed: per-user ~20 taps/sec with soft-ban, per-IP
 * 10k taps/day, tables `rate_limit_user` / `rate_limit_ip`). Do NOT replace it.
 *
 * This module is a different layer: HTTP route throttling via
 * `express-rate-limit@^7.5.1` (already a dependency). CodeQL's 125
 * `js/missing-rate-limiting` alerts are HTTP-route-level; the existing tap
 * limiter does not satisfy them because it is not an Express middleware.
 *
 * Uses the in-memory store — correct for the current SINGLE backend instance.
 * For multi-instance, swap to a Redis store.
 *
 * ⚠️ WIRING FOOTGUN: rate limiting keys on client IP. Behind a reverse proxy,
 * Express must have `trust proxy` configured correctly, otherwise every user
 * shares one bucket and a global limit blocks ALL traffic. Verify before
 * enabling in production.
 *
 * DRAFT: wire in backend/src/index.js (see B4_REPORT.md) after confirming
 * `trust proxy`, then load-test to tune the defaults.
 */
import rateLimit from 'express-rate-limit';

const env = process.env;

function num(name, fallback) {
  const v = Number(env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

// Global, per-IP ceiling. Generous enough for normal play, throttles brute force.
export const globalLimiter = rateLimit({
  windowMs: num('RL_GLOBAL_WINDOW_MS', 5 * 60 * 1000), // 5 min
  max: num('RL_GLOBAL_MAX', 600), // ~2 req/s sustained
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
});

// Stricter for reward-claiming endpoints (anti double-claim / farm).
export const rewardLimiter = rateLimit({
  windowMs: num('RL_REWARD_WINDOW_MS', 60 * 1000), // 1 min
  max: num('RL_REWARD_MAX', 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Reward rate limit reached.' },
});

// Stricter for referral / invite flows (anti referral-fraud).
export const referralLimiter = rateLimit({
  windowMs: num('RL_REFERRAL_WINDOW_MS', 60 * 1000),
  max: num('RL_REFERRAL_MAX', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Referral rate limit reached.' },
});

// Auth/initData exchange.
export const authLimiter = rateLimit({
  windowMs: num('RL_AUTH_WINDOW_MS', 60 * 1000),
  max: num('RL_AUTH_MAX', 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Auth rate limit reached.' },
});
