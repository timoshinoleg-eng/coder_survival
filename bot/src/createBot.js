import { Bot, InlineKeyboard, InputFile } from 'grammy';
import {
  arePaymentsEnabled,
  decidePreCheckout,
  redactedDisabledPaymentNotice,
} from './payments.js';

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
    const startParam = typeof ctx.match === 'string'
      ? ctx.match
      : (ctx.start_param || ctx.startPayload || '');
    const username = ctx.from?.username || ctx.from?.first_name || 'Программист';
    const keyboard = new InlineKeyboard().webApp('Играть в Coder Survival', WEBAPP_URL);

    if (startParam.startsWith('ref_') && BOT_BACKEND_SECRET) {
      try {
        await fetch(`${API_URL}/api/internal/referral/track-bot-entry`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Bot-Backend-Secret': BOT_BACKEND_SECRET
          },
          body: JSON.stringify({
            telegramId: ctx.from?.id,
            username: ctx.from?.username || null,
            firstName: ctx.from?.first_name || null,
            lastName: ctx.from?.last_name || null,
            isPremium: ctx.from?.is_premium === true,
            referrerId: startParam.replace('ref_', ''),
            source: 'bot'
          })
        });
      } catch (err) {
        console.error('[Bot] Failed to track bot referral:', err?.message || err);
      }
    }

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
        '/meme — сгенерировать мем\n' +
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

  bot.command('bindchat', async (ctx) => {
    const chat = ctx.chat;
    const from = ctx.from;
    if (!chat || !from) {
      await ctx.reply('Не удалось определить чат или пользователя.');
      return;
    }
    if (chat.type === 'private') {
      await ctx.reply('Эту команду нужно отправить в рабочий групповой чат.');
      return;
    }
    if (!BOT_BACKEND_SECRET) {
      await ctx.reply('Секрет бота не настроен.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/daily-summary/internal/bind-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bot-Backend-Secret': BOT_BACKEND_SECRET
        },
        body: JSON.stringify({ chatId: chat.id, telegramUserId: from.id })
      });

      if (response.ok) {
        await ctx.reply('✅ Рабочий чат привязан. Ежедневная битва будет публиковаться здесь в 18:00 UTC.');
      } else {
        const text = await response.text();
        console.error('bindchat error:', response.status, text);
        await ctx.reply('Не удалось привязать чат. Попробуй позже.');
      }
    } catch (err) {
      console.error('bindchat exception:', err);
      await ctx.reply('Ошибка при привязке чата.');
    }
  });

  bot.command('meme', async (ctx) => {
    const keyboard = new InlineKeyboard()
      .text('Works on my machine', 'meme_template:works_on_my_machine')
      .text('Deploy on Friday', 'meme_template:deploy_friday')
      .row()
      .text('This is fine', 'meme_template:this_is_fine')
      .text('WTF/min', 'meme_template:wtf_per_minute')
      .row()
      .text('Stack Overflow', 'meme_template:stack_overflow');
    await ctx.reply('Выбери шаблон мема:', { reply_markup: keyboard });
  });

  bot.callbackQuery(/^meme_template:(.+)$/, async (ctx) => {
    const templateId = ctx.match[1];
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.answerCallbackQuery('Не удалось определить пользователя');
      return;
    }
    if (!BOT_BACKEND_SECRET) {
      await ctx.answerCallbackQuery('Секрет бота не настроен');
      return;
    }

    // Generate a short-lived signed token for public image access
    try {
      const tokenRes = await fetch(`${API_URL}/api/meme/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, templateId, format: '1:1' }),
      });
      if (!tokenRes.ok) throw new Error('Token request failed');
      const { token } = await tokenRes.json();
      const photoUrl = `${API_URL}/api/meme/public/${token}`;
      const playKeyboard = new InlineKeyboard().webApp('Играть в Coder Survival', WEBAPP_URL);
      await ctx.replyWithPhoto(photoUrl, {
        caption: `Coder Survival — ${templateId.replace(/_/g, ' ')}\nА ты сколько накодил? 👇`,
        reply_markup: playKeyboard,
      });
      await ctx.answerCallbackQuery();
    } catch (err) {
      console.error('Meme share error:', err);
      await ctx.answerCallbackQuery('Не удалось сгенерировать мем. Попробуй позже.');
    }
  });

  bot.command('deadline', async (ctx) => {
    try {
      const response = await fetch(`${API_URL}/api/meme/gif/deadline`, {
        method: 'GET',
        headers: { 'X-Bot-Backend-Secret': BOT_BACKEND_SECRET }
      });
      if (!response.ok) throw new Error('GIF generation failed');
      const buffer = Buffer.from(await response.arrayBuffer());
      await ctx.replyWithAnimation(new InputFile(buffer, 'deadline.gif'), {
        caption: 'Менеджер не дремлет. +1 дедлайн! 📅'
      });
    } catch (err) {
      console.error('Deadline GIF error:', err);
      await ctx.reply('GIF генератор временно недоступен. Попробуй позже.');
    }
  });

  // Pre-checkout is the last point at which a charge can still be stopped
  // cleanly, before Telegram debits the user. While payments are disabled we
  // always answer false, so no charge is ever created.
  bot.on('pre_checkout_query', async (ctx) => {
    const decision = decidePreCheckout(ctx.preCheckoutQuery);
    if (!decision.ok) {
      await ctx.answerPreCheckoutQuery(false, { error_message: decision.errorMessage });
      return;
    }
    await ctx.answerPreCheckoutQuery(true);
  });

  // Fulfillment of an ALREADY-CHARGED payment.
  //
  // This is deliberately NOT blocked while payments are disabled: Telegram has
  // already debited the user by the time this fires, so refusing would produce
  // charge-without-delivery. Absent an automatic refund, the honest response is
  // to fulfill idempotently and flag the anomaly.
  bot.on('message:successful_payment', async (ctx) => {
    const payment = ctx.message.successful_payment;
    const paymentsWereDisabled = !arePaymentsEnabled();

    // Redacted by default: amount and currency are safe operational signal,
    // while user id, charge id and invoice payload are payment identifiers and
    // are never written to logs.
    console.log('successful_payment received', {
      amount: payment.total_amount,
      currency: payment.currency,
      paymentsEnabled: !paymentsWereDisabled
    });

    if (paymentsWereDisabled) {
      console.warn(redactedDisabledPaymentNotice());
    }

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
      // Status only: the response body echoes payment record fields, which must
      // not reach the logs.
      console.error('Payment fulfillment failed', { status: response.status, code: payload?.code });
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
          : 'Предмет успешно начислен.') +
        (paymentsWereDisabled
          ? '\n\nВнимание: платежи сейчас отключены (тестовый режим). ' +
            'Списание уже произошло, поэтому покупка выдана. Свяжитесь с поддержкой.'
          : '')
    );
  });

  bot.catch((err) => {
    console.error('Bot error:', err.error);
  });

  return bot;
}

export { WEBAPP_URL, API_URL };
