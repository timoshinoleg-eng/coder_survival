import { Router } from "express";
import { randomUUID } from "crypto";
import { pool } from "../index.js";
import { applyReward } from "../utils/rewards.js";
import { ensurePlayerLevel } from "../utils/vnext.js";
import { verifyAdProof } from "../utils/adProof.js";

const router = Router();
const AD_REWARD_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const AD_REWARD_DAILY_LIMIT = 5;
const AD_SESSION_TTL_MINUTES = 15;
const ALLOWED_PROVIDERS = new Set(["mock", "google", "unity", "admob"]);

const MOCK_REWARDED_ADS_ENABLED =
  process.env.ENABLE_MOCK_REWARDED_ADS === "true";

function getRequestedProvider(req) {
  const provider = req.body?.provider;
  if (typeof provider === "string" && provider.trim()) {
    return provider.trim().toLowerCase();
  }
  return null;
}

function isProviderConfigured(provider) {
  switch (provider) {
    case "mock":
      return process.env.NODE_ENV === "qa" && MOCK_REWARDED_ADS_ENABLED;
    case "google":
    case "admob":
      return true;
    case "unity":
      return Boolean(process.env.UNITY_REWARDED_SECRET);
    default:
      return false;
  }
}

function validateProvider(req, res) {
  const provider = getRequestedProvider(req);
  if (!provider || !ALLOWED_PROVIDERS.has(provider)) {
    res.status(400).json({
      error: "provider must be one of: mock, google, unity, admob",
    });
    return null;
  }
  if (provider === "mock" && process.env.NODE_ENV !== "qa") {
    res.status(403).json({ error: "mock provider is disabled outside qa" });
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
      const userResult = await client.query(
        `SELECT id FROM users WHERE telegram_id = $1`,
        [telegramUser.id],
      );
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      const userId = userResult.rows[0].id;

      const nonce = randomUUID();
      const expiresAt = new Date(
        Date.now() + AD_SESSION_TTL_MINUTES * 60 * 1000,
      );

      await client.query(
        `INSERT INTO ad_reward_sessions (nonce, user_id, expires_at, provider, reward_type)
         VALUES ($1, $2, $3, $4, $5)`,
        [nonce, userId, expiresAt, provider, "ad_energy"],
      );

      res.json({
        success: true,
        nonce,
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

      const userResult = await client.query(
        `SELECT id FROM users WHERE telegram_id = $1`,
        [telegramUser.id],
      );
      if (userResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "User not found" });
      }
      const userId = userResult.rows[0].id;

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
      if (session.user_id !== userId) {
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

      // 2. Check daily limit
      const limitResult = await client.query(
        `SELECT count, last_rewarded_at
         FROM ad_rewards
         WHERE user_id = $1 AND date = CURRENT_DATE
         FOR UPDATE`,
        [userId],
      );
      const limitRow = limitResult.rows[0];
      const currentCount = limitRow ? parseInt(limitRow.count, 10) : 0;
      if (currentCount >= AD_REWARD_DAILY_LIMIT) {
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

      // 5. Apply reward
      const reward = { energy: rewardEnergy };
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
        reward,
        remainingToday: AD_REWARD_DAILY_LIMIT - (currentCount + 1),
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

export default router;
