import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://111.88.254.2';
const API_URL = process.env.API_URL || 'http://localhost:3000';

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN not set');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Команда /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from?.username || msg.from?.first_name || 'Программист';
  
  await bot.sendMessage(chatId, 
    `🎮 Привет, ${username}!\n\n` +
    `Добро пожаловать в Coder Survival — игру, где ты выживаешь как программист.\n\n` +
    `Тапай, пиши коммиты, пей кофе и не дай депрессии победить! ☕💻\n\n` +
    `Нажми кнопку ниже, чтобы начать:`,
    {
      reply_markup: {
        inline_keyboard: [[{
          text: "🎮 Играть в Coder Survival",
          web_app: { url: WEBAPP_URL }
        }]]
      }
    }
  );
});

// Команда /help
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  
  await bot.sendMessage(chatId,
    `📖 *Как играть:*\n\n` +
    `1️⃣ Тапай по экрану, чтобы писать коммиты\n` +
    `2️⃣ Следи за энергией — она заканчивается!\n` +
    `3️⃣ Не дай депрессии достичь 100%\n` +
    `4️⃣ Покупай кофе и энергетики за ⭐\n` +
    `5️⃣ Соревнуйся с другими программистами\n\n` +
    `*Команды:*\n` +
    `/start — Начать игру\n` +
    `/stats — Твоя статистика\n` +
    `/leaderboard — Топ игроков\n` +
    `/help — Помощь`,
    { parse_mode: 'Markdown' }
  );
});

// Команда /stats
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  try {
    const response = await fetch(`${API_URL}/api/state`, {
      headers: {
        'X-Telegram-Init-Data': generateInitData(userId, msg.from)
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch stats');
    }
    
    const data = await response.json();
    const game = data.game;
    
    await bot.sendMessage(chatId,
      `📊 *Твоя статистика:*\n\n` +
      `👤 Уровень: ${game.tier}\n` +
      `💻 Коммитов: ${game.commits_total}\n` +
      `⚡ Энергия: ${game.energy}%\n` +
      `😰 Депрессия: ${game.depression_level}%\n` +
      `🔥 Стрик: ${game.streak_days} дней`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Не удалось загрузить статистику. Попробуй позже.');
  }
});

// Команда /leaderboard
bot.onText(/\/leaderboard/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const response = await fetch(`${API_URL}/api/leaderboard?limit=10`);
    const data = await response.json();
    
    let text = '🏆 *Топ программистов:*\n\n';
    data.leaderboard.forEach((player, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '•';
      text += `${medal} ${player.rank}. ${player.username} — ${player.commits} коммитов (ур. ${player.tier})\n`;
    });
    
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Не удалось загрузить leaderboard.');
  }
});

// Обработка pre_checkout_query (Telegram Stars)
bot.on('pre_checkout_query', async (query) => {
  await bot.answerPreCheckoutQuery(query.id, true);
});

// Обработка successful_payment
bot.on('successful_payment', async (msg) => {
  const chatId = msg.chat.id;
  const payment = msg.successful_payment;
  
  try {
    // Отправляем информацию о платеже на бэкенд
    const response = await fetch(`${API_URL}/api/buy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': generateInitData(msg.from.id, msg.from)
      },
      body: JSON.stringify({
        item_id: payment.invoice_payload,
        stars_amount: payment.total_amount
      })
    });
    
    if (response.ok) {
      await bot.sendMessage(chatId, 
        `✅ *Покупка успешна!*\n\n` +
        `Ты приобрёл: ${payment.invoice_payload}\n` +
        `Потрачено: ${payment.total_amount} ⭐`,
        { parse_mode: 'Markdown' }
      );
    } else {
      throw new Error('Backend update failed');
    }
  } catch (error) {
    await bot.sendMessage(chatId, 
      '⚠️ Платёж прошёл, но не удалось обновить баланс. Обратись в поддержку.'
    );
  }
});

// Генерация initData для API запросов
function generateInitData(userId, user) {
  // В production это должна быть реальная initData строка
  // Здесь заглушка для примера
  return `user=${encodeURIComponent(JSON.stringify({
    id: userId,
    username: user?.username,
    first_name: user?.first_name,
    last_name: user?.last_name
  }))}`;
}

console.log('Coder Survival Bot started');
console.log('WebApp URL:', WEBAPP_URL);
