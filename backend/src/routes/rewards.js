import { Router } from "express";
import { randomUUID } from "crypto";
import { pool } from "../index.js";
import { DEFAULTS } from "../config/balance.js";
import { evaluateFtueAdAvailability } from "../utils/adsPolicy.js";
import { applyLocPenalty, normalizeAntiCheatState } from '../utils/anticheat.js';
import { updateDailyQuestStateForEvent } from '../utils/dailyQuests.js';
import { applyReward } from "../utils/rewards.js";
import { ensurePlayerLevel } from "../utils/vnext.js";
import { verifyAdProof, verifyAdsgramCallbackSignature, verifyPropellerCallbackHash } from "../utils/adProof.js";

const router = Router();
const AD_REWARD_COOLDOWN_MS = DEFAULTS.ADS.adCooldownMinutes * 60 * 1000;
const MAX_ADS_PER_DAY = DEFAULTS.ADS.maxPerDay;
const AD_SESSION_TTL_MINUTES = 15;
const ALLOWED_PROVIDERS = new Set(["mock", "google", "unity", "admob", "adsgram", "propeller"]);

function areMockRewardedAdsEnabled() {
  return process.env.ENABLE_MOCK_REWARDED_ADS === "true";
}

function getRequestedProvider(req) {
  const provider = req.body?.provider;
  if (typeof provider === "string" && provider.trim()) {
    return provider.trim().toLowerCase();
  }
  return null;
}

function areSameUserId(left, right) {
  // PostgreSQL bigint columns are returned as strings by node-postgres, while
  // serial user IDs are numbers. Preserve strict ownership semantics without
  // rejecting the same database ID solely because of driver representation.
  return String(left) === String(right);
}

function isProviderConfigured(provider) {
  switch (provider) {
    case "mock":
      return (process.env.NODE_ENV === "qa" || process.env.NODE_ENV === "test") && areMockRewardedAdsEnabled();
    case "google":
    case "admob":
      return true;
    case "unity":
      return Boolean(process.env.UNITY_REWARDED_SECRET);
    case "adsgram":
      return Boolean(process.env.ADSGRAM_SECRET);
    case "propeller":
      return Boolean(process.env.PROPELLER_SECRET);
    default:
      return false;
  }
}

