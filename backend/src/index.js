import express from "express";
import pg from "pg";
import helmet from "helmet";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { initDataMiddleware } from "./middleware/initData.js";
import { errorHandler } from "./middleware/errorHandler.js";

import { startBalanceAuditJob } from "./jobs/balanceAudit.js";
import { buildDatabaseUrl, shouldExitOnUnexpectedDbError } from "./config/database.js";
import tapRouter from "./routes/tap.js";
import stateRouter from "./routes/state.js";
import buyRouter from "./routes/buy.js";
import leaderboardRouter from "./routes/leaderboard.js";
import generatorsRouter from './routes/generators.js';
import referralRouter from "./routes/referral.js";
import internalPaymentsRouter from "./routes/internalPayments.js";
import internalObservationRouter from "./routes/internalObservation.js";
import playerLevelRouter from "./routes/playerLevel.js";
import questsRouter from "./routes/quests.js";
import shopRouter from "./routes/shop.js";
import battleRouter from "./routes/battle.js";
import eventRouter from "./routes/event.js";
import eventsRouter from "./routes/events.js";
import passRouter from "./routes/pass.js";
import teamRouter from "./routes/team.js";
import offersRouter from "./routes/offers.js";
import rewardsRouter from "./routes/rewards.js";
import coffeeRouter from "./routes/coffee.js";
import teamBattleRouter from "./routes/teamBattle.js";
import skinsRouter from "./routes/skins.js";
import onboardingRouter from "./routes/onboarding.js";
import streakRouter from "./routes/streak.js";
import rewardedVideoRouter from "./routes/rewardedVideo.js";
import teamHackathonRouter from "./routes/teamHackathon.js";
import memeRouter from "./routes/meme.js";
import achievementsRouter from "./routes/achievements.js";
import appealRouter from './routes/appeal.js';
import minigameRouter from "./routes/minigame.js";
import dailySummaryRouter from "./routes/dailySummary.js";
import { startDailySummaryCron } from "./jobs/dailySummaryCron.js";
import { startTeamHackathonCron } from "./jobs/teamHackathonCron.js";

// Загружаем .env
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const { Pool } = pg;

// --- Конфигурация ---
const PORT = process.env.PORT || 3000;
const DATABASE_URL = buildDatabaseUrl(process.env);

// --- Пул соединений PostgreSQL ---
export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});
pool.on("error", (err) => {
  console.error("Unexpected DB error:", err);
  if (shouldExitOnUnexpectedDbError(process.env)) {
    process.exit(-1);
  }
});

// --- Express app ---
const app = express();
export { app };

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", async (req, res) => {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    res.json({
      status: "ok",
      db: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res
      .status(503)
      .json({ status: "error", db: "disconnected", error: err.message });
  }
});

// API routes
app.use("/api/tap", initDataMiddleware, tapRouter);
app.use("/api/state", initDataMiddleware, stateRouter);
app.use("/api/buy", initDataMiddleware, buyRouter);
app.use(
  "/api/leaderboard",
  (req, res, next) => {
    if (req.headers["x-telegram-init-data"]) {
      return initDataMiddleware(req, res, next);
    }
    req.telegramUser = null;
    next();
  },
  leaderboardRouter,
);
app.use("/api/referral", initDataMiddleware, referralRouter);
app.use('/api/generators', initDataMiddleware, generatorsRouter);
app.use("/api/internal/payments", internalPaymentsRouter);
app.use("/api/internal/observation", internalObservationRouter);
app.use("/api/player/level", initDataMiddleware, playerLevelRouter);
app.use("/api/quests", initDataMiddleware, questsRouter);
app.use("/api/shop", shopRouter);
app.use(
  "/api/battle",
  (req, res, next) => {
    if (req.path === "/distribute") {
      req.telegramUser = null;
      return next();
    }
    return initDataMiddleware(req, res, next);
  },
  battleRouter,
);
app.use("/api/event", initDataMiddleware, eventRouter);
app.use("/api/events", initDataMiddleware, eventsRouter);
app.use("/api/pass", initDataMiddleware, passRouter);
app.use("/api/team", initDataMiddleware, teamRouter);
app.use("/api/team/hackathon", initDataMiddleware, teamHackathonRouter);
app.use("/api/offers", initDataMiddleware, offersRouter);
app.use(
  "/api/rewards",
  (req, res, next) => {
    if (req.path === '/adsgram_callback' || req.path === '/propeller_callback') {
      req.telegramUser = null;
      return next();
    }
    return initDataMiddleware(req, res, next);
  },
  rewardsRouter,
);
app.use("/api/coffee", initDataMiddleware, coffeeRouter);
app.use("/api/team-battle", initDataMiddleware, teamBattleRouter);
app.use("/api/skins", initDataMiddleware, skinsRouter);
app.use("/api/onboarding", initDataMiddleware, onboardingRouter);
app.use("/api/streak", initDataMiddleware, streakRouter);
app.use("/api/rewarded-video", initDataMiddleware, rewardedVideoRouter);
app.use("/api/meme", initDataMiddleware, memeRouter);
app.use("/api/achievements", initDataMiddleware, achievementsRouter);
app.use('/api/appeal', initDataMiddleware, appealRouter);
app.use("/api/minigame", initDataMiddleware, minigameRouter);
app.use("/api/daily-summary", initDataMiddleware, dailySummaryRouter);

// Error handler
app.use(errorHandler);

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing pool...");
  await pool.end();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, closing pool...");
  await pool.end();
  process.exit(0);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  app.listen(PORT, () => {
    console.log(`Coder Survival API running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  });
  startBalanceAuditJob();
  startDailySummaryCron();
  startTeamHackathonCron();
}
