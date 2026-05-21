import { Router } from 'express';
import { pool } from '../index.js';
import { renderMeme, MEME_TEMPLATE_IDS } from '../utils/memeRenderer.js';
import { signMemeToken, verifyMemeToken } from '../utils/memeToken.js';
import { recordMemeShare } from '../utils/memeAnalytics.js';
import { memeRateLimit } from '../middleware/memeRateLimit.js';
import { getActivePass } from '../utils/pass.js';
import { logPassXp } from '../utils/passXpLog.js';

const router = Router();

// In-memory LRU cache: key -> { buffer, createdAt }
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;

function getCacheKey(userId, templateId, format) {
  return `${userId}:${templateId}:${format}`;
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.buffer;
}

function setCached(key, buffer) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, { buffer, createdAt: Date.now() });
}

async function fetchUserStats(client, telegramId) {
  const userResult = await client.query(
    `SELECT id, username FROM users WHERE telegram_id = $1`,
    [telegramId]
  );
  if (userResult.rows.length === 0) {
    return null;
  }
  const user = userResult.rows[0];

  const progResult = await client.query(
    `SELECT tier, commits_total, streak_days, depression_level, energy
     FROM progression WHERE user_id = $1`,
    [user.id]
  );
  const prog = progResult.rows[0] || {};

  const tierNames = { 1: 'Junior', 2: 'Middle', 3: 'Senior', 4: 'Lead', 5: 'CTO' };

  return {
    userId: user.id,
    username: user.username,
    rankName: tierNames[prog.tier] || 'Junior',
    commits: parseInt(prog.commits_total || 0),
    streakDays: prog.streak_days || 0,
    depression: prog.depression_level || 0,
    energy: prog.energy || 0,
    maxEnergy: 100, // Will be resolved from rankMeta if needed; 100 is safe default
  };
}

// GET /api/meme?templateId=...&format=1:1|9:16
router.get('/', memeRateLimit, async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  const templateId = req.query.templateId;
  const format = req.query.format === '9:16' ? '9:16' : '1:1';

  if (!templateId || !MEME_TEMPLATE_IDS.includes(templateId)) {
    return res.status(400).json({ error: 'Invalid or missing templateId' });
  }

  const cacheKey = getCacheKey(telegramUser.id, templateId, format);
  const cached = getCached(cacheKey);
  if (cached) {
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=300');
    res.set('X-Meme-Template', templateId);
    return res.send(cached);
  }

  const client = await pool.connect();
  try {
    const stats = await fetchUserStats(client, telegramUser.id);
    if (!stats) {
      return res.status(404).json({ error: 'User not found' });
    }

    const pngBuffer = await renderMeme(templateId, format, stats);
    setCached(cacheKey, pngBuffer);

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=300');
    res.set('X-Meme-Template', templateId);
    res.send(pngBuffer);
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
});

// POST /api/meme/share
router.post('/share', memeRateLimit, async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'No user in initData' });
  }

  const { templateId, format, sharedTo } = req.body || {};
  if (!templateId || !MEME_TEMPLATE_IDS.includes(templateId)) {
    return res.status(400).json({ error: 'Invalid templateId' });
  }

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
    await recordMemeShare(client, userId, templateId, format || '1:1', sharedTo);

    const activePass = await getActivePass(client);
    if (activePass) {
      await logPassXp(client, userId, activePass.id, 'social', 15, { templateId, format, sharedTo });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
});

// POST /api/meme/token — internal endpoint for bot to generate public share tokens
router.post('/token', async (req, res) => {
  const secret = req.headers['x-bot-backend-secret'];
  if (!secret || secret !== process.env.BOT_BACKEND_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { userId, templateId, format } = req.body || {};
  if (!userId || !templateId || !MEME_TEMPLATE_IDS.includes(templateId)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  try {
    const token = signMemeToken({ userId: Number(userId), templateId, format: format || '1:1' });
    res.json({ token });
  } catch (err) {
    console.error('Token signing error:', err);
    res.status(500).json({ error: 'Token generation failed' });
  }
});

// GET /api/meme/public/:token — bot share flow, no initData required
router.get('/public/:token', async (req, res, next) => {
  const payload = verifyMemeToken(req.params.token);
  if (!payload) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  const { userId, templateId, format } = payload;

  if (!MEME_TEMPLATE_IDS.includes(templateId)) {
    return res.status(400).json({ error: 'Invalid templateId' });
  }

  const cacheKey = getCacheKey(userId, templateId, format);
  const cached = getCached(cacheKey);
  if (cached) {
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=300');
    res.set('X-Meme-Template', templateId);
    return res.send(cached);
  }

  const client = await pool.connect();
  try {
    const stats = await fetchUserStats(client, userId);
    if (!stats) {
      return res.status(404).json({ error: 'User not found' });
    }

    const pngBuffer = await renderMeme(templateId, format, stats);
    setCached(cacheKey, pngBuffer);

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=300');
    res.set('X-Meme-Template', templateId);
    res.send(pngBuffer);
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
});

export default router;
