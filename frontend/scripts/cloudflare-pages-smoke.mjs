#!/usr/bin/env node
// Post-deployment smoke verification for a Cloudflare Pages preview of the
// frontend, run by hand by the owner AFTER a Pages project exists.
//
// Not wired into CI on purpose: no Pages deployment exists yet, so a CI job
// would either fail permanently or be muted into meaninglessness. The pure
// helpers below are unit-tested in tests/cloudflarePagesSmoke.test.mjs; only the
// live HTTP calls need a real deployment.
//
// Dependency-free: Node 20 built-ins only (global fetch, node:test for the unit
// tests). No wrangler, no Cloudflare SDK, no new package.json dependency.
//
// Usage:
//   npm run smoke:cloudflare -- \
//     --frontend https://PROJECT.pages.dev \
//     --api https://coder-survival-api.duckdns.org
//
// Exit code 0 = every check passed, 1 = at least one FAIL.
//
// SAFETY: this script only performs reads and one CORS preflight. It never
// calls an authenticated economy or payment endpoint, never sends initData,
// never mutates state, and never prints response bodies (which could contain
// tokens or user data) — only status codes, header values it must evaluate, and
// byte counts.

const REQUIRED_ASSET_LIMIT = 12;
const DEFAULT_TIMEOUT_MS = 15000;

// ── Pure helpers (unit-tested) ─────────────────────────────────────────────

/**
 * Validates and normalises a user-supplied base URL.
 *
 * Rejects anything that is not http/https — notably file:, data: and
 * javascript: — so a mistyped argument cannot make the script read a local file
 * or silently pass. Also rejects URLs carrying a query or fragment, which would
 * indicate a copy-paste error rather than an origin.
 *
 * @param {unknown} rawValue
 * @param {string} label Argument name, used in the error message
 * @returns {string} Origin plus path, with any trailing slash removed
 */
