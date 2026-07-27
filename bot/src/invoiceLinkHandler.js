/**
 * Invoice-link request handling, split out from the Vercel entrypoint
 * (bot/api/invoice-link.js) so it can be exercised directly in tests.
 *
 * Dependency-free by design: no dotenv, no grammy, and `fetch` is injected.
 * That lets a test assert the strongest property we care about — that while
 * payments are disabled, NO network call to Telegram's createInvoiceLink (and
 * none to the backend invoice-context endpoint) is ever made.
 */
import {
  PAYMENTS_DISABLED_CODE,
  PAYMENTS_DISABLED_MESSAGE,
  arePaymentsEnabled,
} from './payments.js';

export function withCors(response, origin = '*') {
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * @param {object} req                 Vercel-style request
 * @param {object} res                 Vercel-style response
 * @param {object} deps
 * @param {typeof fetch} deps.fetchImpl
 * @param {NodeJS.ProcessEnv} deps.env
 */
export async function handleInvoiceLinkRequest(req, res, { fetchImpl, env }) {
  if (req.method === 'OPTIONS') {
    withCors(res);
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    withCors(res);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Fail closed before anything else: no invoice context is fetched and
  // Telegram's createInvoiceLink is never called while payments are disabled.
  // Checked ahead of the BOT_TOKEN/secret checks so a deployment running in
  // non-commercial test mode reports the real reason, not a config error.
  if (!arePaymentsEnabled(env)) {
    withCors(res);
    return res.status(403).json({
      error: PAYMENTS_DISABLED_MESSAGE,
      code: PAYMENTS_DISABLED_CODE,
    });
  }

  const botToken = env.BOT_TOKEN;
  const botBackendSecret = env.BOT_BACKEND_SECRET;
  const apiUrl = env.API_URL;

  if (!botToken) {
    withCors(res);
    return res.status(500).json({ error: 'BOT_TOKEN is not configured' });
  }

  if (!botBackendSecret) {
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

    const contextResponse = await fetchImpl(`${apiUrl}/api/internal/payments/telegram/invoice-context`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bot-Backend-Secret': botBackendSecret,
      },
      body: JSON.stringify({ invoicePayload }),
    });
    const contextPayload = await contextResponse.json();

    if (!contextResponse.ok || !contextPayload?.invoice) {
      throw new Error(contextPayload?.error || 'Failed to load invoice context');
    }

    const invoice = contextPayload.invoice;

    const telegramResponse = await fetchImpl(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: invoice.title,
        description: invoice.description,
        payload: invoice.payload,
        currency: invoice.currency,
        prices: invoice.prices,
      }),
    });

    const telegramPayload = await telegramResponse.json();
    if (!telegramResponse.ok || !telegramPayload?.ok || !telegramPayload?.result) {
      withCors(res);
      return res.status(502).json({
        error: telegramPayload?.description || 'Telegram invoice creation failed',
      });
    }

    withCors(res);
    return res.status(200).json({ url: telegramPayload.result });
  } catch (error) {
    withCors(res);
    return res.status(500).json({ error: error.message || 'Unexpected error' });
  }
}
