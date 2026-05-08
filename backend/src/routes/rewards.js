import { Router } from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../index.js';
import { applyReward } from '../utils/rewards.js';
import { ensurePlayerLevel } from '../utils/vnext.js';

const router = Router();
const AD_REWARD_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const AD_REWARD_DAILY_LIMIT = 5;
const AD_SESSION_TTL_MINUTES = 5;

const REWARDED_ADS_ENABLED = process.env.ENABLE_MOCK_REWARDED_ADS === 'true';

function assertAdsEnabled(res) {
  if (!REWARDED_ADS_ENABLED) {
    res.status(503).json({ error: 'Ads not configured' });
    return false;
  }
  return true;
}

/**
 * POST /api/rewards/ad-session
 * Creates a server-verified nonce for a rewarded ad session.
 * Frontend must use this nonce when claiming the reward.
 */
router.post('/ad-session', async (req, res, next) => {
  if (!assertAdsEnabled(res)) return;
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  try {
    const client = await pool.connect();
    try {
      const userResult = await client.query(
        `SELECT id FROM users WHERE telegram_id = $1`,
        [telegramUser.id]
      );
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      const userId = userResult.rows[0].id;

      const nonce = randomUUID();
      const expiresAt = new Date(Date.now() + AD_SESSION_TTL_MINUTES * 60 * 1000);

      await client.query(
        `INSERT INTO ad_reward_sessions (nonce, user_id, expires_at, provider, reward_type)
         VALUES ($1, $2, $3, $4, $5)`,
        [nonce, userId, expiresAt, 'mock', 'ad_energy']
      );

      res.json({
        success: true,
        nonce,
        provider: 'mock',
        expiresAt: expiresAt.toISOString()
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
router.post('/ad-claim', async (req, res, next) => {
  if (!assertAdsEnabled(res)) return;
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  const { nonce, provider, proof } = req.body || {};
  if (!nonce) {
    return res.status(400).json({ error: 'nonce is required' });
  }

  // TODO (production SDK integration):
  // Validate provider proof here before applying reward.
  // Example for AdMob: verify SSV (Server-Side Verification) callback
  //   - Check signature against Google's public key
  //   - Verify nonce matches session.nonce
  //   - Verify reward_amount / custom_data
  // If proof is invalid: return 403 and do NOT mark nonce as used.
  // if (provider !== 'mock' && !verifyAdProof(provider, proof, nonce)) {
  //   return res.status(403).json({ error: 'Invalid ad proof' });
  // }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        `SELECT id FROM users WHERE telegram_id = $1`,
        [telegramUser.id]
      );
      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }
      const userId = userResult.rows[0].id;

      // 1. Validate nonce
      const sessionResult = await client.query(
        `SELECT nonce, user_id, expires_at, used_at, status
         FROM ad_reward_sessions
         WHERE nonce = $1
         FOR UPDATE`,
        [nonce]
      );
      if (sessionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Invalid nonce' });
      }
      const session = sessionResult.rows[0];
      if (session.user_id !== userId) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Nonce does not belong to user' });
      }
      if (session.status !== 'pending' || session.used_at) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Nonce already used' });
      }
      if (new Date(session.expires_at) < new Date()) {
        await client.query('ROLLBACK');
        return res.status(410).json({ error: 'Nonce expired' });
      }

      // 2. Check daily limit
      const limitResult = await client.query(
        `SELECT count, last_rewarded_at
         FROM ad_rewards
         WHERE user_id = $1 AND date = CURRENT_DATE
         FOR UPDATE`,
        [userId]
      );
      const limitRow = limitResult.rows[0];
      const currentCount = limitRow ? parseInt(limitRow.count, 10) : 0;
      if (currentCount >= AD_REWARD_DAILY_LIMIT) {
        await client.query('ROLLBACK');
        return res.status(429).json({ error: 'Daily ad reward limit reached' });
      }

      // 3. Check cooldown
      if (limitRow?.last_rewarded_at) {
        const lastRewarded = new Date(limitRow.last_rewarded_at).getTime();
        if (Date.now() - lastRewarded < AD_REWARD_COOLDOWN_MS) {
          await client.query('ROLLBACK');
          return res.status(429).json({ error: 'Ad reward cooldown active' });
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
        [nonce]
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
        [userId, provider || 'mock', nonce]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        reward,
        remainingToday: AD_REWARD_DAILY_LIMIT - (currentCount + 1)
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
