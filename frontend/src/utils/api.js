const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

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

export async function apiRequest(path, { method = 'GET', body, initData } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': initData || createDevInitData()
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (e) {
      console.error('API returned non-JSON:', text.substring(0, 200));
      payload = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(payload?.error || response.statusText, response.status, payload);
  }

  return payload;
}

