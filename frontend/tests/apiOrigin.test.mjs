// Provider-neutral API origin resolution (plain Node test runner — no Vite, no
// bundler, no network).
//
// The contract under test: which API origin the frontend talks to must depend
// ONLY on the configured VITE_API_BASE_URL value, never on the hostname the app
// is served from. That is what allows one source build to run on Vercel
// (same-origin rewrites), on Cloudflare Pages (explicit cross-origin API), and
// locally (Vite's /api proxy) without a per-provider branch.
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveApiBaseUrl, buildRequestUrl, apiRequest, ApiError } from '../src/utils/api.js';

const PROD_API = 'https://coder-survival-api.duckdns.org';

// ── resolveApiBaseUrl: same-origin cases ────────────────────────────────────

test('undefined VITE_API_BASE_URL means same-origin', () => {
  // Vercel today: no variable set, requests go to /api/... and vercel.json
  // rewrites them to the API host.
  assert.equal(resolveApiBaseUrl(undefined), '');
});

test('empty string VITE_API_BASE_URL means same-origin', () => {
  // A dashboard field that exists but was left blank.
  assert.equal(resolveApiBaseUrl(''), '');
});

test('whitespace-only VITE_API_BASE_URL means same-origin (documented safe behaviour)', () => {
  // Explicitly specified rather than incidental: a stray space or newline pasted
  // into a provider dashboard must NOT become the origin (which would build
  // requests against " /api/..." and fail every call). Treating it as "not
  // configured" falls back to same-origin, which is also the correct behaviour
  // for a properly configured Vercel deploy.
  for (const value of [' ', '   ', '\t', '\n', ' \t\n ']) {
    assert.equal(resolveApiBaseUrl(value), '', `expected ${JSON.stringify(value)} to be same-origin`);
  }
});

test('non-string values mean same-origin — no coercion', () => {
  for (const value of [null, 0, 1, false, true, {}, [], NaN]) {
    assert.equal(resolveApiBaseUrl(value), '', `expected ${String(value)} to be same-origin`);
  }
});

// ── resolveApiBaseUrl: configured cases ────────────────────────────────────

test('an explicit API origin is retained verbatim', () => {
  assert.equal(resolveApiBaseUrl(PROD_API), PROD_API);
});

test('trailing slashes are normalised away', () => {
  // Guards the `//api` bug class: `${base}${path}` with a trailing slash would
  // otherwise emit https://host//api/state.
  assert.equal(resolveApiBaseUrl(`${PROD_API}/`), PROD_API);
  assert.equal(resolveApiBaseUrl(`${PROD_API}//`), PROD_API);
  assert.equal(resolveApiBaseUrl(`${PROD_API}///`), PROD_API);
});

test('surrounding whitespace around a real URL is trimmed', () => {
  assert.equal(resolveApiBaseUrl(`  ${PROD_API}  `), PROD_API);
  assert.equal(resolveApiBaseUrl(`\t${PROD_API}/\n`), PROD_API);
});

test('a path-suffixed origin keeps its path but loses the trailing slash', () => {
  // Not the pilot configuration, but must not silently corrupt if used.
  assert.equal(resolveApiBaseUrl('https://gateway.example.com/edge/'), 'https://gateway.example.com/edge');
});

// ── Provider neutrality ────────────────────────────────────────────────────

test('resolution is hostname-independent — no provider special case', () => {
  // The resolver takes only the configured value: there is no window/hostname
  // input it could branch on. Simulating each provider host must therefore give
  // an identical result for identical configuration.
  const hosts = [
    'frontend-ashy-alpha-77.vercel.app',
    'coder-survival.pages.dev',
    'codersurvival.ru',
    'localhost',
  ];

  for (const hostname of hosts) {
    const originalWindow = globalThis.window;
    globalThis.window = { location: { hostname, origin: `https://${hostname}` } };
    try {
      // Configured -> honoured on every host, including *.vercel.app, which the
      // previous implementation forced to same-origin.
      assert.equal(resolveApiBaseUrl(PROD_API), PROD_API, `configured value must survive on ${hostname}`);
      // Unconfigured -> same-origin on every host.
      assert.equal(resolveApiBaseUrl(''), '', `empty value must be same-origin on ${hostname}`);
    } finally {
      if (originalWindow === undefined) delete globalThis.window;
      else globalThis.window = originalWindow;
    }
  }
});

// ── buildRequestUrl: exactly one slash ─────────────────────────────────────

test('same-origin base leaves the path relative', () => {
  assert.equal(buildRequestUrl('', '/api/state'), '/api/state');
});

test('configured base produces exactly one slash before the path', () => {
  const url = buildRequestUrl(PROD_API, '/api/state');
  assert.equal(url, `${PROD_API}/api/state`);
  // No `//` anywhere after the scheme.
  assert.equal(url.slice('https://'.length).includes('//'), false);
});

test('a normalised trailing-slash base still yields one slash', () => {
  const base = resolveApiBaseUrl(`${PROD_API}/`);
  assert.equal(buildRequestUrl(base, '/api/state'), `${PROD_API}/api/state`);
});

test('a path missing its leading slash is still joined correctly', () => {
  assert.equal(buildRequestUrl(PROD_API, 'api/state'), `${PROD_API}/api/state`);
  assert.equal(buildRequestUrl('', 'api/state'), '/api/state');
});

test('query strings and nested paths survive unchanged', () => {
  assert.equal(
    buildRequestUrl(PROD_API, '/api/meme?templateId=deploy_friday&format=9:16'),
    `${PROD_API}/api/meme?templateId=deploy_friday&format=9:16`,
  );
});

// ── Integration: the resolved origin is what fetch actually receives ───────

test('apiRequest issues a single-slash URL through the resolved origin', async () => {
  // In plain Node import.meta.env is undefined, so the module resolves to
  // same-origin — the Vercel/local default. Assert the real request URL rather
  // than trusting the resolver in isolation.
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await apiRequest('/api/state');
    assert.equal(calls.length, 1);
    assert.equal(calls[0], '/api/state');
    assert.equal(calls[0].includes('//'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ApiError behaviour is unchanged by the origin refactor', async () => {
  // Regression guard: the refactor touched only URL construction, so the typed
  // error contract must be untouched.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('nope', { status: 500 });

  try {
    await assert.rejects(
      () => apiRequest('/api/state'),
      (err) => err instanceof ApiError && err.status === 500,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
