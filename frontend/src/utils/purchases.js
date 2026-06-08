import { apiRequest } from './api.js';

const BOT_INVOICE_LINK_URL = 'https://coder-survival-bot.vercel.app/api/invoice-link';

async function openInvoiceLink(itemType, payload, invoicePayload) {
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
  const invoiceResult = invoiceText ? JSON.parse(invoiceText) : null;

  if (!invoiceResponse.ok || !invoiceResult?.url) {
    throw new Error(invoiceResult?.error || 'Не удалось создать invoice');
  }

  const tg = window.Telegram?.WebApp;

  return new Promise((resolve) => {
    if (tg?.openInvoice) {
      tg.openInvoice(invoiceResult.url, (status) => {
        resolve({
          success: status === 'paid' || status === 'pending',
          status,
          purchase: payload?.purchase,
          url: invoiceResult.url
        });
      });
      return;
    }

    window.open(invoiceResult.url, '_blank', 'noopener,noreferrer');
    resolve({
      success: true,
      status: 'opened',
      purchase: payload?.purchase,
      url: invoiceResult.url
    });
  });
}

export async function startTelegramPurchase(itemType, initData) {
  const payload = await apiRequest('/api/buy', {
    method: 'POST',
    initData,
    body: { item_type: itemType }
  });

  return openInvoiceLink(itemType, payload, payload?.payment?.payload);
}

export async function startDealPurchase(dealType, initData) {
  const payload = await apiRequest('/api/shop/purchase-deal', {
    method: 'POST',
    initData,
    body: { dealType }
  });

  return openInvoiceLink(payload?.purchase?.itemType, payload, payload?.payment?.payload);
}
