import 'dotenv/config';
import { webhookCallback } from 'grammy';
import { createBot, WEBAPP_URL } from '../src/createBot.js';

const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
const bot = createBot();

console.log('Coder Survival Bot webhook handler loaded');
console.log('WebApp URL:', WEBAPP_URL);

export default webhookCallback(bot, 'https', secretToken ? { secretToken } : undefined);
