import crypto from 'crypto';

/**
 * Constant-time shared-secret comparison for internal service auth headers.
 * Returns false when the secret is not configured (fail-closed) or when
 * lengths differ; never leaks match progress through early exit.
 */
export function secretsMatch(provided, configured) {
  if (!configured || typeof configured !== 'string') return false;
  const a = Buffer.from(String(provided ?? ''));
  const b = Buffer.from(configured);
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}
