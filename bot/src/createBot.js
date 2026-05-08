import { Bot, InlineKeyboard } from 'grammy';

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://frontend-ashy-alpha-77.vercel.app';
const API_URL = process.env.API_URL;
if (!API_URL) {
  throw new Error('API_URL not set');
}
const BOT_BACKEND_SECRET = process.env.BOT_BACKEND_SECRET;

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN not set');
}

export function createBot() {
  const bot = new Bot(BOT_TOKEN);

  bot.command('start', async (ctx) => {
    const username = ctx.from?.username || ctx.from?.first_name || 'Программист';
    const keyboard = new InlineKeyboard().webApp('Играть в Coder Survival', WEBAPP_URL);

    await ctx.reply(
      `Привет, ${username}!\n\n` +
        'Добро пожаловать в Coder Survival — игру, где ты выживаешь как программист.\n\n' +
        'Тапай, пиши коммиты, пей кофе и не дай выгоранию победить.\n\n' +
        'Нажми кнопку ниже, чтобы начать:',
      { reply_markup: keyboard }
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      'Как играть:\n\n' +
        '1. Тапай по экрану, чтобы писать коммиты.\n' +
        '2. Следи за энергией.\n' +
        '3. Не доводи выгорание до максимума.\n' +
        '4. Соревнуйся с другими программистами.\n\n' +
        'Команды:\n' +
        '/start — открыть игру\n' +
        '/leaderboard — топ игроков\n' +
        '/help — помощь'
    );
  });

  bot.command('leaderboard', async (ctx) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      let response;
      try {
        response = await fetch(`${API_URL}/api/leaderboard?limit=10`, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) throw new Error(`Leaderboard failed: ${response.status}`);
      const data = await response.json();
      const players = data.players || data.leaderboard || [];

      const lines = players.map((player, index) => {
        const medal = index === 0 ? '1.' : index === 1 ? '2.' : index === 2 ? '3.' : `${player.rank}.`;
        const name = player.username || player.firstName || player.first_name || 'Anonymous';
        return `${medal} ${name} — ${player.commits} коммитов`;
      });

      await ctx.reply(lines.length ? `Топ программистов:\n\n${lines.join('\n')}` : 'Лидерборд пока пуст.');
    } catch (error) {
      console.error(error);
      await ctx.reply('Не удалось загрузить leaderboard. Попробуй позже.');
    }
  });

  bot.on('pre_checkout_query', async (ctx) => {
    const query = ctx.preCheckoutQuery;
    if (query.currency !== 'XTR') {
      await ctx.answerPreCheckoutQuery(false, { error_message: 'Поддерживаются только Telegram Stars.' });
      return;
    }
    await ctx.answerPreCheckoutQuery(true);
  });

  bot.on('message:successful_payment', async (ctx) => {
    const payment = ctx.message.successful_payment;
    console.log('successful_payment', {
      user_id: ctx.from?.id,
      payload: payment.invoice_payload,
      amount: payment.total_amount,
      currency: payment.currency,
      charge_id: payment.telegram_payment_charge_id
    });

    if (!BOT_BACKEND_SECRET) {
      console.error('BOT_BACKEND_SECRET not set; payment fulfillment skipped');
      await ctx.reply(
        `Покупка прошла: ${payment.invoice_payload}\n` +
          `Списано: ${payment.total_amount} Stars.\n\n` +
          'Платеж получен, но сервер подтверждения не настроен. Нужна ручная проверка.'
      );
      return;
    }

    const response = await fetch(`${API_URL}/api/internal/payments/telegram/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bot-Backend-Secret': BOT_BACKEND_SECRET
      },
      body: JSON.stringify({
        telegramUserId: ctx.from?.id,
        telegramPaymentChargeId: payment.telegram_payment_charge_id,
        providerPaymentChargeId: payment.provider_payment_charge_id || null,
        invoicePayload: payment.invoice_payload,
        totalAmount: payment.total_amount,
        currency: payment.currency,
        rawPayment: payment
      })
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      console.error('Payment fulfillment failed', response.status, payload);
      await ctx.reply(
        `Покупка прошла: ${payment.invoice_payload}\n` +
          `Списано: ${payment.total_amount} Stars.\n\n` +
          'Платеж получен, но подтверждение на сервере не прошло. Нужна ручная проверка.'
      );
      return;
    }

    await ctx.reply(
      `Покупка прошла: ${payment.invoice_payload}\n` +
        `Списано: ${payment.total_amount} Stars.\n\n` +
        (payload?.idempotent
          ? 'Платеж уже был обработан ранее.'
          : 'Предмет успешно начислен.')
    );
  });

  bot.catch((err) => {
    console.error('Bot error:', err.error);
  });

  return bot;
}

export { WEBAPP_URL, API_URL };
