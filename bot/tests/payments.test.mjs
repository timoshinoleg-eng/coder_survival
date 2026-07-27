/**
 * Fail-closed payment kill switch — bot.
 *
 * Runs on the plain Node test runner (`node --test`), with no grammy and no
 * network. The invoice-link handler takes `fetch` by injection, so the central
 * claim — that Telegram's createInvoiceLink is NEVER called while payments are
 * disabled — is asserted directly rather than inferred from source text.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parsePaymentsEnabled,
  arePaymentsEnabled,
  decidePreCheckout,
  redactedDisabledPaymentNotice,
  PAYMENTS_DISABLED_CODE,
} from '../src/payments.js';
import { handleInvoiceLinkRequest } from '../src/invoiceLinkHandler.js';

test('parsePaymentsEnabled accepts only the literal lowercase string "true"', () => {
  assert.equal(parsePaymentsEnabled('true'), true);

  const disabled = [
    undefined, null, '', '   ', 'false', '0', '1', 'yes', 'on', 'enabled',
    'true!', 'tru', 'truthy', "'true'", 'true false', 1, 0, true, false,
    {}, [], ['true'], NaN,
  ];
  for (const value of disabled) {
    assert.equal(parsePaymentsEnabled(value), false, `expected ${String(value)} to be disabled`);
  }
});

test('case and whitespace near-misses are disabled — the match is literal', () => {
  // Not normalised on purpose: PAYMENTS_ENABLED=TRUE must fail safe rather than
  // be guessed into live payments.
  const nearMisses = [
    'TRUE', 'True', 'tRuE', 'TrUe',
    '  true  ', ' true', 'true ', '\ttrue', 'true\n', '\ntrue\t',
  ];
  for (const value of nearMisses) {
    assert.equal(parsePaymentsEnabled(value), false, `expected ${JSON.stringify(value)} to be disabled`);
  }
});

test('arePaymentsEnabled reads PAYMENTS_ENABLED from the provided env', () => {
  assert.equal(arePaymentsEnabled({}), false);
  assert.equal(arePaymentsEnabled({ PAYMENTS_ENABLED: 'yes' }), false);
  assert.equal(arePaymentsEnabled({ PAYMENTS_ENABLED: 'TRUE' }), false);
  assert.equal(arePaymentsEnabled({ PAYMENTS_ENABLED: ' true ' }), false);
  assert.equal(arePaymentsEnabled({ PAYMENTS_ENABLED: 'true' }), true);
});

test('pre_checkout_query is rejected while payments are disabled', () => {
  // Even a perfectly valid Stars checkout must be refused: this is the last
  // point at which a charge can be stopped before the user is debited.
  const decision = decidePreCheckout({ currency: 'XTR', total_amount: 50 }, {});

  assert.equal(decision.ok, false);
  assert.equal(decision.reason, PAYMENTS_DISABLED_CODE);
  assert.match(decision.errorMessage, /тестовый режим/i);
});

test('pre_checkout_query rejection wins over the currency check', () => {
  const decision = decidePreCheckout({ currency: 'USD' }, {});
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, PAYMENTS_DISABLED_CODE);
});

test('pre_checkout_query is accepted only when enabled and paid in Stars', () => {
  const enabled = { PAYMENTS_ENABLED: 'true' };

  assert.equal(decidePreCheckout({ currency: 'XTR' }, enabled).ok, true);

  const wrongCurrency = decidePreCheckout({ currency: 'USD' }, enabled);
  assert.equal(wrongCurrency.ok, false);
  assert.equal(wrongCurrency.reason, 'UNSUPPORTED_CURRENCY');
});

test('the disabled-payment notice carries no identifiers', () => {
  const notice = redactedDisabledPaymentNotice();
  assert.match(notice, /charge-without-delivery/);
  assert.match(notice, /omitted/i);
  // No interpolation slots for ids exist at all.
  assert.doesNotMatch(notice, /\d{6,}/);
});

/** Minimal Vercel-style response double. */
function createResponse() {
  return {
    statusCode: null,
    payload: undefined,
    headers: {},
    ended: false,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { this.ended = true; return this; },
  };
}

test('invoice-link refuses while disabled and never calls Telegram', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    throw new Error('no network call should happen while payments are disabled');
  };

  const res = createResponse();
  await handleInvoiceLinkRequest(
    { method: 'POST', body: { invoicePayload: 'purchase:1:energy_refill' } },
    res,
    { fetchImpl, env: { BOT_TOKEN: 'token', BOT_BACKEND_SECRET: 'secret', API_URL: 'http://api' } },
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.code, 'PAYMENTS_DISABLED');
  // The strongest assertion: no outbound request of any kind was attempted.
  assert.deepEqual(calls, []);
});

test('invoice-link refuses with PAYMENTS_DISABLED even when config is missing', async () => {
  // The payment state is the real reason; it must not be masked by a
  // BOT_TOKEN/secret configuration error.
  const res = createResponse();
  let called = false;

  await handleInvoiceLinkRequest(
    { method: 'POST', body: { invoicePayload: 'purchase:1:energy_refill' } },
    res,
    { fetchImpl: async () => { called = true; }, env: {} },
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.code, 'PAYMENTS_DISABLED');
  assert.equal(called, false);
});

test('invoice-link refuses regardless of a malformed body', async () => {
  const res = createResponse();
  await handleInvoiceLinkRequest(
    { method: 'POST', body: 'not-json-at-all' },
    res,
    { fetchImpl: async () => { throw new Error('unreachable'); }, env: {} },
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.code, 'PAYMENTS_DISABLED');
});

test('invoice-link proceeds to Telegram when payments are explicitly enabled', async () => {
  // Proves the gate is a real switch rather than a permanent refusal.
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('invoice-context')) {
      return {
        ok: true,
        json: async () => ({
          invoice: {
            title: 'Energy', description: 'Refill', payload: 'purchase:1:energy_refill',
            currency: 'XTR', prices: [{ label: 'Energy', amount: 50 }],
          },
        }),
      };
    }
    return { ok: true, json: async () => ({ ok: true, result: 'https://t.me/invoice/abc' }) };
  };

  const res = createResponse();
  await handleInvoiceLinkRequest(
    { method: 'POST', body: { invoicePayload: 'purchase:1:energy_refill' } },
    res,
    {
      fetchImpl,
      env: {
        PAYMENTS_ENABLED: 'true',
        BOT_TOKEN: 'token',
        BOT_BACKEND_SECRET: 'secret',
        API_URL: 'http://api',
      },
    },
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.url, 'https://t.me/invoice/abc');
  assert.equal(calls.length, 2);
  assert.match(calls[1], /createInvoiceLink/);
});

test('CORS preflight still works while payments are disabled', async () => {
  const res = createResponse();
  await handleInvoiceLinkRequest(
    { method: 'OPTIONS' },
    res,
    { fetchImpl: async () => { throw new Error('unreachable'); }, env: {} },
  );

  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
});
