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
  evaluateAssetContentType,
  evaluateManifestUrl,
  evaluateManifest,
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
  </head><body><div id="app"></div></body></html>`;

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

// ── evaluateAssetContentType ───────────────────────────────────────────────

test('an HTML 200 in place of a missing JS bundle FAILS (SPA fallback)', () => {
  // The core case: a single-page host rewrites unknown paths to index.html and
  // answers a missing bundle with HTTP 200 + text/html. A status-only check would
  // call that a pass and ship a broken deployment.
  const verdict = evaluateAssetContentType(
    `${PAGES}/assets/index-a1b2c3.js`,
    'text/html; charset=utf-8',
  );

  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /SPA fallback/i);
});

test('an HTML 200 in place of a missing CSS file also FAILS', () => {
  const verdict = evaluateAssetContentType(`${PAGES}/assets/index-d4e5f6.css`, 'text/html');
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /SPA fallback/i);
});

test('correct JavaScript content types pass', () => {
  for (const ct of [
    'application/javascript',
    'application/javascript; charset=utf-8',
    'text/javascript',
    'application/ecmascript',
    'APPLICATION/JAVASCRIPT',
  ]) {
    const verdict = evaluateAssetContentType(`${PAGES}/assets/app.js`, ct);
    assert.equal(verdict.ok, true, `${ct} should pass: ${verdict.reason || ''}`);
  }
});

test('.mjs is treated as JavaScript', () => {
  assert.equal(evaluateAssetContentType(`${PAGES}/a.mjs`, 'text/javascript').ok, true);
});

test('correct CSS content types pass', () => {
  for (const ct of ['text/css', 'text/css; charset=utf-8', 'TEXT/CSS']) {
    const verdict = evaluateAssetContentType(`${PAGES}/assets/app.css`, ct);
    assert.equal(verdict.ok, true, `${ct} should pass: ${verdict.reason || ''}`);
  }
});

test('a CSS file served as JavaScript FAILS, and vice versa', () => {
  assert.equal(evaluateAssetContentType(`${PAGES}/a.css`, 'application/javascript').ok, false);
  assert.equal(evaluateAssetContentType(`${PAGES}/a.js`, 'text/css').ok, false);
});

test('other non-asset content types FAIL — json, plain text, octet-stream', () => {
  for (const ct of ['application/json', 'text/plain', 'application/octet-stream', 'image/png']) {
    const verdict = evaluateAssetContentType(`${PAGES}/assets/app.js`, ct);
    assert.equal(verdict.ok, false, `${ct} must FAIL`);
  }
});

test('a missing Content-Type header FAILS', () => {
  const verdict = evaluateAssetContentType(`${PAGES}/assets/app.js`, null);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /no Content-Type/i);
});

// ── evaluateManifestUrl ────────────────────────────────────────────────────

test('example.com placeholder manifest URLs FAIL', () => {
  // The manifest currently shipped in frontend/public uses example.com
  // placeholders — a real, pre-existing pilot blocker this check surfaces.
  for (const url of [
    'https://coder-survival.example.com/icon.png',
    'https://example.com/terms',
    'https://sub.example.org/x',
    'https://example.net/y',
  ]) {
    const verdict = evaluateManifestUrl(url, 'iconUrl');
    assert.equal(verdict.ok, false, `${url} must FAIL`);
    assert.match(verdict.reason, /placeholder host/i);
  }
});

test('a real absolute HTTPS manifest URL passes', () => {
  assert.equal(evaluateManifestUrl('https://t.me/CoderSurvivalBot', 'url').ok, true);
  assert.equal(evaluateManifestUrl('https://codersurvival.ru/icon.png', 'iconUrl').ok, true);
});

test('non-HTTPS, relative, and missing manifest URLs FAIL', () => {
  assert.match(evaluateManifestUrl('http://codersurvival.ru', 'url').reason, /must be https/i);
  assert.match(evaluateManifestUrl('/icon.png', 'iconUrl').reason, /not an absolute URL/i);
  assert.match(evaluateManifestUrl('', 'url').reason, /missing/i);
  assert.match(evaluateManifestUrl(undefined, 'url').reason, /missing/i);
  // "localhost:5173" parses as scheme "localhost:", so it is rejected by the
  // https check rather than the parser — either way it cannot pass.
  assert.match(evaluateManifestUrl('localhost:5173', 'url').reason, /must be https/i);
  assert.equal(evaluateManifestUrl('not a url at all', 'url').ok, false);
});

test('a localhost manifest URL FAILS as a placeholder', () => {
  const verdict = evaluateManifestUrl('https://localhost/icon.png', 'iconUrl');
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /placeholder host/i);
});

// ── evaluateManifest (whole-object contract) ───────────────────────────────

const VALID_MANIFEST = {
  url: 'https://t.me/CoderSurvivalBot',
  name: 'Coder Survival',
  iconUrl: 'https://codersurvival.ru/icon.png',
};

test('a manifest with name + required URLs passes', () => {
  const verdict = evaluateManifest(VALID_MANIFEST);
  assert.equal(verdict.ok, true, verdict.reasons.join('; '));
});

test('name is required and must be non-empty', () => {
  for (const name of [undefined, null, '', '   ', 42, {}, []]) {
    const verdict = evaluateManifest({ ...VALID_MANIFEST, name });
    assert.equal(verdict.ok, false, `name=${JSON.stringify(name)} must FAIL`);
    assert.match(verdict.reasons.join(' '), /name: missing or empty/i);
  }
});

test('url and iconUrl remain required', () => {
  for (const field of ['url', 'iconUrl']) {
    const manifest = { ...VALID_MANIFEST };
    delete manifest[field];
    const verdict = evaluateManifest(manifest);
    assert.equal(verdict.ok, false, `missing ${field} must FAIL`);
    assert.match(verdict.reasons.join(' '), new RegExp(`${field}: missing`, 'i'));
  }
});

test('termsOfUseUrl and privacyPolicyUrl are OPTIONAL when absent', () => {
  // Absent (or explicitly null) is a pass — these are not required fields.
  assert.equal(evaluateManifest(VALID_MANIFEST).ok, true);
  assert.equal(
    evaluateManifest({ ...VALID_MANIFEST, termsOfUseUrl: undefined, privacyPolicyUrl: null }).ok,
    true,
  );
});

test('optional URLs must pass the SAME validation when present', () => {
  // A placeholder link surfaced in a wallet is worse than no link at all.
  for (const field of ['termsOfUseUrl', 'privacyPolicyUrl']) {
    for (const bad of [
      'https://coder-survival.example.com/terms',  // placeholder host
      'http://codersurvival.ru/terms',             // not https
      '/terms',                                    // relative
      '',                                          // present but empty
    ]) {
      const verdict = evaluateManifest({ ...VALID_MANIFEST, [field]: bad });
      assert.equal(verdict.ok, false, `${field}=${JSON.stringify(bad)} must FAIL`);
      assert.match(verdict.reasons.join(' '), /optional field, but invalid when present/i);
    }
  }
});

test('valid optional URLs pass', () => {
  const verdict = evaluateManifest({
    ...VALID_MANIFEST,
    termsOfUseUrl: 'https://codersurvival.ru/terms',
    privacyPolicyUrl: 'https://codersurvival.ru/privacy',
  });
  assert.equal(verdict.ok, true, verdict.reasons.join('; '));
});

test('all failures are reported together, not just the first', () => {
  const verdict = evaluateManifest({ name: '', url: '/x', iconUrl: 'http://example.com/i.png' });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.length >= 3, `expected >=3 reasons, got ${verdict.reasons.length}`);
});

test('a non-object manifest FAILS', () => {
  for (const value of [null, undefined, 'string', 42, []]) {
    const verdict = evaluateManifest(value);
    assert.equal(verdict.ok, false, `${String(value)} must FAIL`);
    assert.match(verdict.reasons.join(' '), /not a JSON object/i);
  }
});

test("the repository's current manifest FAILS on its example.com placeholders", () => {
  // Mirrors frontend/public/tonconnect-manifest.json as committed on main —
  // a real, pre-existing blocker rather than a hypothetical.
  const verdict = evaluateManifest({
    url: 'https://t.me/CoderSurvivalBot',
    name: 'Coder Survival',
    iconUrl: 'https://coder-survival.example.com/icon.png',
    termsOfUseUrl: 'https://coder-survival.example.com/terms',
    privacyPolicyUrl: 'https://coder-survival.example.com/privacy',
  });

  assert.equal(verdict.ok, false);
  // name and url are fine; the three example.com URLs are not.
  assert.equal(verdict.reasons.length, 3);
  assert.match(verdict.reasons.join(' '), /placeholder host/i);
});

// ── evaluateCorsPreflight ──────────────────────────────────────────────────

const CORS_EXPECTED = {
  origin: PAGES,
  method: 'POST',
  requestHeaders: ['content-type', 'x-telegram-init-data'],
  status: 204,
};

const GOOD_CORS_HEADERS = {
  'access-control-allow-origin': PAGES,
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'Content-Type, X-Telegram-Init-Data',
};

test('a non-2xx preflight FAILS even with perfectly correct CORS headers', () => {
  // Browsers reject a non-2xx preflight regardless of the headers on it. If this
  // returned ok, an auth wall, a missing route or a 500 would be reported as
  // working CORS — exactly the false pass this check must prevent.
  for (const status of [301, 302, 400, 401, 403, 404, 405, 500, 502, 503]) {
    const verdict = evaluateCorsPreflight(GOOD_CORS_HEADERS, { ...CORS_EXPECTED, status });
    assert.equal(verdict.ok, false, `HTTP ${status} must FAIL`);
    assert.match(verdict.reasons.join(' '), new RegExp(`HTTP ${status}`));
    assert.match(verdict.reasons.join(' '), /2xx/);
  }
});

test('every 2xx status is accepted when the headers are correct', () => {
  for (const status of [200, 204, 206, 299]) {
    const verdict = evaluateCorsPreflight(GOOD_CORS_HEADERS, { ...CORS_EXPECTED, status });
    assert.equal(verdict.ok, true, `HTTP ${status} should pass: ${verdict.reasons.join('; ')}`);
  }
});

test('a missing or non-numeric preflight status FAILS rather than being assumed ok', () => {
  for (const status of [undefined, null, 'ok', NaN, Infinity]) {
    const verdict = evaluateCorsPreflight(GOOD_CORS_HEADERS, { ...CORS_EXPECTED, status });
    assert.equal(verdict.ok, false, `status ${String(status)} must FAIL`);
    assert.match(verdict.reasons.join(' '), /status unknown/i);
  }
});

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

test('a trailing slash in the echoed origin FAILS — the match is literal', () => {
  // A browser's Origin header never carries a trailing slash, so an
  // Access-Control-Allow-Origin of "https://host/" does not match and the
  // request is blocked. Normalising it away would report a misconfigured
  // backend as working CORS, so this must fail.
  const verdict = evaluateCorsPreflight({
    'access-control-allow-origin': `${PAGES}/`,
    'access-control-allow-headers': 'content-type, x-telegram-init-data',
  }, CORS_EXPECTED);

  assert.equal(verdict.ok, false);
  assert.match(verdict.reasons.join(' '), /expected exactly/i);
});

test('any byte-level difference in the echoed origin FAILS', () => {
  for (const echoed of [
    `${PAGES}/`,              // trailing slash
    `${PAGES}//`,             // doubled trailing slash
    ` ${PAGES}`,              // leading space
    `${PAGES} `,              // trailing space
    PAGES.replace('https', 'http'),          // scheme mismatch
    PAGES.toUpperCase(),                     // case-changed host
    `${PAGES}:443`,           // explicit default port
    'https://coder-survival.pages.dev.evil.com', // suffix attack
  ]) {
    const verdict = evaluateCorsPreflight({
      'access-control-allow-origin': echoed,
      'access-control-allow-headers': 'content-type, x-telegram-init-data',
    }, CORS_EXPECTED);

    assert.equal(verdict.ok, false, `"${echoed}" must FAIL`);
  }
});

test('the exact expected origin still passes', () => {
  const verdict = evaluateCorsPreflight({
    'access-control-allow-origin': PAGES,
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
