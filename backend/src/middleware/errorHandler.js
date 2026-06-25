import { sendAlert } from '../utils/alertSender.js';

/**
 * Глобальный обработчик ошибок
 */
export function errorHandler(err, req, res, next) {
  console.error('API Error:', err);

  // PostgreSQL ошибки
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Conflict: resource already exists' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Foreign key violation' });
  }

  // JWT / Auth ошибки
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Default — never expose stack traces or internal messages to clients
  const statusCode = err.statusCode || err.status || 500;
  const message = 'Internal server error';

  // 5xx alert tracking
  if (statusCode >= 500) {
    track5xxError(err);
  }

  res.status(statusCode).json({ error: message });
}

// --- 5xx error rate tracking ---
const _5xxErrors = [];

function track5xxError(err) {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000; // 5 minutes
  _5xxErrors.push(now);

  // Prune old entries
  while (_5xxErrors.length > 0 && _5xxErrors[0] < now - windowMs) {
    _5xxErrors.shift();
  }

  if (_5xxErrors.length > 10) {
    const count = _5xxErrors.length;
    // Reset counter after alert to avoid spam
    _5xxErrors.length = 0;
    sendAlert(`5xx spike: ${count}+ errors in 5 min. Latest: ${err.message}`);
  }
}
