import 'dotenv/config';

const BOT_TOKEN = process.env.BOT_TOKEN;
const API_URL = process.env.API_URL;
if (!API_URL) {
  throw new Error('API_URL not set');
}
const BOT_BACKEND_SECRET = process.env.BOT_BACKEND_SECRET;

function withCors(response, origin = '*') {
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function fetchInvoiceContext(invoicePayload) {
  const response = await fetch(`${API_URL}/api/internal/payments/telegram/invoice-context`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Bot-Backend-Secret': BOT_BACKEND_SECRET
    },
    body: JSON.stringify({ invoicePayload })
  });
  const payload = await response.json();

  if (!response.ok || !payload?.invoice) {
    throw new Error(payload?.error || 'Failed to load invoice context');
  }

  return payload;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    withCors(res);
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    withCors(res);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!BOT_TOKEN) {
    withCors(res);
    return res.status(500).json({ error: 'BOT_TOKEN is not configured' });
  }

  if (!BOT_BACKEND_SECRET) {
    withCors(res);
    return res.status(500).json({ error: 'BOT_BACKEND_SECRET is not configured' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { invoicePayload } = body;

    if (!invoicePayload) {
      withCors(res);
      return res.status(400).json({ error: 'Invalid invoice request' });
    }

    const invoiceContext = await fetchInvoiceContext(invoicePayload);
    const invoice = invoiceContext.invoice;

    const telegramResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: invoice.title,
        description: invoice.description,
        payload: invoice.payload,
        currency: invoice.currency,
        prices: invoice.prices
      })
    });

    const telegramPayload = await telegramResponse.json();
    if (!telegramResponse.ok || !telegramPayload?.ok || !telegramPayload?.result) {
      withCors(res);
      return res.status(502).json({
        error: telegramPayload?.description || 'Telegram invoice creation failed'
      });
    }

    withCors(res);
    return res.status(200).json({ url: telegramPayload.result });
  } catch (error) {
    withCors(res);
    return res.status(500).json({ error: error.message || 'Unexpected error' });
  }
}
