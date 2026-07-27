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

// Content types a JS/CSS asset may legitimately be served with. Anything else —
// most importantly text/html — means the host answered with an SPA fallback page
// instead of the file, which is a deployment failure that a bare 200 hides.
const JS_CONTENT_TYPES = ['javascript', 'ecmascript'];
const CSS_CONTENT_TYPES = ['css'];

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
 * Decides whether an asset response is actually the file, not an SPA fallback.
 *
 * A single-page host that rewrites unknown paths to index.html answers a missing
 * bundle with HTTP 200 and `text/html`. Checking only the status code would call
 * that a pass and let a broken deployment through, so the Content-Type must
 * match the extension.
 *
 * @param {string} assetUrl Absolute asset URL (extension decides expectation)
 * @param {string|null} contentType Raw Content-Type response header
 * @returns {{ ok: boolean, reason?: string }}
 */
export function evaluateAssetContentType(assetUrl, contentType) {
  let pathname;
  try {
    pathname = new URL(assetUrl).pathname.toLowerCase();
  } catch {
    return { ok: false, reason: 'unparseable asset URL' };
  }

  const isCss = pathname.endsWith('.css');
  const expected = isCss ? CSS_CONTENT_TYPES : JS_CONTENT_TYPES;
  const label = isCss ? 'CSS' : 'JavaScript';

  if (!contentType) {
    return { ok: false, reason: `no Content-Type header (expected ${label})` };
  }

  const value = contentType.toLowerCase();

  // Called out explicitly because it is the SPA-fallback signature and the
  // failure this check exists to catch.
  if (value.includes('text/html')) {
    return {
      ok: false,
      reason: `served as text/html — SPA fallback page, not the ${label} file`,
    };
  }

  if (!expected.some((needle) => value.includes(needle))) {
    return { ok: false, reason: `Content-Type "${contentType}" is not ${label}` };
  }

  return { ok: true };
}

/**
 * Validates a required URL field inside tonconnect-manifest.json.
 *
 * The manifest is what Telegram and TON wallets read, so a placeholder value
 * silently breaks wallet connect. Requires an absolute HTTPS URL and rejects
 * example-domain placeholders.
 *
 * @param {unknown} value
 * @param {string} field Field name for the message
 * @returns {{ ok: boolean, reason?: string }}
 */
export function evaluateManifestUrl(value, field = 'url') {
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, reason: `${field}: missing` };
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return { ok: false, reason: `${field}: not an absolute URL ("${value}")` };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: `${field}: must be https, got ${parsed.protocol}` };
  }

  // RFC 2606 reserved names plus the usual stand-ins: never real endpoints.
  const placeholderHosts = ['example.com', 'example.org', 'example.net', 'localhost'];
  const host = parsed.hostname.toLowerCase();
  if (placeholderHosts.some((p) => host === p || host.endsWith(`.${p}`))) {
    return { ok: false, reason: `${field}: placeholder host "${parsed.hostname}"` };
  }

  return { ok: true };
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
 * @param {number} [expected.status] Preflight HTTP status; must be 2xx
 * @returns {{ ok: boolean, reasons: string[], allowedOrigin: string|null }}
 */
