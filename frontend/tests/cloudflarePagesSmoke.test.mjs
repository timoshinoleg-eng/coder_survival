// Unit tests for the Cloudflare Pages smoke tool's pure helpers.
//
// The live HTTP checks need a real Pages deployment, which does not exist yet —
// so the logic that decides PASS/FAIL is factored into pure functions and tested
// here with no network, no Pages project, and no dependencies beyond node:test.
//
// Importing the script must not perform any I/O: it only runs main() when
// executed directly.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateBaseUrl,
  extractSameOriginAssets,
  evaluateCorsPreflight,
  parseArgs,
} from '../scripts/cloudflare-pages-smoke.mjs';

const PAGES = 'https://coder-survival.pages.dev';
const API = 'https://coder-survival-api.duckdns.org';

// ── validateBaseUrl ────────────────────────────────────────────────────────

test('accepts https and http URLs', () => {
  assert.equal(validateBaseUrl(PAGES), PAGES);
  assert.equal(validateBaseUrl('http://localhost:5173'), 'http://localhost:5173');
});

test('strips trailing slashes so joined paths never double up', () => {
  assert.equal(validateBaseUrl(`${PAGES}/`), PAGES);
  assert.equal(validateBaseUrl(`${PAGES}///`), PAGES);
});

test('trims surrounding whitespace', () => {
  assert.equal(validateBaseUrl(`  ${PAGES}  `), PAGES);
});

test('rejects a missing or empty URL', () => {
  for (const value of [undefined, null, '', '   ', 42, {}]) {
    assert.throws(() => validateBaseUrl(value, '--frontend'), /required/i,
      `expected ${String(value)} to be rejected`);
  }
});

test('rejects non-http(s) schemes — file, data, javascript, ftp', () => {
  // A mistyped argument must never make the script read a local file or
  // evaluate a pseudo-URL and report a misleading pass.
  for (const value of [
    'file:///etc/passwd',
    'data:text/html,<h1>x</h1>',
    'javascript:alert(1)',
    'ftp://example.com',
    'ws://example.com',
  ]) {
    assert.throws(() => validateBaseUrl(value, '--api'), /only http\/https/i,
      `expected ${value} to be rejected`);
  }
});

test('rejects a value that is not a parseable absolute URL', () => {
  for (const value of ['not a url', 'example.com', '/relative/path']) {
    assert.throws(() => validateBaseUrl(value, '--frontend'), /valid absolute URL/i);
  }
});

test('rejects a URL carrying a query string or fragment', () => {
  assert.throws(() => validateBaseUrl(`${PAGES}?x=1`), /query string or fragment/i);
  assert.throws(() => validateBaseUrl(`${PAGES}#hash`), /query string or fragment/i);
});

// ── extractSameOriginAssets ────────────────────────────────────────────────

test('extracts hashed JS and CSS bundles from built HTML', () => {
  const html = `<!DOCTYPE html><html><head>
    <script type="module" crossorigin src="/assets/index-a1b2c3.js"></script>
    <link rel="stylesheet" href="/assets/index-d4e5f6.css">
  </head><body><div id="root"></div></body></html>`;

  const assets = extractSameOriginAssets(html, PAGES);
  assert.deepEqual(assets.sort(), [
    `${PAGES}/assets/index-a1b2c3.js`,
    `${PAGES}/assets/index-d4e5f6.css`,
  ].sort());
});

test('ignores third-party scripts — they are not what a Pages deploy controls', () => {
  const html = `<html><head>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <script src="https://sad.adsgram.ai/js/sad.min.js"></script>
    <script type="module" src="/assets/app.js"></script>
  </head></html>`;

  assert.deepEqual(extractSameOriginAssets(html, PAGES), [`${PAGES}/assets/app.js`]);
});

test('resolves relative and root-relative paths against the frontend origin', () => {
  const html = `<html><head>
    <script src="assets/rel.js"></script>
    <link rel="stylesheet" href="/assets/abs.css">
  </head></html>`;

  const assets = extractSameOriginAssets(html, PAGES);
  assert.ok(assets.includes(`${PAGES}/assets/rel.js`), 'relative path resolved');
  assert.ok(assets.includes(`${PAGES}/assets/abs.css`), 'root-relative path resolved');
});

test('ignores non-JS/CSS links such as icons, manifests and preconnects', () => {
  const html = `<html><head>
    <link rel="icon" href="/favicon.png">
    <link rel="manifest" href="/manifest.webmanifest">
    <link rel="preconnect" href="https://fonts.example.com">
    <script src="/assets/app.js"></script>
  </head></html>`;

  assert.deepEqual(extractSameOriginAssets(html, PAGES), [`${PAGES}/assets/app.js`]);
});

test('de-duplicates a repeated asset reference', () => {
  const html = `<html><head>
    <script src="/assets/app.js"></script>
    <script src="/assets/app.js"></script>
  </head></html>`;

  assert.equal(extractSameOriginAssets(html, PAGES).length, 1);
});