export function validateBaseUrl(rawValue, label = 'url') {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    throw new Error(`${label}: a URL is required`);
  }

  const trimmed = rawValue.trim();

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label}: not a valid absolute URL: ${trimmed}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label}: only http/https are allowed, got ${parsed.protocol}`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`${label}: must not contain a query string or fragment`);
  }

  return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
}

/**
 * Extracts same-origin JS/CSS asset URLs referenced by the served HTML.
 *
 * Only same-origin assets are returned: third-party scripts (telegram-web-app.js,
 * the AdsGram SDK) are outside what a Pages deployment controls, and their
 * availability is not what this check is for. Relative and root-relative paths
 * are resolved against the frontend origin.
 *
 * @param {string} html
 * @param {string} baseUrl Validated frontend base URL
 * @returns {string[]} Absolute, de-duplicated same-origin asset URLs
 */
export function extractSameOriginAssets(html, baseUrl) {
  if (typeof html !== 'string' || html === '') return [];

  const found = new Set();
  const origin = new URL(baseUrl).origin;

  const patterns = [
    /<script[^>]+src\s*=\s*["']([^"']+)["']/gi,
    /<link[^>]+href\s*=\s*["']([^"']+)["']/gi,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const raw = match[1];
      if (!raw || raw.startsWith('data:')) continue;

      let resolved;
      try {
        resolved = new URL(raw, `${baseUrl}/`);
      } catch {
        continue;
      }

      if (resolved.origin !== origin) continue;
      if (!/\.(js|mjs|css)$/i.test(resolved.pathname)) continue;

      found.add(resolved.toString());
    }
  }

  return [...found].slice(0, REQUIRED_ASSET_LIMIT);
}

/**
 * Decides whether a CORS preflight response actually authorises the Pages
 * origin for the requests the app makes.
 *
 * A wildcard `*` is NOT accepted as a pass for this pilot: the backend is
 * expected to allowlist the exact Pages origin, and the app sends the custom
 * x-telegram-init-data header, which browsers only permit when the server names
 * it (or wildcards it) in Access-Control-Allow-Headers. Reporting a wildcard as
 * success would hide a misconfigured backend.
 *
 * @param {Record<string, string|null>} headers Lower-cased response headers
 * @param {object} expected
 * @param {string} expected.origin Exact Pages origin that was sent
 * @param {string} expected.method HTTP method that was requested
 * @param {string[]} expected.requestHeaders Headers the app needs to send
 * @returns {{ ok: boolean, reasons: string[], allowedOrigin: string|null }}
 */
export function evaluateCorsPreflight(headers = {}, expected = {}) {
  const reasons = [];
  const get = (name) => {
    const value = headers[name] ?? headers[name.toLowerCase()] ?? null;
    return typeof value === 'string' ? value : null;
  };

  const allowOrigin = get('access-control-allow-origin');
  const allowMethods = get('access-control-allow-methods');
  const allowHeaders = get('access-control-allow-headers');

  const wantOrigin = expected.origin || '';
  const wantMethod = (expected.method || 'POST').toUpperCase();
  const wantHeaders = (expected.requestHeaders || []).map((h) => h.toLowerCase());

  if (!allowOrigin) {
    reasons.push('no Access-Control-Allow-Origin header — origin is not allowlisted');
  } else if (allowOrigin === '*') {
    reasons.push(
      'Access-Control-Allow-Origin is "*" — the exact Pages origin is not allowlisted, ' +
        'and a wildcard cannot be used with credentialed requests',
    );
  } else if (allowOrigin.replace(/\/+$/, '') !== wantOrigin.replace(/\/+$/, '')) {
    reasons.push(`Access-Control-Allow-Origin is "${allowOrigin}", expected "${wantOrigin}"`);
  }

  // Methods: some servers omit the header on a preflight they nonetheless allow;
  // only flag an explicit list that excludes what we need.
  if (allowMethods && allowMethods !== '*') {
    const allowed = allowMethods.split(',').map((m) => m.trim().toUpperCase());
    if (!allowed.includes(wantMethod)) {
      reasons.push(`Access-Control-Allow-Methods "${allowMethods}" does not include ${wantMethod}`);
    }
  }

  if (wantHeaders.length > 0) {
    if (!allowHeaders) {
      reasons.push(
        `no Access-Control-Allow-Headers — the browser will block ${wantHeaders.join(', ')}`,
      );
    } else if (allowHeaders !== '*') {
      const allowed = allowHeaders.split(',').map((h) => h.trim().toLowerCase());
      const missing = wantHeaders.filter((h) => !allowed.includes(h));
      if (missing.length > 0) {
        reasons.push(`Access-Control-Allow-Headers is missing: ${missing.join(', ')}`);
      }
    }
  }

  return { ok: reasons.length === 0, reasons, allowedOrigin: allowOrigin };
}

/**
 * Minimal --flag value parser. Unknown flags are an error rather than ignored,
 * so a typo cannot silently skip a check.
 *
 * @param {string[]} argv
 * @returns {{ frontend?: string, api?: string, timeoutMs?: number }}
 */
export function parseArgs(argv = []) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--frontend') { out.frontend = argv[++i]; continue; }
    if (arg === '--api') { out.api = argv[++i]; continue; }
    if (arg === '--timeout') { out.timeoutMs = Number(argv[++i]); continue; }
    if (arg === '--help' || arg === '-h') { out.help = true; continue; }
    throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

// ── Live checks (need a real deployment) ───────────────────────────────────

const results = [];
function record(ok, name, detail = '') {
  results.push({ ok, name, detail });
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

async function checkFrontendHtml(frontendUrl, timeoutMs) {
  let response;
  try {
    response = await fetchWithTimeout(frontendUrl, {}, timeoutMs);
  } catch (err) {
    record(false, 'frontend HTML reachable', err?.name === 'AbortError' ? 'timed out' : 'request failed');
    return null;
  }

  if (response.status !== 200) {
    record(false, 'frontend HTML returns 200', `got HTTP ${response.status}`);
    return null;
  }

  const html = await response.text();

  // Markers that distinguish the real app shell from a provider 404/parking page.
  const markers = [
    ['<title>Coder Survival</title>', 'app <title>'],
    ['id="root"', 'mount point #root'],
  ];
  const missing = markers.filter(([needle]) => !html.includes(needle)).map(([, label]) => label);

  if (missing.length > 0) {
    record(false, 'frontend HTML is the application shell', `missing ${missing.join(', ')}`);
    return html;
  }

  record(true, 'frontend HTML returns 200 and is the app shell', `${html.length} bytes`);
  return html;
}

async function checkAssets(html, frontendUrl, timeoutMs) {
  const assets = extractSameOriginAssets(html, frontendUrl);
  if (assets.length === 0) {
    record(false, 'same-origin JS/CSS assets found in HTML', 'none extracted — build output may be missing');
    return;
  }

  let failures = 0;
  for (const assetUrl of assets) {
    try {
      const res = await fetchWithTimeout(assetUrl, {}, timeoutMs);
      if (res.status !== 200) {
        failures += 1;
        record(false, 'asset loads', `HTTP ${res.status} for ${new URL(assetUrl).pathname}`);
      }
    } catch {
      failures += 1;
      record(false, 'asset loads', `request failed for ${new URL(assetUrl).pathname}`);
    }
  }

  if (failures === 0) {
    record(true, 'all same-origin assets load', `${assets.length} checked`);
  }
}

async function checkTonConnectManifest(frontendUrl, timeoutMs) {
  const url = `${frontendUrl}/tonconnect-manifest.json`;
  try {
    const res = await fetchWithTimeout(url, {}, timeoutMs);
    if (res.status !== 200) {
      record(false, '/tonconnect-manifest.json returns 200', `got HTTP ${res.status}`);
      return;
    }
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      const hasUrl = typeof parsed?.url === 'string' && parsed.url !== '';
      record(hasUrl, '/tonconnect-manifest.json is valid JSON', hasUrl ? 'has url field' : 'missing url field');
    } catch {
      record(false, '/tonconnect-manifest.json is valid JSON', 'body did not parse as JSON');
    }
  } catch {
    record(false, '/tonconnect-manifest.json reachable', 'request failed');
  }
}

async function checkApiHealth(apiUrl, timeoutMs) {
  const url = `${apiUrl}/health`;
  try {
    const res = await fetchWithTimeout(url, {}, timeoutMs);
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* handled below */ }

    if (res.status !== 200) {
      // Do NOT print the body: /health error responses include an internal
      // database error string.
      record(false, 'API /health returns 200', `got HTTP ${res.status}`);
      return;
    }
    if (!parsed || typeof parsed !== 'object') {
      record(false, 'API /health returns JSON', 'body did not parse as JSON');
      return;
    }
    record(parsed.status === 'ok', 'API /health reports ok', `status field: ${String(parsed.status)}`);
  } catch (err) {
    record(false, 'API /health reachable', err?.name === 'AbortError' ? 'timed out' : 'request failed');
  }
}

async function checkCorsPreflight(apiUrl, frontendUrl, timeoutMs) {
  const origin = new URL(frontendUrl).origin;
  const requestHeaders = ['content-type', 'x-telegram-init-data'];
  const method = 'POST';

  try {
    const res = await fetchWithTimeout(`${apiUrl}/api/state`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': requestHeaders.join(', '),
      },
    }, timeoutMs);

    const headers = {};
    for (const [key, value] of res.headers.entries()) headers[key.toLowerCase()] = value;

    const verdict = evaluateCorsPreflight(headers, { origin, method, requestHeaders });
    if (verdict.ok) {
      record(true, 'API allows the exact Pages origin', `allow-origin: ${verdict.allowedOrigin}`);
    } else {
      for (const reason of verdict.reasons) record(false, 'CORS preflight', reason);
    }
  } catch (err) {
    record(false, 'CORS preflight reachable', err?.name === 'AbortError' ? 'timed out' : 'request failed');
  }
}

function usage() {
  console.log(`
