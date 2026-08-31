#!/usr/bin/env node
/**
 * staging_smoke_initdata.mjs — Gate G5 signed-Telegram smoke harness.
 *
 * Crafts a VALID, a TAMPERED, and an EXPIRED Telegram `initData` string using the
 * exact HMAC-SHA256('WebAppData') signing the backend expects (mirrors
 * backend/tests/initData.security.test.js), then POSTs each to a staging URL and
 * asserts the middleware accepts the valid one and rejects the other two.
 *
 * Owner runs this (step A4) against the real staging VM with the REAL bot token
 * and a real HTTPS staging origin. WB delivers the harness; the owner supplies
 * BOT_TOKEN + STAGING_URL (secrets never live in this repo).
 *
 * Expected results (production middleware):
 *   valid    -> 2xx (middleware calls next())
 *   tampered -> 403
 *   expired  -> 403
 *
 * Usage:
 *   BOT_TOKEN=real... STAGING_URL=https://staging.example.com \
 *     node staging_smoke_initdata.mjs [--path /api/secure] [--user-id 777001]
 */
import crypto from 'node:crypto';

const BOT_TOKEN = process.env.BOT_TOKEN;
const STAGING_URL = process.env.STAGING_URL;
const PATH = process.argv.includes('--path') ? process.argv[process.argv.indexOf('--path') + 1] : '/api/secure';
const userIdArg = process.argv.includes('--user-id') ? process.argv[process.argv.indexOf('--user-id') + 1] : '777001';

function buildInitData({ botToken, authDate = Math.floor(Date.now() / 1000), tamper = false, userId = userIdArg }) {
  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('user', JSON.stringify({ id: Number(userId), first_name: 'Smoke' }));
  params.set('query_id', 'smoke-' + authDate);

  let entries = [...params.entries()].filter(([k]) => k !== 'hash' && k !== 'signature');
  entries.sort(([ka], [kb]) => (ka < kb ? -1 : ka > kb ? 1 : 0));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);

  let out = params.toString();
  if (tamper) {
    // flip one char in the hash so the signature no longer matches the body
    const bad = hash.slice(0, 1) === 'a' ? 'b' + hash.slice(1) : 'a' + hash.slice(1);
    out = out.replace('hash=' + hash, 'hash=' + bad);
  }
  return out;
}

async function post(initData) {
  const res = await fetch(STAGING_URL + PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-init-data': initData },
    body: '{}',
  });
  return res.status;
}

async function main() {
  if (!BOT_TOKEN || !STAGING_URL) {
    console.error('ERROR: set BOT_TOKEN and STAGING_URL (env).');
    process.exit(2);
  }
  const cases = [
    { name: 'valid', initData: buildInitData({ botToken: BOT_TOKEN }), expect: '2xx' },
    { name: 'tampered', initData: buildInitData({ botToken: BOT_TOKEN, tamper: true }), expect: 403 },
    { name: 'expired', initData: buildInitData({ botToken: BOT_TOKEN, authDate: Math.floor(Date.now() / 1000) - 7200 }), expect: 403 },
  ];

  let pass = true;
  console.log(`Target: POST ${STAGING_URL}${PATH}\n`);
  for (const c of cases) {
    let status;
    try {
      status = await post(c.initData);
    } catch (e) {
      status = `ERR(${e.message.split('\n')[0]})`;
    }
    const ok = c.expect === '2xx' ? String(status).startsWith('2') : status === c.expect;
    if (!ok) pass = false;
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${c.name.padEnd(8)} -> HTTP ${status} (expect ${c.expect})`);
  }

  console.log('\n' + (pass ? 'G5 smoke: PASS' : 'G5 smoke: FAIL — investigate before launch'));
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error('Fatal:', e.message); process.exit(2); });
