import { apiRequest } from './api.js';

const BOT_INVOICE_LINK_URL = 'https://coder-survival-bot.vercel.app/api/invoice-link';

export async function startTelegramPurchase(itemType, initData) {
  const payload = await apiRequest('/api/buy', {
    method: 'POST',
    initData,
    body: { item_type: itemType }
  });

  const invoiceResponse = await fetch(BOT_INVOICE_LINK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      itemType,
      invoicePayload: payload?.payment?.payload
    })
  });

  const invoiceText = await invoiceResponse.text();
  const invoicePayload = invoiceText ? JSON.parse(invoiceText) : null;

  if (!invoiceResponse.ok || !invoicePayload?.url) {
    throw new Error(invoicePayload?.error || 'Не удалось создать invoice');
  }

  const tg = window.Telegram?.WebApp;

  return new Promise((resolve) => {
    if (tg?.openInvoice) {
      tg.openInvoice(invoicePayload.url, (status) => {
        resolve({
          success: status === 'paid' || status === 'pending',
          status,
          purchase: payload?.purchase,
          url: invoicePayload.url
        });
      });
      return;
    }

    window.open(invoicePayload.url, '_blank', 'noopener,noreferrer');
    resolve({
      success: true,
      status: 'opened',
      purchase: payload?.purchase,
      url: invoicePayload.url
    });
  });
}
