// Unit tests for the API client response handling (plain Node test runner —
// run via `node --test tests/` from frontend/, wired into `npm test`).
//
// Covers the contract fixed in the prod-readiness pass: a 2xx response whose
// body is not valid JSON must NEVER be returned to callers as a successful
// business response, while an empty 2xx/204 body is a legitimate `null`.
import test from 'node:test';
import assert from 'node:assert/strict';

import { apiRequest, ApiError } from '../src/utils/api.js';

const originalFetch = globalThis.fetch;

function mockFetch(impl) {
  globalThis.fetch = impl;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('200 + valid JSON resolves with the parsed payload', async () => {
  mockFetch(async () => new Response(JSON.stringify({ success: true, value: 42 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));

  const result = await apiRequest('/api/anything');
  assert.deepEqual(result, { success: true, value: 42 });
});

test('204 + empty body resolves with null (legitimate empty success)', async () => {
  mockFetch(async () => new Response(null, { status: 204 }));

  const result = await apiRequest('/api/empty');
  assert.equal(result, null);
});

test('200 + HTML body throws ApiError with status, invalidJson flag and snippet — never a success', async () => {
  const html = '<!DOCTYPE html><html><body><h1>Maintenance</h1></body></html>';
  mockFetch(async () => new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } }));

  await assert.rejects(
    () => apiRequest('/api/broken'),
    (err) => {
      assert.ok(err instanceof ApiError, 'must be ApiError');
      assert.equal(err.status, 200, 'HTTP status preserved');
      assert.equal(err.isInvalidJson, true, 'flagged as invalid JSON');
      assert.equal(err.isNetwork, false, 'must NOT be a network error');
      assert.equal(err.isTimeout, false, 'must NOT be a timeout');
      assert.ok(err.payload.snippet.includes('<!DOCTYPE html>'), 'diagnostic snippet retained');
      assert.ok(err.payload.snippet.length <= 160, 'snippet stays short');
      return true;
    },
  );
});

test('502 + HTML body throws ApiError preserving the 502 status', async () => {
  mockFetch(async () => new Response('<html>Bad Gateway</html>', { status: 502 }));

  await assert.rejects(
    () => apiRequest('/api/upstream'),
    (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 502);
      assert.equal(err.isInvalidJson, true);
      assert.equal(err.isNetwork, false);
      assert.ok(err.payload.snippet.includes('Bad Gateway'));
      return true;
    },
  );
});

test('timeout aborts the request and throws a timeout ApiError', async () => {
  mockFetch((url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted', 'AbortError'));
    });
  }));

  await assert.rejects(
    () => apiRequest('/api/slow', { timeoutMs: 25 }),
    (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.isTimeout, true);
      assert.equal(err.isNetwork, false);
      assert.equal(err.isInvalidJson, false);
      return true;
    },
  );
});

test('fetch rejection (connection failure) throws a network ApiError', async () => {
  mockFetch(async () => {
    throw new TypeError('fetch failed');
  });

  await assert.rejects(
    () => apiRequest('/api/down'),
    (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.isNetwork, true);
      assert.equal(err.isTimeout, false);
      assert.equal(err.isInvalidJson, false);
      assert.equal(err.message, 'fetch failed');
      return true;
    },
  );
});

test('non-2xx with valid JSON error body preserves server error message', async () => {
  mockFetch(async () => new Response(JSON.stringify({ error: 'Not enough stars' }), { status: 409 }));

  await assert.rejects(
    () => apiRequest('/api/buy'),
    (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 409);
      assert.equal(err.message, 'Not enough stars');
      assert.equal(err.isInvalidJson, false);
      return true;
    },
  );
});
