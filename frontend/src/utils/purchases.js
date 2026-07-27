import { apiRequest } from './api.js';
import { PaymentsDisabledError, arePaymentsEnabled } from './payments.js';

const BOT_INVOICE_LINK_URL = 'https://coder-survival-bot.vercel.app/api/invoice-link';

async function openInvoiceLink(itemType, payload, invoicePayload) {
  // Guard inside the invoice opener itself, not only at the exported entry
  // points: this is the one function that can reach Telegram's openInvoice, so
  // refusing here keeps it unreachable even if a future caller forgets to
  // check. Thrown BEFORE the network request — no invoice is created and none
  // can be opened.
  if (!arePaymentsEnabled()) {
    throw new PaymentsDisabledError();
  }

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
        if (status === 'paid') {
          // Telegram confirmed payment. The reward is still credited server-side
          // via the successful_payment webhook; the UI reloads state to reflect it.
          resolve({ success: true, status: 'paid', purchase: payload?.purchase, url: invoiceResult.url });
        } else if (status === 'pending') {
          // Payment in progress but NOT confirmed. Treat as "opened/awaiting" so
          // the UI does not show a completed purchase or grant an unconfirmed reward.
          resolve({ success: true, status: 'opened', purchase: payload?.purchase, url: invoiceResult.url });
        } else {
          // cancelled / failed / unknown → not a success.
          resolve({ success: false, status: status || 'failed', purchase: payload?.purchase, url: invoiceResult.url });
        }
      });
      return;
    }

    // No native invoice API (opened outside Telegram): we can open the link but
    // cannot observe the payment outcome, so report "opened/awaiting" — never a
    // completed purchase.
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
  // Refuse before the API call so no purchase intent is even requested.
  if (!arePaymentsEnabled()) {
    throw new PaymentsDisabledError();
  }

  const payload = await apiRequest('/api/buy', {
    method: 'POST',
    initData,
    body: { item_type: itemType }
  });

  return openInvoiceLink(itemType, payload, payload?.payment?.payload);
}

export async function startDealPurchase(dealType, initData) {
  if (!arePaymentsEnabled()) {
    throw new PaymentsDisabledError();
  }

  const payload = await apiRequest('/api/shop/purchase-deal', {
    method: 'POST',
    initData,
    body: { dealType }
  });

  return openInvoiceLink(payload?.purchase?.itemType, payload, payload?.payment?.payload);
}
