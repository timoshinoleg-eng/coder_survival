/**
 * Fail-closed payment gate (personal non-commercial test mode).
 *
 * Real money must never move unless someone has *explicitly* opted in by
 * setting PAYMENTS_ENABLED to exactly "true". Every other value — missing,
 * empty, "1", "yes", "TRUE!", null, a number, an object — means disabled.
 *
 * Fail-closed is the default rather than a fallback branch: a future code path
 * that forgets to check still cannot charge anyone, because the only way to get
 * `true` out of this module is the one exact opt-in string.
 */

/** Stable machine-readable code: payments are globally disabled. */
export const PAYMENTS_DISABLED_CODE = 'PAYMENTS_DISABLED';

/**
 * Stable machine-readable code: payments are on, but this specific method has
 * no verified settlement path, so it must not be offered.
 */
export const PAYMENT_METHOD_UNAVAILABLE_CODE = 'PAYMENT_METHOD_UNAVAILABLE';

export const PAYMENTS_DISABLED_MESSAGE =
  'Платежи отключены: приложение работает в личном некоммерческом тестовом режиме.';

/**
 * Strict opt-in parser. Accepts only the exact string "true" after trimming and
 * lowercasing; anything else (including non-strings) is disabled.
 *
 * @param {unknown} rawValue Raw env value, typically process.env.PAYMENTS_ENABLED
 * @returns {boolean} true only for an explicit "true" opt-in
 */
export function parsePaymentsEnabled(rawValue) {
  if (typeof rawValue !== 'string') {
    return false;
  }
  return rawValue.trim().toLowerCase() === 'true';
}

/**
 * Reads the live flag. Deliberately not cached at module load: tests and
 * operators can flip PAYMENTS_ENABLED without restarting, and a stale cached
 * `true` would be the exact failure this module exists to prevent.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function arePaymentsEnabled(env = process.env) {
  return parsePaymentsEnabled(env.PAYMENTS_ENABLED);
}

/**
 * Canonical refusal body. Kept in one place so clients and tests bind to a
 * stable contract instead of a hand-written literal per route.
 *
 * @param {string} [details] Optional non-sensitive context
 */
export function paymentsDisabledResponse(details) {
  return {
    error: PAYMENTS_DISABLED_MESSAGE,
    code: PAYMENTS_DISABLED_CODE,
    ...(details ? { details } : {}),
  };
}

/**
 * Express guard. Refuses with 403 + PAYMENTS_DISABLED *before* the handler runs,
 * so no route body — and therefore no `pool.connect()`, no INSERT, no reward —
 * is ever reached while payments are disabled.
 */
export function requirePaymentsEnabled(req, res, next) {
  if (!arePaymentsEnabled()) {
    return res.status(403).json(paymentsDisabledResponse());
  }
  return next();
}

/**
 * Express guard: require an authenticated Telegram user.
 *
 * Mounted BEFORE requirePaymentsEnabled on payment routes so an anonymous
 * caller still receives 401 rather than a payment-state disclosure — the
 * kill switch must not become an unauthenticated oracle, and the pre-existing
 * 401 contract for these endpoints is preserved.
 */
export function requireTelegramUser(req, res, next) {
  if (!req.telegramUser?.user) {
    return res.status(401).json({ error: 'No user in initData' });
  }
  return next();
}