Cloudflare Pages preview smoke verification

  npm run smoke:cloudflare -- --frontend https://PROJECT.pages.dev \\
                              --api https://coder-survival-api.duckdns.org

Options:
  --frontend <url>   Pages deployment URL (required)
  --api <url>        Backend API origin (required)
  --timeout <ms>     Per-request timeout (default ${DEFAULT_TIMEOUT_MS})

Read-only. Never calls an authenticated economy or payment endpoint.
`.trim());
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`argument error: ${err.message}\n`);
    usage();
    process.exit(1);
  }

  if (args.help) { usage(); process.exit(0); }

  let frontendUrl;
  let apiUrl;
  try {
    frontendUrl = validateBaseUrl(args.frontend, '--frontend');
    apiUrl = validateBaseUrl(args.api, '--api');
  } catch (err) {
    console.error(`argument error: ${err.message}\n`);
    usage();
    process.exit(1);
  }

  const timeoutMs = Number.isFinite(args.timeoutMs) && args.timeoutMs > 0
    ? args.timeoutMs
    : DEFAULT_TIMEOUT_MS;

  console.log('Cloudflare Pages smoke verification');
  console.log(`  frontend: ${frontendUrl}`);
  console.log(`  api     : ${apiUrl}`);
  console.log('');

  const html = await checkFrontendHtml(frontendUrl, timeoutMs);
  if (html) await checkAssets(html, frontendUrl, timeoutMs);
  await checkTonConnectManifest(frontendUrl, timeoutMs);
  await checkApiHealth(apiUrl, timeoutMs);
  await checkCorsPreflight(apiUrl, frontendUrl, timeoutMs);

  const failed = results.filter((r) => !r.ok);
  console.log('');
  console.log(`${results.length - failed.length}/${results.length} checks passed`);

  if (failed.length > 0) {
    console.log('');
    console.log('FAILED. Do not switch the Telegram Mini App URL. Keep Vercel as production.');
    process.exit(1);
  }
  console.log('All checks passed. Continue with manual network/Telegram acceptance.');
}

// Only run the live checks when executed directly, so the unit tests can import
// the pure helpers without performing any network I/O.
const isDirectRun = process.argv[1] && process.argv[1].endsWith('cloudflare-pages-smoke.mjs');
if (isDirectRun) {
  main().catch((err) => {
    console.error(`unexpected error: ${err?.message || err}`);
    process.exit(1);
  });
}
