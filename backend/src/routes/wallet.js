import { Router } from 'express';
import { pool } from '../index.js';

const router = Router();

/**
 * POST /api/wallet/connect
 * Stores or updates the user's TON wallet address.
 * Body: { walletAddress: string }
 */
router.post('/connect', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  const { walletAddress } = req.body;
  if (!walletAddress || typeof walletAddress !== 'string') {
    return res.status(400).json({ error: 'walletAddress is required' });
  }

  // Basic TON address validation (user-friendly or raw form)
  const isValidAddress = /^[EeUu][QqRrWw][A-Za-z0-9+/_-]{46}$/.test(walletAddress);
  if (!isValidAddress) {
    return res.status(400).json({ error: 'Invalid TON wallet address format' });
  }

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

      await client.query(
        `UPDATE users
         SET ton_wallet_address = $2,
             ton_connected_at = NOW(),
             last_active = NOW()
         WHERE id = $1`,
        [userId, walletAddress]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        walletAddress,
        connectedAt: new Date().toISOString(),
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

/**
 * POST /api/wallet/verify
 * Verifies wallet ownership by requesting a signed message.
 * For now this is a placeholder that stores a nonce and returns it.
 * The frontend can later send the signed nonce back for verification.
 * Body: { walletAddress: string }
 */
router.post('/verify', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  const { walletAddress } = req.body;
  if (!walletAddress) {
    return res.status(400).json({ error: 'walletAddress is required' });
  }

  try {
    const nonce = `cs-verify:${telegramUser.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE users
         SET ton_wallet_nonce = $2,
             last_active = NOW()
         WHERE telegram_id = $1`,
        [telegramUser.id, nonce]
      );
    } finally {
      client.release();
    }

    res.json({
      success: true,
      nonce,
      message: `Verify Coder Survival wallet ownership: ${nonce}`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/wallet/status
 * Returns the connected TON wallet for the current user.
 */
router.get('/status', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT ton_wallet_address, ton_connected_at FROM users WHERE telegram_id = $1`,
        [telegramUser.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const row = result.rows[0];
      res.json({
        connected: !!row.ton_wallet_address,
        walletAddress: row.ton_wallet_address || null,
        connectedAt: row.ton_connected_at || null,
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
