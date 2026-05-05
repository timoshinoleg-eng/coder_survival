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

  // Default
  const statusCode = err.statusCode || err.status || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;

  res.status(statusCode).json({ 
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
}
