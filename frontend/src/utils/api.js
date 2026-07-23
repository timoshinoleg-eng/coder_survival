const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
const API_BASE_URL =
  typeof window !== 'undefined' && window.location.hostname.endsWith('.vercel.app')
    ? ''
    : configuredApiBaseUrl;

// Default per-request timeout. A bad mobile connection must not leave the app
// spinning forever — requests abort and surface a typed error the UI can retry.
const DEFAULT_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS) || 15000;

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
    this.isTimeout = Boolean(payload && payload.timeout);
    this.isNetwork = Boolean(payload && payload.network);
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
  if (import.meta.env.DEV) return createDevInitData();
  return '';
}

export async function apiRequest(path, { method = 'GET', body, initData, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': resolveInitData(initData)
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        // Non-JSON body (e.g. an HTML error page from a proxy). Preserve a short
        // snippet for diagnostics instead of throwing an opaque SyntaxError.
        payload = { error: text.slice(0, 200) };
      }
    }

    if (!response.ok) {
      throw new ApiError(payload?.error || response.statusText, response.status, payload);
    }

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
