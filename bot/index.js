// LEGACY POLLING ENTRYPOINT — not the production path.
// Production bot runtime is the Vercel webhook handler at api/webhook.js.
// This file is kept only for local debugging and requires ENABLE_POLLING_BOT=true.
import 'dotenv/config';
import { createBot, WEBAPP_URL } from './src/createBot.js';

if (process.env.ENABLE_POLLING_BOT !== 'true') {
  console.error('Polling bot runtime is disabled. Production uses Vercel webhook at bot/api/webhook.js.');
  console.error('Set ENABLE_POLLING_BOT=true only for explicit local debugging.');
  process.exit(1);
}

const bot = createBot();

bot.start({
  onStart: () => {
    console.log('Coder Survival Bot started');
    console.log('WebApp URL:', WEBAPP_URL);
  }
});

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`Received ${signal}, stopping bot...`);
  await bot.stop();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
