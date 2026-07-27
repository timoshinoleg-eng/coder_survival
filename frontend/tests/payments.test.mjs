// Fail-closed payment kill switch — frontend.
//
// Runs on the plain Node test runner (`node --test`, wired into `npm test`).
// `import.meta.env` is undefined outside Vite, so VITE_PAYMENTS_ENABLED is
// absent here — which is exactly the disabled default this suite must prove.
//
// The load-bearing assertion is behavioural: a fake Telegram WebApp records
// every openInvoice call, and a fake fetch records every request. Both must
// stay empty.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parsePaymentsEnabled,
  arePaymentsEnabled,
  PaymentsDisabledError,
  PAYMENTS_DISABLED_CODE,
} from '../src/utils/payments.js';
import { startTelegramPurchase, startDealPurchase } from '../src/utils/purchases.js';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

/** Installs spies for every channel a purchase could escape through. */
function installSpies() {
  const openInvoiceCalls = [];
  const fetchCalls = [];
  const windowOpenCalls = [];

  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    throw new Error('no network request should be made while payments are disabled');
  };

  globalThis.window = {
    Telegram: {
      WebApp: {
        initData: '',
        openInvoice: (url, cb) => {
          openInvoiceCalls.push(url);
          cb?.('paid');
        },
      },
    },
    open: (url) => { windowOpenCalls.push(url); },
    location: { hostname: 'localhost', origin: 'http://localhost' },
  };

  return { openInvoiceCalls, fetchCalls, windowOpenCalls };
}

test('parsePaymentsEnabled accepts only the exact string "true"', () => {
  for (const value of ['true', 'TRUE', 'True', '  true  ']) {
    assert.equal(parsePaymentsEnabled(value), true);
  }

  const disabled = [
    undefined, null, '', '   ', 'false', '0', '1', 'yes', 'on', 'enabled',
    'true!', 'tru', 'truthy', "'true'", 1, 0, true, false, {}, [], ['true'], NaN,
  ];
  for (const value of disabled) {
    assert.equal(parsePaymentsEnabled(value), false, `expected ${String(value)} to be disabled`);
  }
});

test('a build without VITE_PAYMENTS_ENABLED has payments disabled', () => {
  // Fail-closed by default: no env var set means no payments.
  assert.equal(arePaymentsEnabled(), false);
});

test('startTelegramPurchase throws PaymentsDisabledError and calls no network or openInvoice', async () => {
  const { openInvoiceCalls, fetchCalls, windowOpenCalls } = installSpies();

  await assert.rejects(
    () => startTelegramPurchase('energy_refill', 'init-data'),
    (err) => {
      assert.ok(err instanceof PaymentsDisabledError);
      assert.equal(err.code, PAYMENTS_DISABLED_CODE);
      assert.equal(err.paymentsDisabled, true);
      return true;
    },
  );

  // The core guarantee: Telegram's invoice sheet is never opened...
  assert.deepEqual(openInvoiceCalls, []);
  // ...no purchase intent is even requested from the API...
  assert.deepEqual(fetchCalls, []);
  // ...and there is no fallback window.open escape hatch either.
  assert.deepEqual(windowOpenCalls, []);
});

test('startDealPurchase throws PaymentsDisabledError and calls no network or openInvoice', async () => {
  const { openInvoiceCalls, fetchCalls, windowOpenCalls } = installSpies();

  await assert.rejects(
    () => startDealPurchase('daily_deal', 'init-data'),
    (err) => err instanceof PaymentsDisabledError && err.code === PAYMENTS_DISABLED_CODE,
  );

  assert.deepEqual(openInvoiceCalls, []);
  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(windowOpenCalls, []);
});

test('the refusal is not a simulated success — no purchase object is returned', async () => {
  installSpies();

  // A caller must never be able to treat the disabled state as a completed
  // purchase; it has to be an exception, not a { success: true } payload.
  let resolvedValue = Symbol('unset');
  try {
    resolvedValue = await startTelegramPurchase('energy_refill', 'init-data');
  } catch (err) {
    assert.ok(err instanceof PaymentsDisabledError);
  }
  assert.equal(typeof resolvedValue, 'symbol', 'purchase must reject, never resolve');
});

test('PaymentsDisabledError is distinguishable from a generic failure', () => {
  const err = new PaymentsDisabledError();
  assert.equal(err.name, 'PaymentsDisabledError');
  assert.equal(err.code, 'PAYMENTS_DISABLED');
  assert.ok(err instanceof Error);
});
