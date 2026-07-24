import 'dotenv/config';
import { webhookCallback } from 'grammy';
import { createBot, WEBAPP_URL } from '../src/createBot.js';

const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

console.log('Coder Survival Bot webhook handler loaded');
console.log('WebApp URL:', WEBAPP_URL);

// SECURITY (fail-closed): the webhook MUST verify Telegram's
// X-Telegram-Bot-Api-Secret-Token header. Without a configured secret, grammY
// would accept unauthenticated updates, letting anyone forge bot events. If the
// secret is missing we refuse to process any update instead of running open.
let handler;
if (!secretToken) {
  console.error(
    '[webhook] TELEGRAM_WEBHOOK_SECRET is not set — refusing to process webhook ' +
      'updates. Set the secret (and register it via setWebhook) to enable the bot.',
  );
  handler = (req, res) => {
    res.status(503).json({ error: 'Webhook secret not configured' });
  };
} else {
  const bot = createBot();
  handler = webhookCallback(bot, 'https', { secretToken });
}

export default handler;
