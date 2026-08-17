import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);
const DEFAULT_SMOKE_BOT_TOKEN = '900000:local-smoke-harness-only';
const TEST_USER_PREFIX = 785000000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseMode() {
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
  const mode = modeArg ? modeArg.slice('--mode='.length) : 'local';
  assert(['local', 'staging'].includes(mode), `Unknown mode "${mode}". Use --mode=local or --mode=staging.`);
  return mode;
}

function parseLocalDatabaseUrl() {
  const value = process.env.SMOKE_LOCAL_DATABASE_URL;
  assert(value, 'SMOKE_LOCAL_DATABASE_URL is required for --mode=local. Use a disposable local test database.');
  const url = new URL(value);
  assert(['postgres:', 'postgresql:'].includes(url.protocol), 'SMOKE_LOCAL_DATABASE_URL must be a PostgreSQL URL.');
  assert(LOCAL_HOSTS.has(url.hostname), 'Refusing a non-local database. The local smoke harness must never target staging or production.');
  assert(/test|smoke|rehearsal/i.test(url.pathname), 'Refusing a database name without test, smoke, or rehearsal marker.');
  return value;
}

export function buildSignedInitData({ telegramId, username, botToken, authDate = Math.floor(Date.now() / 1000) }) {
  const params = new URLSearchParams({
    user: JSON.stringify({ id: telegramId, username, first_name: 'Smoke' }),
    auth_date: String(authDate),
  });
  const pairs = Array.from(params.entries())
    .map(([key, value]) => `${key}=${value}`)
    .sort((left, right) => left.localeCompare(right));
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(pairs.join('\n')).digest('hex');
  params.append('hash', hash);
  return params.toString();
}

export function corruptInitDataSignature(initData) {
  const params = new URLSearchParams(initData);
  params.set('hash', '00'.repeat(32));
  return params.toString();
}

async function expectStatus(response, expectedStatus, expectedError) {
  assert(response.status === expectedStatus, `Expected HTTP ${expectedStatus}, got ${response.status}: ${JSON.stringify(response.body)}`);
  if (expectedError) {
    assert(response.body?.error === expectedError, `Expected error "${expectedError}", got ${JSON.stringify(response.body)}`);
  }
}

async function runCheck(results, name, operation) {
  try {
    await operation();
    results.push({ name, status: 'PASS' });
  } catch (error) {
    results.push({ name, status: 'FAIL', detail: error.message });
  }
}

function printResults(results) {
  for (const result of results) {
    const suffix = result.detail ? ` — ${result.detail}` : '';
    console.log(`${result.status}: ${result.name}${suffix}`);
  }
  const failures = results.filter((result) => result.status === 'FAIL');
  console.log(`SUMMARY: ${results.length - failures.length}/${results.length} checks passed`);
  if (failures.length) process.exitCode = 1;
}

