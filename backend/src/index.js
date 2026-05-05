import express from 'express';
import pg from 'pg';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { initDataMiddleware } from './middleware/initData.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/errorHandler.js';

import tapRouter from './routes/tap.js';
import stateRouter from './routes/state.js';
import buyRouter from './routes/buy.js';
import leaderboardRouter from './routes/leaderboard.js';
import referralRouter from './routes/referral.js';

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
app.use('/api/tap', initDataMiddleware, rateLimitMiddleware, tapRouter);
app.use('/api/state', initDataMiddleware, stateRouter);
app.use('/api/buy', initDataMiddleware, buyRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/referral', initDataMiddleware, referralRouter);

// Error handler
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing pool...');
  await pool.end();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Coder Survival API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
