import express from "express";
import pg from "pg";
import helmet from "helmet";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { initDataMiddleware } from "./middleware/initData.js";
import { adminAuthMiddleware } from "./middleware/adminAuth.js";
import { readApiRateLimiter } from "./middleware/apiRateLimit.js";
import { errorHandler } from "./middleware/errorHandler.js";

// Optional Telegram auth: validate initData when the header is present, else
// proceed unauthenticated (req.telegramUser = null). Routers behind this still
// enforce auth per-endpoint by checking req.telegramUser?.user, so public reads
// (catalogs, active event) work while mutations stay protected.
function optionalInitData(req, res, next) {
  if (req.headers["x-telegram-init-data"]) {
    return initDataMiddleware(req, res, next);
  }
  req.telegramUser = null;
  next();
}

import { startBalanceAuditJob } from "./jobs/balanceAudit.js";
import { buildDatabaseSslOptions, buildDatabaseUrl, shouldExitOnUnexpectedDbError } from "./config/database.js";
import tapRouter from "./routes/tap.js";
import stateRouter from "./routes/state.js";
import buyRouter from "./routes/buy.js";
import leaderboardRouter from "./routes/leaderboard.js";
import generatorsRouter from './routes/generators.js';
import referralRouter, { internalReferralRouter } from "./routes/referral.js";
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
import prestigeRouter from "./routes/prestige.js";
import analyticsRouter from "./routes/analytics.js";
import languagesRouter from "./routes/languages.js";
import walletRouter from "./routes/wallet.js";
import dailyBattleRouter from "./routes/dailyBattle.js";
import boostersRouter from "./routes/boosters.js";
import { startDailySummaryCron } from "./jobs/dailySummaryCron.js";
import { startDailyBattleCron } from "./jobs/dailyBattleCron.js";
import { startTeamHackathonCron } from "./jobs/teamHackathonCron.js";
import { startAchievementCron } from "./jobs/achievementCron.js";
import { startRandomEventCron } from "./jobs/randomEventCron.js";
import { startFlashSaleCron } from "./jobs/flashSaleCron.js";
import { startHealthAlert } from "./jobs/healthAlert.js";
import { startSeasonRotationCron } from "./jobs/seasonRotationCron.js";
import { startRetentionCleanupCron } from "./jobs/retentionCleanupCron.js";
import seasonAdminRouter from "./routes/seasonAdmin.js";

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
  max: Number(process.env.DB_POOL_MAX || 50),
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
  ssl: buildDatabaseSslOptions(process.env),
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
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "https://bridge.tonapi.io", "https://tonapi.io", "wss://bridge.tonapi.io"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
// CORS allowlist.
// Telegram WebView origins (t.me / telegram.org) are always allowed. Production
// front-end origins must be configured explicitly via FRONTEND_URL and/or
// CORS_ALLOWED_ORIGINS (comma-separated). The permissive `*.vercel.app` preview
// origin is NOT allowed by default — it lets any attacker-controlled Vercel
// project make credentialed cross-origin requests. It is re-enabled only when
// an operator opts in with ALLOW_VERCEL_PREVIEW_ORIGINS=true, and as a
// backward-compatibility fallback when NO explicit front-end origin is
// configured (so an un-migrated deployment does not break — a warning is
// logged on boot instead).
const isProd = process.env.NODE_ENV === "production";
const explicitOrigins = [
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ...(process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
    : []),
];
const allowVercelPreviews =
  process.env.ALLOW_VERCEL_PREVIEW_ORIGINS === "true" || explicitOrigins.length === 0;
if (allowVercelPreviews && process.env.ALLOW_VERCEL_PREVIEW_ORIGINS !== "true") {
  console.warn(
    "[cors] No FRONTEND_URL/CORS_ALLOWED_ORIGINS configured — falling back to " +
      "allowing *.vercel.app origins. Set CORS_ALLOWED_ORIGINS to your production " +
      "origin(s) to close this.",
  );
}
const corsWhitelist = [
  /^https?:\/\/([a-zA-Z0-9-]+\.)?t\.me$/,
  /^https?:\/\/([a-zA-Z0-9-]+\.)?telegram\.org$/,
  ...(allowVercelPreviews ? [/^https?:\/\/([a-zA-Z0-9-]+\.)?vercel\.app$/] : []),
  ...(isProd ? [] : ["http://localhost:5173", "http://127.0.0.1:5173"]),
  ...explicitOrigins,
];
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin / non-browser (no Origin header) requests.
      if (!origin || corsWhitelist.some((w) => (typeof w === "string" ? origin === w : w.test(origin)))) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "64kb" }));

// Health check
app.get("/health", async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    await client.query("SELECT 1");
    res.json({
      status: "ok",
      db: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res
      .status(503)
      .json({ status: "error", db: "disconnected", error: err.message });
  } finally {
    if (client) {
      client.release();
    }
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
app.use("/api/internal/referral", internalReferralRouter);
app.use("/api/internal/payments", internalPaymentsRouter);
app.use("/api/internal/observation", internalObservationRouter);
app.use("/api/player/level", initDataMiddleware, playerLevelRouter);
app.use("/api/player", initDataMiddleware, playerLevelRouter);
app.use("/api/quests", initDataMiddleware, questsRouter);
// Shop: catalog/active-sales are public reads; purchase-deal/opened enforce auth
// inside the router (they require req.telegramUser?.user).
app.use("/api/shop", readApiRateLimiter, optionalInitData, shopRouter);
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
// Event: /active is a public read; claim/resolve enforce auth inside the router.
app.use("/api/event", readApiRateLimiter, optionalInitData, eventRouter);
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
app.use("/api/daily-battle", initDataMiddleware, dailyBattleRouter);
app.use("/api/prestige", initDataMiddleware, prestigeRouter);
app.use("/api/analytics", initDataMiddleware, analyticsRouter);
app.use("/api/boosters", initDataMiddleware, boostersRouter);
app.use("/api/languages", initDataMiddleware, languagesRouter);
app.use("/api/wallet", initDataMiddleware, walletRouter);
app.use("/api/admin/season", adminAuthMiddleware, seasonAdminRouter);

// Error handler
app.use(errorHandler);

// Graceful shutdown: stop accepting new connections, drain in-flight
// requests, then close the pool. Hard-exit fallback guards against
// keep-alive sockets holding the process open.
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS || 10000);

async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  const forceExit = setTimeout(() => {
    console.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  if (server) {
    await new Promise((resolve) => server.close(resolve));
    console.log("HTTP server closed");
  }
  await pool.end();
  console.log("DB pool closed");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);

let server = null;

if (isEntrypoint) {
  server = app.listen(PORT, () => {
    console.log(`Coder Survival API running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  });
  startBalanceAuditJob();
  startDailySummaryCron();
  startDailyBattleCron();
  startTeamHackathonCron();
  startAchievementCron();
  startRandomEventCron();
  startFlashSaleCron();
  startHealthAlert();
  startSeasonRotationCron();
  startRetentionCleanupCron();
}
