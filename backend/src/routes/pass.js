import { Router } from 'express';
import { pool } from '../index.js';
import { getPassStatus, claimPassReward, unlockPremiumPass, getActivePass } from '../utils/pass.js';
import { getXpSourcesAggregate } from '../utils/passXpLog.js';

const router = Router();

router.get(['/', '/status'], async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  let client;
  try {
    client = await pool.connect();
    const userResult = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramUser.id]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userResult.rows[0].id;
    const passStatus = await getPassStatus(client, userId);
    if (!passStatus) return res.json({ success: true, status: null });
    return res.json({ ...passStatus, success: true, status: passStatus });
  } catch (err) {
    console.error('Pass GET error:', err);
    return res.status(500).json({ error: 'Технический сбой' });
  } finally {
    if (client) client.release();
  }
});

router.post(['/claim/:level', '/claim'], async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  const level = Number(req.params.level || req.body?.level);
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    return res.status(400).json({ error: 'Неверный уровень' });
  }
  const track = req.body?.track || 'free';
  if (!['free', 'premium'].includes(track)) {
    return res.status(400).json({ error: 'Неверный трек' });
  }
  let client;
  try {
    client = await pool.connect();
    const userResult = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramUser.id]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userResult.rows[0].id;
    const result = await claimPassReward(client, userId, level, track);
    if (result.status !== 200) {
      return res.status(result.status).json({ error: result.error });
    }
    const passStatus = await getPassStatus(client, userId);
    return res.json({ level, track, reward: result.reward, applied: result.applied, pass: passStatus });
  } catch (err) {
    console.error('Pass claim error:', err);
    return res.status(500).json({ error: 'Технический сбой' });
  } finally {
    if (client) client.release();
  }
});

router.get('/xp-sources', async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  let client;
  try {
    client = await pool.connect();
    const userResult = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramUser.id]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userResult.rows[0].id;
    const pass = await getActivePass(client);
    if (!pass) return res.json({ quest: 0, minigame: 0, social: 0, tap: 0, other: 0 });
    const aggregates = await getXpSourcesAggregate(client, userId, pass.id);
    return res.json(aggregates);
  } catch (err) {
    console.error('Pass XP sources error:', err);
    return res.status(500).json({ error: 'Технический сбой' });
  } finally {
    if (client) client.release();
  }
});

export default router;