test('handles empty, non-string and asset-free HTML without throwing', () => {
  assert.deepEqual(extractSameOriginAssets('', PAGES), []);
  assert.deepEqual(extractSameOriginAssets(undefined, PAGES), []);
  assert.deepEqual(extractSameOriginAssets('<html><body>hi</body></html>', PAGES), []);
});

test('skips data: URIs and unparseable src values', () => {
  const html = `<html><head>
    <script src="data:text/javascript,void 0"></script>
    <script src="/assets/real.js"></script>
  </head></html>`;

  assert.deepEqual(extractSameOriginAssets(html, PAGES), [`${PAGES}/assets/real.js`]);
});

// ── evaluateCorsPreflight ──────────────────────────────────────────────────

const CORS_EXPECTED = {
  origin: PAGES,
  method: 'POST',
  requestHeaders: ['content-type', 'x-telegram-init-data'],
};

test('passes when the exact origin and both required headers are allowed', () => {
  const verdict = evaluateCorsPreflight({
    'access-control-allow-origin': PAGES,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Content-Type, X-Telegram-Init-Data',
  }, CORS_EXPECTED);

  assert.equal(verdict.ok, true, verdict.reasons.join('; '));
  assert.equal(verdict.allowedOrigin, PAGES);
});

test('fails when the allow-origin header is absent — origin not allowlisted', () => {
  const verdict = evaluateCorsPreflight({}, CORS_EXPECTED);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reasons.join(' '), /no Access-Control-Allow-Origin/i);
});

test('fails on a wildcard origin rather than reporting a false pass', () => {
  // The backend is expected to allowlist the exact origin. A wildcard also
  // cannot be combined with credentialed requests, so treating it as success
  // would mask a misconfiguration.
  const verdict = evaluateCorsPreflight({
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
  }, CORS_EXPECTED);

  assert.equal(verdict.ok, false);
  assert.match(verdict.reasons.join(' '), /"\*"/);
});

test('fails when a different origin is allowed (e.g. only Vercel)', () => {
  const verdict = evaluateCorsPreflight({
    'access-control-allow-origin': 'https://frontend-ashy-alpha-77.vercel.app',
    'access-control-allow-headers': 'content-type, x-telegram-init-data',
  }, CORS_EXPECTED);

  assert.equal(verdict.ok, false);
  assert.match(verdict.reasons.join(' '), /expected/i);
});

test('tolerates a trailing slash difference in the echoed origin', () => {
  const verdict = evaluateCorsPreflight({
    'access-control-allow-origin': `${PAGES}/`,
    'access-control-allow-headers': 'content-type, x-telegram-init-data',
  }, CORS_EXPECTED);

  assert.equal(verdict.ok, true, verdict.reasons.join('; '));
});

test('fails when x-telegram-init-data is not among the allowed headers', () => {
  // The app cannot authenticate without this header, so allowing only
  // content-type is a real regression the check must catch.
  const verdict = evaluateCorsPreflight({
    'access-control-allow-origin': PAGES,
    'access-control-allow-headers': 'content-type',
  }, CORS_EXPECTED);

  assert.equal(verdict.ok, false);
  assert.match(verdict.reasons.join(' '), /x-telegram-init-data/i);
});

test('fails when the allow-headers header is missing entirely', () => {
  const verdict = evaluateCorsPreflight({
    'access-control-allow-origin': PAGES,
  }, CORS_EXPECTED);

  assert.equal(verdict.ok, false);
  assert.match(verdict.reasons.join(' '), /Access-Control-Allow-Headers/i);
});

test('accepts a wildcard allow-headers when the origin is exact', () => {
  const verdict = evaluateCorsPreflight({
    'access-control-allow-origin': PAGES,
    'access-control-allow-headers': '*',
  }, CORS_EXPECTED);

  assert.equal(verdict.ok, true, verdict.reasons.join('; '));
});

test('header matching is case-insensitive on both name and value', () => {
  const verdict = evaluateCorsPreflight({
    'access-control-allow-origin': PAGES,
    'access-control-allow-methods': 'post, options',
    'access-control-allow-headers': 'CONTENT-TYPE, X-TELEGRAM-INIT-DATA',
  }, CORS_EXPECTED);

  assert.equal(verdict.ok, true, verdict.reasons.join('; '));
});

test('fails when an explicit method list excludes the requested method', () => {
  const verdict = evaluateCorsPreflight({
    'access-control-allow-origin': PAGES,
    'access-control-allow-methods': 'GET',
    'access-control-allow-headers': 'content-type, x-telegram-init-data',
  }, CORS_EXPECTED);

  assert.equal(verdict.ok, false);
  assert.match(verdict.reasons.join(' '), /does not include POST/i);
});

// ── parseArgs ──────────────────────────────────────────────────────────────

test('parses the documented flags', () => {
  const args = parseArgs(['--frontend', PAGES, '--api', API, '--timeout', '5000']);
  assert.deepEqual(args, { frontend: PAGES, api: API, timeoutMs: 5000 });
});

test('rejects an unknown flag instead of silently skipping a check', () => {
  assert.throws(() => parseArgs(['--frontned', PAGES]), /unknown argument/i);
});

test('supports --help', () => {
  assert.equal(parseArgs(['--help']).help, true);
});