async function runLocalHarness() {
  const databaseUrl = parseLocalDatabaseUrl();
  process.env.NODE_ENV = 'test';
  process.env.TEST_DATABASE_URL = databaseUrl;
  process.env.BOT_TOKEN = process.env.SMOKE_LOCAL_BOT_TOKEN || DEFAULT_SMOKE_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;
  process.env.ENABLE_MOCK_REWARDED_ADS = 'true';
  process.env.INIT_DATA_MAX_AGE_SECONDS = '3600';

  const { ensureTestSchema, resetTestDatabase, testPool } = await import('../backend/tests/helpers/testDb.js');
  const { startTestServer } = await import('../backend/tests/helpers/testServer.js');
  const { DEFAULTS } = await import('../backend/src/config/balance.js');
  const results = [];
  let server;
  const botToken = process.env.BOT_TOKEN;
  const initData = (offset, username, authDate) => buildSignedInitData({
    telegramId: TEST_USER_PREFIX + offset,
    username,
    botToken,
    authDate,
  });
  const request = (path, options = {}) => server.request(path, options);
  const authHeaders = (value) => ({ 'X-Telegram-Init-Data': value });

  async function bootstrapEligibleUser(value, telegramId) {
    const state = await request('/api/state', { headers: authHeaders(value) });
    await expectStatus(state, 200);
    await testPool.query(
      `UPDATE users SET created_at = NOW() - INTERVAL '2 hours' WHERE telegram_id = $1`,
      [telegramId],
    );
    await testPool.query(
      `UPDATE progression
       SET created_at = NOW() - INTERVAL '2 hours', energy = 1
       WHERE user_id = (SELECT id FROM users WHERE telegram_id = $1)`,
      [telegramId],
    );
  }

  async function createMockSession(value) {
    const response = await request('/api/rewards/ad-session', {
      method: 'POST',
      headers: authHeaders(value),
      body: { provider: 'mock' },
    });
    await expectStatus(response, 200);
    assert(typeof response.body?.nonce === 'string' && response.body.nonce.length > 0, 'Ad session did not return a nonce.');
    return response.body.nonce;
  }

  async function claimMock(value, nonce) {
    return request('/api/rewards/ad-claim', {
      method: 'POST',
      headers: authHeaders(value),
      body: { provider: 'mock', nonce, proof: {} },
    });
  }

  try {
    await ensureTestSchema();
    await resetTestDatabase();
    server = await startTestServer();

    const validUserId = TEST_USER_PREFIX + 1;
    const valid = initData(1, 'smoke_valid');
    await runCheck(results, 'valid signed initData is accepted', async () => {
      const response = await request('/api/state', { headers: authHeaders(valid) });
      await expectStatus(response, 200);
    });

    await runCheck(results, 'invalid initData signature is rejected', async () => {
      const response = await request('/api/state', { headers: authHeaders(corruptInitDataSignature(valid)) });
      await expectStatus(response, 403, 'Invalid initData signature');
    });

    await runCheck(results, 'expired signed initData is rejected', async () => {
      const expired = initData(2, 'smoke_expired', Math.floor(Date.now() / 1000) - 3660);
      const response = await request('/api/state', { headers: authHeaders(expired) });
      await expectStatus(response, 403, 'Expired initData');
    });

    const ownerId = TEST_USER_PREFIX + 3;
    const attackerId = TEST_USER_PREFIX + 4;
    const owner = initData(3, 'smoke_nonce_owner');
    const attacker = initData(4, 'smoke_nonce_attacker');
    await bootstrapEligibleUser(owner, ownerId);
    await bootstrapEligibleUser(attacker, attackerId);
    const ownerNonce = await createMockSession(owner);

    await runCheck(results, 'nonce issued to one user is rejected for another user', async () => {
      const response = await claimMock(attacker, ownerNonce);
      await expectStatus(response, 403, 'Nonce does not belong to user');
    });

    await runCheck(results, 'nonce owner receives exactly one Coffee Coin reward', async () => {
      const response = await claimMock(owner, ownerNonce);
      await expectStatus(response, 200);
      assert(response.body?.success === true, 'Owner claim did not report success.');
      assert(response.body?.reward?.coffeeCoins === 1, 'Owner claim did not grant exactly one Coffee Coin.');
    });

    await runCheck(results, 'sequential replay of a consumed nonce is rejected', async () => {
      const response = await claimMock(owner, ownerNonce);
      await expectStatus(response, 409, 'Nonce already used');
    });

    await runCheck(results, 'duplicate concurrent claim permits one reward and rejects the duplicate', async () => {
      const duplicateId = TEST_USER_PREFIX + 5;
      const duplicateOwner = initData(5, 'smoke_duplicate_owner');
      await bootstrapEligibleUser(duplicateOwner, duplicateId);
      const nonce = await createMockSession(duplicateOwner);
      const responses = await Promise.all([claimMock(duplicateOwner, nonce), claimMock(duplicateOwner, nonce)]);
      const statuses = responses.map((response) => response.status).sort((left, right) => left - right);
      assert(JSON.stringify(statuses) === JSON.stringify([200, 409]), `Expected [200,409], got ${JSON.stringify(statuses)}.`);
    });

    await runCheck(results, 'cooldown rejects a fresh nonce after a successful reward', async () => {
      const nonce = await createMockSession(owner);
      const response = await claimMock(owner, nonce);
      await expectStatus(response, 429, 'Ad reward cooldown active');
    });

    await runCheck(results, 'daily cap rejects a valid unused nonce before a reward is granted', async () => {
      const capId = TEST_USER_PREFIX + 6;
      const capUser = initData(6, 'smoke_daily_cap');
      await bootstrapEligibleUser(capUser, capId);
      const nonce = await createMockSession(capUser);
      const userResult = await testPool.query('SELECT id FROM users WHERE telegram_id = $1', [capId]);
      const userId = userResult.rows[0]?.id;
      assert(userId, 'Daily-cap test user was not created.');
      await testPool.query(
        `INSERT INTO ad_rewards (user_id, date, count, provider)
         VALUES ($1, CURRENT_DATE, $2, 'mock')
         ON CONFLICT (user_id, date) DO UPDATE SET count = EXCLUDED.count, last_rewarded_at = NULL`,
        [userId, DEFAULTS.ADS.maxPerDay],
      );
      const response = await claimMock(capUser, nonce);
      await expectStatus(response, 429, 'Daily ad reward limit reached');
    });
  } finally {
    if (server) await server.close();
    if (testPool) await testPool.end();
  }

  printResults(results);
}