function getAdNetwork(req) {
  const value = req.body?.ad_network;
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

function getEventId(req) {
  const value = req.body?.event_id;
  return typeof value === "string" ? value.trim() : null;
}

async function ensureRewardUser(client, telegramUser) {
  const userResult = await client.query(
    `SELECT id, created_at FROM users WHERE telegram_id = $1`,
    [telegramUser.id],
  );
  return userResult.rows[0] || null;
}

async function claimValidatedAdSession(client, { userId, nonce, provider, proof = null }) {
  await client.query("BEGIN");

  try {

  const sessionResult = await client.query(
    `SELECT nonce, user_id, provider, created_at, expires_at, used_at, status
     FROM ad_reward_sessions
     WHERE nonce = $1
     FOR UPDATE`,
    [nonce],
  );
  if (sessionResult.rows.length === 0) {
    await client.query("ROLLBACK");
    return { status: 404, payload: { error: "Invalid ad event" } };
  }

  const session = sessionResult.rows[0];
  if (!areSameUserId(session.user_id, userId)) {
    await client.query("ROLLBACK");
    return { status: 403, payload: { error: "Ad event does not belong to user" } };
  }
  if (session.provider !== provider) {
    await client.query("ROLLBACK");
    return {
      status: 409,
      payload: { error: "Provider mismatch", expectedProvider: session.provider },
    };
  }
  if ((provider === 'adsgram' || provider === 'propeller') ? session.status !== 'verified' || session.used_at : session.status !== "pending" || session.used_at) {
    await client.query("ROLLBACK");
    return { status: 409, payload: { error: "Ad event already used" } };
  }
  const createdAtMs = new Date(session.created_at).getTime();
  const maxAgeMs = AD_SESSION_TTL_MINUTES * 60 * 1000;
  if (
    !Number.isFinite(createdAtMs) ||
    Date.now() - createdAtMs > maxAgeMs ||
    new Date(session.expires_at).getTime() < Date.now()
  ) {
    await client.query("ROLLBACK");
    return { status: 410, payload: { error: "Ad event expired" } };
  }

  const requiresProof = provider !== "adsgram" && provider !== "propeller";
  if (requiresProof && !(await verifyAdProof(getVerifierProvider(provider), proof, nonce))) {
    await client.query("ROLLBACK");
    return { status: 403, payload: { error: "Invalid ad proof" } };
  }

  // Create the daily ledger row before locking it. Without this seed, two first
  // claims can both observe an absent row and bypass cooldown/limit checks.
  await client.query(
    `INSERT INTO ad_rewards (user_id, date, count, provider)
     VALUES ($1, CURRENT_DATE, 0, $2)
     ON CONFLICT (user_id, date) DO NOTHING`,
    [userId, provider],
  );
  const limitResult = await client.query(
    `SELECT count, last_rewarded_at
     FROM ad_rewards
     WHERE user_id = $1 AND date = CURRENT_DATE
     FOR UPDATE`,
    [userId],
  );
  const limitRow = limitResult.rows[0];
  const currentCount = limitRow ? parseInt(limitRow.count, 10) : 0;
  if (currentCount >= MAX_ADS_PER_DAY) {
    await client.query("ROLLBACK");
    return { status: 429, payload: { error: "Daily ad reward limit reached" } };
  }

  if (limitRow?.last_rewarded_at) {
    const lastRewarded = new Date(limitRow.last_rewarded_at).getTime();
    if (Date.now() - lastRewarded < AD_REWARD_COOLDOWN_MS) {
      await client.query("ROLLBACK");
      return { status: 429, payload: { error: "Ad reward cooldown active" } };
    }
  }

  const level = await ensurePlayerLevel(client, userId);
  const maxEnergy = level.resolved.maxEnergy;
  const antiCheatResult = await client.query(
    `SELECT anti_cheat_state FROM progression WHERE user_id = $1`,
    [userId],
  );
  const antiCheatState = normalizeAntiCheatState(antiCheatResult.rows[0]?.anti_cheat_state || {});
  const rewardEnergy = applyLocPenalty(Math.floor(maxEnergy * 0.5), antiCheatState.banScore);
  const rewardCoffeeCoins = applyLocPenalty(1, antiCheatState.banScore);
  await applyReward(client, userId, {
    energy: rewardEnergy,
    inventory: { coffee_coins: rewardCoffeeCoins },
  });
  await updateDailyQuestStateForEvent(client, userId, 'watch_ad', 1).catch(() => null);

  await client.query(
    `UPDATE ad_reward_sessions
     SET used_at = NOW(), status = 'used'
     WHERE nonce = $1`,
    [nonce],
  );

  await client.query(
    `UPDATE ad_rewards
     SET count = count + 1,
         last_rewarded_at = NOW(),
         provider = $2,
         proof_id = $3
     WHERE user_id = $1 AND date = CURRENT_DATE`,
    [userId, provider, nonce],
  );

  await client.query("COMMIT");
  return {
    status: 200,
    payload: {
      success: true,
      reward: { energy: rewardEnergy, coffeeCoins: rewardCoffeeCoins },
      energy_granted: rewardEnergy,
      coffee_coins_granted: rewardCoffeeCoins,
      ads_remaining_today: MAX_ADS_PER_DAY - (currentCount + 1),
      remainingToday: MAX_ADS_PER_DAY - (currentCount + 1),
    },
  };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

function validateProvider(req, res) {
  const provider = getRequestedProvider(req);
  if (!provider || !ALLOWED_PROVIDERS.has(provider)) {
    res.status(400).json({
      error: "provider must be one of: mock, google, unity, admob, adsgram, propeller",
    });
    return null;
  }
  if (provider === "mock" && process.env.NODE_ENV !== "qa" && process.env.NODE_ENV !== "test") {
    res.status(403).json({ error: "mock provider is disabled outside qa/test" });
    return null;
  }
  if (!isProviderConfigured(provider)) {
    res.status(503).json({ error: "Ads not configured", provider });
    return null;
  }
  return provider;
}

function getVerifierProvider(provider) {
  if (provider === "google") {
    return "admob";
  }
  return provider;
}

/**
 * GET /api/rewards/status
 * Returns the same availability data used by the secure ad session/claim flow.
 */
router.get("/status", async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: "No user in initData" });

  try {
    const client = await pool.connect();
    try {
      const user = await ensureRewardUser(client, telegramUser);
      if (!user?.id) return res.status(404).json({ error: "User not found" });
      const rewardCount = await client.query(
        `SELECT count, last_rewarded_at
         FROM ad_rewards
         WHERE user_id = $1 AND date = CURRENT_DATE`,
        [user.id],
      );
      const row = rewardCount.rows[0] || {};
      const countToday = Number(row.count || 0);
      const ftue = evaluateFtueAdAvailability({
        createdAt: user.created_at,
        adsClaimedToday: countToday,
        now: new Date(),
      });
      const cooldownSeconds = row.last_rewarded_at
        ? Math.max(0, Math.ceil((AD_REWARD_COOLDOWN_MS - (Date.now() - new Date(row.last_rewarded_at).getTime())) / 1000))
        : 0;
      return res.json({
        countToday,
        remainingToday: Math.max(0, MAX_ADS_PER_DAY - countToday),
        dailyLimit: MAX_ADS_PER_DAY,
        cooldownSeconds,
        adAvailability: ftue,
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/rewards/ad-session
 * Creates a server-verified nonce for a rewarded ad session.
 * Frontend must use this nonce when claiming the reward.
 */
router.post("/ad-session", async (req, res, next) => {
  const provider = validateProvider(req, res);
  if (!provider) return;
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: "No user in initData" });
  }

  try {
    const client = await pool.connect();
    try {
      const user = await ensureRewardUser(client, telegramUser);
      if (!user?.id) {
        return res.status(404).json({ error: "User not found" });
      }

      const rewardCount = await client.query(
        `SELECT count FROM ad_rewards WHERE user_id = $1 AND date = CURRENT_DATE`,
        [user.id],
      );
      const ftue = evaluateFtueAdAvailability({
        createdAt: user.created_at,
        adsClaimedToday: Number(rewardCount.rows[0]?.count || 0),
        now: new Date(),
      });
      if (!ftue.allowed) {
        return res.status(403).json({ error: ftue.reason, rule: ftue.rule });
      }

      const nonce = randomUUID();
      const expiresAt = new Date(
        Date.now() + AD_SESSION_TTL_MINUTES * 60 * 1000,
      );

      await client.query(
        `INSERT INTO ad_reward_sessions (nonce, user_id, expires_at, provider, reward_type)
         VALUES ($1, $2, $3, $4, $5)`,
         [nonce, user.id, expiresAt, provider, "ad_energy"],
      );

      res.json({
        success: true,
        nonce,
        event_id: nonce,
        provider,
        expiresAt: expiresAt.toISOString(),
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/rewards/ad-claim
 * Claims the reward after ad completion.
 * Requires a valid nonce and enforces daily limits + cooldowns.
 */
router.post("/ad-claim", async (req, res, next) => {
  const claimProvider = validateProvider(req, res);
  if (!claimProvider) return;
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: "No user in initData" });
  }

  const { nonce, proof } = req.body || {};
  if (!nonce) {
    return res.status(400).json({ error: "nonce is required" });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const user = await ensureRewardUser(client, telegramUser);
      if (!user?.id) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "User not found" });
      }
      const userId = user.id;

      // 1. Validate nonce
      const sessionResult = await client.query(
        `SELECT nonce, user_id, provider, created_at, expires_at, used_at, status
         FROM ad_reward_sessions
         WHERE nonce = $1
         FOR UPDATE`,
        [nonce],
      );
      if (sessionResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Invalid nonce" });
      }
      const session = sessionResult.rows[0];
      if (!areSameUserId(session.user_id, userId)) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "Nonce does not belong to user" });
      }
      if (session.provider !== claimProvider) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "Provider mismatch",
          expectedProvider: session.provider,
        });
      }
      if (session.status !== "pending" || session.used_at) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Nonce already used" });
      }
      const createdAtMs = new Date(session.created_at).getTime();
      const maxAgeMs = AD_SESSION_TTL_MINUTES * 60 * 1000;
      if (
        !Number.isFinite(createdAtMs) ||
        Date.now() - createdAtMs > maxAgeMs ||
        new Date(session.expires_at).getTime() < Date.now()
      ) {
        await client.query("ROLLBACK");
        return res.status(410).json({ error: "Nonce expired" });
      }
      if (
        !(await verifyAdProof(getVerifierProvider(claimProvider), proof, nonce))
      ) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "Invalid ad proof" });
      }

      // 2. Seed and lock the daily ledger. A missing row cannot be locked, so
      // concurrent first claims would otherwise all bypass cooldown checks.
      await client.query(
        `INSERT INTO ad_rewards (user_id, date, count, provider)
         VALUES ($1, CURRENT_DATE, 0, $2)
         ON CONFLICT (user_id, date) DO NOTHING`,
        [userId, claimProvider],
      );
      const limitResult = await client.query(
        `SELECT count, last_rewarded_at
         FROM ad_rewards
         WHERE user_id = $1 AND date = CURRENT_DATE
         FOR UPDATE`,
        [userId],
      );
      const limitRow = limitResult.rows[0];
      const currentCount = limitRow ? parseInt(limitRow.count, 10) : 0;
      if (currentCount >= MAX_ADS_PER_DAY) {
        await client.query("ROLLBACK");
        return res.status(429).json({ error: "Daily ad reward limit reached" });
      }

      // 3. Check cooldown
      if (limitRow?.last_rewarded_at) {
        const lastRewarded = new Date(limitRow.last_rewarded_at).getTime();
        if (Date.now() - lastRewarded < AD_REWARD_COOLDOWN_MS) {
          await client.query("ROLLBACK");
          return res.status(429).json({ error: "Ad reward cooldown active" });
        }
      }

      // 4. Compute reward
      const level = await ensurePlayerLevel(client, userId);
      const maxEnergy = level.resolved.maxEnergy;
      const rewardEnergy = Math.floor(maxEnergy * 0.5);
      const rewardCoffeeCoins = 1;

      // 5. Apply reward
      const reward = { energy: rewardEnergy, inventory: { coffee_coins: rewardCoffeeCoins } };
      await applyReward(client, userId, reward);

      // 6. Mark nonce used
      await client.query(
        `UPDATE ad_reward_sessions
         SET used_at = NOW(), status = 'used'
         WHERE nonce = $1`,
        [nonce],
      );

      // 7. Update daily tracking
      await client.query(
        `INSERT INTO ad_rewards (user_id, date, count, last_rewarded_at, provider, proof_id)
         VALUES ($1, CURRENT_DATE, 1, NOW(), $2, $3)
         ON CONFLICT (user_id, date) DO UPDATE SET
           count = ad_rewards.count + 1,
           last_rewarded_at = NOW(),
           provider = EXCLUDED.provider,
           proof_id = EXCLUDED.proof_id`,
        [userId, claimProvider, nonce],
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        reward: { energy: rewardEnergy, coffeeCoins: rewardCoffeeCoins },
        remainingToday: MAX_ADS_PER_DAY - (currentCount + 1),
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/rewards/ad_complete
 * Prompt v11.1 contract wrapper. `event_id` is the server-created ad session nonce.
 */
router.post("/ad_complete", async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: "No user in initData" });
  }

  const eventId = getEventId(req);
  const adNetwork = getAdNetwork(req);
  if (!eventId) {
    return res.status(400).json({ error: "event_id is required" });
  }
  if (!adNetwork || !ALLOWED_PROVIDERS.has(adNetwork)) {
    return res.status(400).json({ error: "ad_network must be one of: adsgram, propeller" });
  }
  if (adNetwork !== "adsgram" && adNetwork !== "propeller") {
    return res.status(400).json({ error: "ad_network must be one of: adsgram, propeller" });
  }
  if (!isProviderConfigured(adNetwork)) {
    return res.status(503).json({ error: "Ads not configured", ad_network: adNetwork });
  }

  try {
    const client = await pool.connect();
    try {
      const user = await ensureRewardUser(client, telegramUser);
      if (!user?.id) {
        return res.status(404).json({ error: "User not found" });
      }
      const rewardCount = await client.query(
        `SELECT count FROM ad_rewards WHERE user_id = $1 AND date = CURRENT_DATE`,
        [user.id],
      );
      const ftue = evaluateFtueAdAvailability({
        createdAt: user.created_at,
        adsClaimedToday: Number(rewardCount.rows[0]?.count || 0),
        now: new Date(),
      });
      if (!ftue.allowed) {
        return res.status(403).json({ error: ftue.reason, rule: ftue.rule });
      }
      const result = await claimValidatedAdSession(client, {
        userId: user.id,
        nonce: eventId,
        provider: adNetwork,
        proof: req.body?.proof || null,
      });
      return res.status(result.status).json(result.payload);
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/adsgram_callback', async (req, res, next) => {
  const signature = req.headers['x-adsgram-signature'];
  const secret = process.env.ADSGRAM_SECRET;
  if (!verifyAdsgramCallbackSignature(req.body || {}, typeof signature === 'string' ? signature : '', secret)) {
    return res.status(403).json({ error: 'Invalid AdsGram signature' });
  }

  const eventId = typeof req.body?.event_id === 'string' ? req.body.event_id.trim() : '';
  if (!eventId) {
    return res.status(400).json({ error: 'event_id is required' });
  }

  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `UPDATE ad_reward_sessions
         SET status = 'verified'
         WHERE nonce = $1
           AND provider = 'adsgram'
           AND status = 'pending'
         RETURNING nonce`,
        [eventId]
      );
      return res.json({ success: true, verified: result.rows.length > 0, idempotent: result.rows.length === 0 });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/propeller_callback', async (req, res, next) => {
  const eventId = typeof (req.body?.event_id ?? req.query?.event_id) === 'string' ? String(req.body?.event_id ?? req.query?.event_id).trim() : '';
  const userId = typeof (req.body?.user_id ?? req.query?.user_id) === 'string' || typeof (req.body?.user_id ?? req.query?.user_id) === 'number'
    ? String(req.body?.user_id ?? req.query?.user_id).trim()
    : '';
  const hash = typeof (req.body?.hash ?? req.query?.hash) === 'string' ? String(req.body?.hash ?? req.query?.hash).trim() : '';
  if (!verifyPropellerCallbackHash({ eventId, userId, hash, secret: process.env.PROPELLER_SECRET })) {
    return res.status(403).json({ error: 'Invalid Propeller hash' });
  }
  if (!eventId) {
    return res.status(400).json({ error: 'event_id is required' });
  }

  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `UPDATE ad_reward_sessions
         SET status = 'verified'
         WHERE nonce = $1
           AND provider = 'propeller'
           AND status = 'pending'
         RETURNING nonce`,
        [eventId]
      );
      return res.json({ success: true, verified: result.rows.length > 0, idempotent: result.rows.length === 0 });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
