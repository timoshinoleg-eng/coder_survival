import express from 'express';
import pg from 'pg';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { initDataMiddleware } from './middleware/initData.js';
import { errorHandler } from './middleware/errorHandler.js';

import tapRouter from './routes/tap.js';
import stateRouter from './routes/state.js';
import buyRouter from './routes/buy.js';
import leaderboardRouter from './routes/leaderboard.js';
import referralRouter from './routes/referral.js';
import internalPaymentsRouter from './routes/internalPayments.js';
import internalObservationRouter from './routes/internalObservation.js';
import playerLevelRouter from './routes/playerLevel.js';
import questsRouter from './routes/quests.js';
import shopRouter from './routes/shop.js';
import battleRouter from './routes/battle.js';
import eventRouter from './routes/event.js';
import passRouter from './routes/pass.js';
import teamRouter from './routes/team.js';
import offersRouter from './routes/offers.js';
import rewardsRouter from './routes/rewards.js';

// Загружаем .env
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const { Pool } = pg;

// --- Конфигурация ---
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || 
  `postgresql://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

// --- Пул соединений PostgreSQL ---
export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});
pool.on('error', (err) => {
  console.error('Unexpected DB error:', err);
  process.exit(-1);
});

// --- Express app ---
const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

// API routes
app.use('/api/tap', initDataMiddleware, tapRouter);
app.use('/api/state', initDataMiddleware, stateRouter);
app.use('/api/buy', initDataMiddleware, buyRouter);
app.use('/api/leaderboard', (req, res, next) => {
  if (req.headers['x-telegram-init-data']) {
    return initDataMiddleware(req, res, next);
  }
  req.telegramUser = null;
  next();
}, leaderboardRouter);
app.use('/api/referral', initDataMiddleware, referralRouter);
app.use('/api/internal/payments', internalPaymentsRouter);
app.use('/api/internal/observation', internalObservationRouter);
app.use('/api/player/level', initDataMiddleware, playerLevelRouter);
app.use('/api/quests', initDataMiddleware, questsRouter);
app.use('/api/shop', shopRouter);
app.use('/api/battle', initDataMiddleware, battleRouter);
app.use('/api/event', initDataMiddleware, eventRouter);
app.use('/api/pass', initDataMiddleware, passRouter);
app.use('/api/team', initDataMiddleware, teamRouter);
app.use('/api/offers', initDataMiddleware, offersRouter);
app.use('/api/rewards', initDataMiddleware, rewardsRouter);

// Error handler
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing pool...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing pool...');
  await pool.end();
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

app.listen(PORT, () => {
  console.log(`Coder Survival API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