async function runStagingReadOnlyChecks() {
  const baseUrl = process.env.SMOKE_STAGING_BASE_URL;
  const validInitData = process.env.SMOKE_STAGING_INIT_DATA;
  const expiredInitData = process.env.SMOKE_STAGING_EXPIRED_INIT_DATA;
  assert(baseUrl, 'SMOKE_STAGING_BASE_URL is required for --mode=staging.');
  assert(validInitData, 'SMOKE_STAGING_INIT_DATA is required for --mode=staging. Use an operator-owned staging account.');
  const url = new URL(baseUrl);
  assert(url.protocol === 'https:', 'Staging smoke requires an HTTPS base URL.');
  const results = [];
  const call = async (path, initData) => {
    const response = await fetch(new URL(path, url), { headers: { 'X-Telegram-Init-Data': initData } });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };

  await runCheck(results, 'valid signed staging initData reaches authenticated reward status', async () => {
    const response = await call('/api/rewards/status', validInitData);
    await expectStatus(response, 200);
  });
  await runCheck(results, 'tampered staging initData is rejected', async () => {
    const response = await call('/api/rewards/status', corruptInitDataSignature(validInitData));
    await expectStatus(response, 403, 'Invalid initData signature');
  });
  if (expiredInitData) {
    await runCheck(results, 'owner-provided expired signed staging initData is rejected', async () => {
      const response = await call('/api/rewards/status', expiredInitData);
      await expectStatus(response, 403, 'Expired initData');
    });
  } else {
    results.push({
      name: 'expired signed staging initData is rejected',
      status: 'SKIP',
      detail: 'OWNER ACTION: provide SMOKE_STAGING_EXPIRED_INIT_DATA created by the staging bot token owner.',
    });
  }
  results.push({
    name: 'nonce ownership, replay, duplicate, cooldown and daily-cap mutation checks',
    status: 'SKIP',
    detail: 'OWNER ACTION: run only against a disposable staging account after approved provider callback fixtures are available.',
  });
  printResults(results);
}

async function main() {
  const mode = parseMode();
  if (mode === 'local') {
    await runLocalHarness();
  } else {
    await runStagingReadOnlyChecks();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`REWARDED ADS SMOKE FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