export function evaluateCorsPreflight(headers = {}, expected = {}) {
  const reasons = [];
  const get = (name) => {
    const value = headers[name] ?? headers[name.toLowerCase()] ?? null;
    return typeof value === 'string' ? value : null;
  };

  // A preflight only authorises the real request when it itself succeeds.
  // Browsers reject a non-2xx preflight regardless of the headers on it, so
  // permissive Access-Control-* headers on a 401/404/500 must never read as a
  // pass — otherwise a broken route or an auth wall looks like working CORS.
  const status = expected.status;
  if (typeof status !== 'number' || !Number.isFinite(status)) {
    reasons.push('preflight status unknown — cannot confirm the preflight succeeded');
  } else if (status < 200 || status > 299) {
    reasons.push(`preflight returned HTTP ${status} — browsers require a 2xx preflight`);
  }

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

/**
 * @param {boolean} ok
 * @param {string} name
 * @param {string} detail
 * @param {'deployment'|'repo'} scope Whether a failure indicts the deployment
 *   under test or a defect already committed in the repository. Keeping these
 *   apart matters: a repo-level defect fails identically on Vercel and on Pages,
 *   so counting it as a deployment failure would make a healthy Pages
 *   deployment look broken and muddy the comparison the pilot exists to make.
 */
function record(ok, name, detail = '', scope = 'deployment') {
  results.push({ ok, name, detail, scope });
  const tag = ok ? 'PASS' : 'FAIL';
  const suffix = !ok && scope === 'repo' ? ' [pre-existing repo defect]' : '';
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ''}${suffix}`);
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
  // The mount point is #app — index.html declares <div id="app"> and
  // src/main.jsx calls getElementById("app"). Checking for #root would fail on a
  // perfectly healthy deployment.
  const markers = [
    ['<title>Coder Survival</title>', 'app <title>'],
    ['id="app"', 'mount point #app'],
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
    const pathname = new URL(assetUrl).pathname;
    try {
      const res = await fetchWithTimeout(assetUrl, {}, timeoutMs);
      if (res.status !== 200) {
        failures += 1;
        record(false, 'asset loads', `HTTP ${res.status} for ${pathname}`);
        continue;
      }

      // A 200 alone is not enough: an SPA fallback serves index.html with 200
      // for a missing bundle. The Content-Type is what distinguishes them.
      const verdict = evaluateAssetContentType(assetUrl, res.headers.get('content-type'));
      if (!verdict.ok) {
        failures += 1;
        record(false, 'asset content type', `${pathname}: ${verdict.reason}`);
      }
    } catch {
      failures += 1;
      record(false, 'asset loads', `request failed for ${pathname}`);
    }
  }

  if (failures === 0) {
    record(true, 'all same-origin assets load with correct content types', `${assets.length} checked`);
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
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      record(false, '/tonconnect-manifest.json is valid JSON', 'body did not parse as JSON');
      return;
    }
    record(true, '/tonconnect-manifest.json is valid JSON', 'parsed');

    // The manifest is read by Telegram and TON wallets, so placeholder values
    // break wallet connect even though the file itself serves fine. Checked
    // separately from JSON validity so the failure names the real cause.
    const urlChecks = [
      ['url', parsed?.url],
      ['iconUrl', parsed?.iconUrl],
    ];
    const bad = urlChecks
      .map(([field, value]) => evaluateManifestUrl(value, field))
      .filter((v) => !v.ok);

    if (bad.length === 0) {
      record(true, 'tonconnect manifest URLs are real absolute HTTPS URLs', '');
    } else {
      // Scoped as a repo defect: the manifest is committed in frontend/public,
      // so a placeholder URL fails identically on every host. It is a genuine
      // blocker for TON wallet connect, but it is not evidence against the
      // deployment being smoke-tested.
      for (const v of bad) record(false, 'tonconnect manifest URL', v.reason, 'repo');
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

    const verdict = evaluateCorsPreflight(headers, {
      origin,
      method,
      requestHeaders,
      status: res.status,
    });
    if (verdict.ok) {
      record(true, 'API allows the exact Pages origin', `HTTP ${res.status}, allow-origin: ${verdict.allowedOrigin}`);
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
  const deploymentFailures = failed.filter((r) => r.scope !== 'repo');
  const repoFailures = failed.filter((r) => r.scope === 'repo');

  console.log('');
  console.log(`${results.length - failed.length}/${results.length} checks passed`);

  if (repoFailures.length > 0) {
    console.log('');
    console.log(
      `${repoFailures.length} pre-existing repository defect(s) — these fail on every host, ` +
        'including the current production deployment, and are not caused by the deployment ' +
        'under test. See docs/CLOUDFLARE_PAGES_PILOT.md §5a.',
    );
  }

  if (deploymentFailures.length > 0) {
    console.log('');
    console.log('DEPLOYMENT FAILED. Do not switch the Telegram Mini App URL. Keep Vercel as production.');
    process.exit(1);
  }

  if (repoFailures.length > 0) {
    // Exit 0: the deployment itself is sound. A non-zero exit here would make a
    // healthy Pages deployment indistinguishable from a broken one for as long
    // as the manifest stays unfixed, which is how real regressions get ignored.
    console.log('');
    console.log(
      'Deployment checks passed. Continue with manual network/Telegram acceptance, ' +
        'but resolve the repository defect(s) above before relying on TON wallet connect.',
    );
    return;
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
