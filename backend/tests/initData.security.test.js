import { jest } from '@jest/globals';
import crypto from 'crypto';
import { initDataMiddleware } from '../src/middleware/initData.js';

// A stable bot token for generating valid HMAC-signed initData in unit tests.
const BOT_TOKEN = '123456:ABC-test-token-for-unit-tests';

/**
 * Builds a valid Telegram initData string signed with the same HMAC-SHA256
 * algorithm the middleware expects (bot_token secret key). This lets us assert
 * the POSITIVE path (valid signature accepted) in addition to negative paths.
 */
function buildValidInitData({
  botToken = BOT_TOKEN,
  user = { id: 777001, first_name: 'Sec' },
  authDate = Math.floor(Date.now() / 1000),
  extra = {},
} = {}) {
  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('user', JSON.stringify(user));
  for (const [k, v] of Object.entries(extra)) params.set(k, String(v));

  const entries = [...params.entries()].filter(([k]) => k !== 'hash' && k !== 'signature');
  entries.sort(([ka], [kb]) => (ka < kb ? -1 : ka > kb ? 1 : 0));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  params.set('hash', hash);
  return params.toString();
}

function runMiddleware(initData, { botToken, nodeEnv, maxAge } = {}) {
  const saved = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    NODE_ENV: process.env.NODE_ENV,
    INIT_DATA_MAX_AGE_SECONDS: process.env.INIT_DATA_MAX_AGE_SECONDS,
    TELEGRAM_TEST_ENV: process.env.TELEGRAM_TEST_ENV,
  };

  // `null` is the explicit "unset" sentinel; `undefined` means "use test token".
  // (A JS default param would re-apply the test token on `undefined`, defeating
  // the "unset" case — that is exactly why we use a sentinel here.)
  const apply = (key, val) => {
    if (val === undefined || val === null) delete process.env[key];
    else process.env[key] = String(val);
  };
  const useToken = botToken === undefined ? BOT_TOKEN : botToken;
  apply('BOT_TOKEN', useToken);
  apply('TELEGRAM_BOT_TOKEN', null); // fully control bot token via BOT_TOKEN
  apply('NODE_ENV', nodeEnv);
  apply('INIT_DATA_MAX_AGE_SECONDS', maxAge);
  delete process.env.TELEGRAM_TEST_ENV;

  const req = {
    headers: initData ? { 'x-telegram-init-data': initData } : {},
    path: '/api/secure',
    method: 'POST',
  };
  let statusCode = null;
  let body = null;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
  const next = () => {
    nextCalled = true;
  };

  initDataMiddleware(req, res, next);

  for (const [k, v] of Object.entries(saved)) apply(k, v);

  return { statusCode, body, nextCalled };
}

describe('initData middleware — security', () => {
  test('accepts a correctly signed, fresh initData (HMAC path)', () => {
    const initData = buildValidInitData();
    const { statusCode, nextCalled } = runMiddleware(initData, { nodeEnv: 'production' });
    expect(statusCode).toBeNull();
    expect(nextCalled).toBe(true);
  });

  test('rejects when initData header is missing', () => {
    const { statusCode, nextCalled } = runMiddleware(undefined, { nodeEnv: 'production' });
    expect(statusCode).toBe(401);
    expect(nextCalled).toBe(false);
  });

  test('rejects a tampered initData (hash no longer matches)', () => {
    const initData = buildValidInitData();
    const tampered = initData.replace('auth_date=', 'auth_date=1'); // changes data-check-string
    const { statusCode, nextCalled } = runMiddleware(tampered, { nodeEnv: 'production' });
    expect(statusCode).toBe(403);
    expect(nextCalled).toBe(false);
  });

  test('rejects an expired initData (older than the replay window)', () => {
    const old = Math.floor(Date.now() / 1000) - 7200; // 2h ago
    const initData = buildValidInitData({ authDate: old });
    const { statusCode, nextCalled } = runMiddleware(initData, { nodeEnv: 'production', maxAge: '3600' });
    expect(statusCode).toBe(403);
    expect(nextCalled).toBe(false);
  });

  test('rejects malformed initData with a garbage hash', () => {
    const initData = 'auth_date=1700000000&user=%7B%22id%22%3A1%7D&hash=deadbeef';
    const { statusCode, nextCalled } = runMiddleware(initData, { nodeEnv: 'production' });
    expect(statusCode).toBe(403);
    expect(nextCalled).toBe(false);
  });

  test('FAIL-OPEN GUARD: non-numeric INIT_DATA_MAX_AGE_SECONDS must NOT disable expiry', () => {
    // Before hardening, parseInt('notanumber') -> NaN, so
    // `nowSeconds - age > NaN` is always false and an old initData was accepted.
    const old = Math.floor(Date.now() / 1000) - 7200;
    const initData = buildValidInitData({ authDate: old });
    const { statusCode, nextCalled } = runMiddleware(initData, {
      nodeEnv: 'production',
      maxAge: 'notanumber',
    });
    expect(statusCode).toBe(403);
    expect(nextCalled).toBe(false);
  });

  test('FAIL-OPEN GUARD: missing auth_date must be rejected (never expires)', () => {
    const initData = buildValidInitData();
    const stripped = initData.replace(/auth_date=\d+/, ''); // valid hash but no auth_date
    const { statusCode, nextCalled } = runMiddleware(stripped, { nodeEnv: 'production' });
    expect(statusCode).toBe(403);
    expect(nextCalled).toBe(false);
  });

  test('production rejects (500) when BOT_TOKEN is unset — never silently skips validation', () => {
    const initData = buildValidInitData();
    const { statusCode, nextCalled } = runMiddleware(initData, {
      botToken: null,
      nodeEnv: 'production',
    });
    expect(statusCode).toBe(500);
    expect(nextCalled).toBe(false);
  });

  test('non-production with no BOT_TOKEN skips validation (dev convenience only)', () => {
    const initData = buildValidInitData();
    const { statusCode, nextCalled } = runMiddleware(initData, {
      botToken: null,
      nodeEnv: 'development',
    });
    expect(statusCode).toBeNull();
    expect(nextCalled).toBe(true);
  });

  test('clamps an over-wide INIT_DATA_MAX_AGE_SECONDS to the hard cap', () => {
    // This asserts the anti-24h-window hardening exists: a huge value must not
    // be accepted blindly. We prove it by checking that an initData older than
    // the cap (86400s) is still rejected even when the env asks for 24h.
    const old = Math.floor(Date.now() / 1000) - 8000; // ~2.2h ago
    const initData = buildValidInitData({ authDate: old });
    const { statusCode, nextCalled } = runMiddleware(initData, {
      nodeEnv: 'production',
      maxAge: '86400',
    });
    expect(statusCode).toBe(403);
    expect(nextCalled).toBe(false);
  });
});
