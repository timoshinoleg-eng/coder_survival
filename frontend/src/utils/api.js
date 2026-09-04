// Vite injects import.meta.env in dev and build; plain Node (unit tests) does
// not define it. Guarded access keeps this module importable everywhere.
const viteEnv = import.meta.env ?? {};

const configuredApiBaseUrl = viteEnv.VITE_API_BASE_URL || '';
export const API_BASE_URL =
  typeof window !== 'undefined' && window.location.hostname.endsWith('.vercel.app')
    ? ''
    : configuredApiBaseUrl;

// Default per-request timeout. A bad mobile connection must not leave the app
// spinning forever — requests abort and surface a typed error the UI can retry.
const DEFAULT_TIMEOUT_MS = Number(viteEnv.VITE_API_TIMEOUT_MS) || 15000;

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
    this.isTimeout = Boolean(payload && payload.timeout);
    this.isNetwork = Boolean(payload && payload.network);
    this.isInvalidJson = Boolean(payload && payload.invalidJson);
  }
}

// Synthetic init data for LOCAL DEVELOPMENT ONLY (running the mini app in a
// plain browser without Telegram). It must never be sent from a production
// build: doing so would authenticate every non-Telegram visitor as a single
// fake user and pollute analytics. In production we send whatever real initData
// we have (possibly empty), and the backend rejects unauthenticated calls.
export function createDevInitData() {
  return new URLSearchParams({
    user: JSON.stringify({
      id: 100000001,
      username: 'local_coder',
      first_name: 'Local'
    }),
    auth_date: String(Math.floor(Date.now() / 1000))
  }).toString();
}

function resolveInitData(initData) {
  if (initData) return initData;
  if (viteEnv.DEV) return createDevInitData();
  return '';
}

// Short, whitespace-collapsed diagnostic snippet — safe to log/report without
// dumping a whole HTML error page into UI state or analytics.
function diagnosticSnippet(text) {
  return String(text).replace(/\s+/g, ' ').slice(0, 160);
}

export async function apiRequest(path, { method = 'GET', body, initData, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': resolveInitData(initData)
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    const text = await response.text();
    let payload = null;
    let invalidJson = false;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        // Non-JSON body (HTML error page from a proxy, plain text, etc.).
        // NEVER surface this as a successful business response.
        invalidJson = true;
      }
    }

    if (!response.ok) {
      if (invalidJson) {
        throw new ApiError(`Invalid JSON response (HTTP ${response.status})`, response.status, {
          invalidJson: true,
          snippet: diagnosticSnippet(text)
        });
      }
      throw new ApiError(payload?.error || response.statusText, response.status, payload);
    }

    if (invalidJson) {
      // 2xx with a non-empty, non-JSON body is a broken response (e.g. a proxy
      // splash page) — treat it as an application error, not a success and not
      // a network failure.
      throw new ApiError(`Invalid JSON in response body (HTTP ${response.status})`, response.status, {
        invalidJson: true,
        snippet: diagnosticSnippet(text)
      });
    }

    // Empty 2xx body (e.g. 204 No Content) is a legitimate success → null.
    return payload;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err && err.name === 'AbortError') {
      throw new ApiError('Request timed out', 0, { timeout: true });
    }
    throw new ApiError(err?.message || 'Network error', 0, { network: true });
  } finally {
    clearTimeout(timer);
  }
}
