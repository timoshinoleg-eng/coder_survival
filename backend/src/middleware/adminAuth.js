import crypto from 'crypto';

/**
 * Admin authentication middleware.
 *
 * Protects privileged/administrative endpoints (e.g. season rotation, which
 * triggers premium refunds and season creation). Uses a static shared secret
 * supplied via the `X-Admin-Secret` header and compared in constant time.
 *
 * Fail-closed: if ADMIN_API_SECRET is not configured, every request is rejected
 * (503) rather than left open. This prevents the endpoint from being reachable
 * by anonymous callers when the operator forgets to set the secret.
 */
export function adminAuthMiddleware(req, res, next) {
  const configured = process.env.ADMIN_API_SECRET;
  if (!configured) {
    console.error('[adminAuth] ADMIN_API_SECRET is not configured — refusing admin request');
    return res.status(503).json({ error: 'Admin API not configured' });
  }

  const provided = req.get('X-Admin-Secret') || '';
  const a = Buffer.from(provided);
  const b = Buffer.from(configured);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!ok) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}
