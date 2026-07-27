/**
 * Fail-closed payment gate for the mini app (personal non-commercial test mode).
 *
 * Mirrors backend/src/config/payments.js and bot/src/payments.js: only the exact
 * string "true" enables payments. Vite inlines VITE_PAYMENTS_ENABLED at build
 * time, so a build produced without the flag can never show payment controls.
 *
 * The frontend gate is a usability layer, not the security boundary — the
 * backend and bot refuse independently. It exists so the UI never offers an
 * action that is guaranteed to fail, and so Telegram's openInvoice is
 * unreachable while disabled.
 */

/** Stable machine-readable code, matching the backend contract. */
export const PAYMENTS_DISABLED_CODE = 'PAYMENTS_DISABLED';

export const PAYMENTS_DISABLED_MESSAGE =
  'Платежи отключены: личный некоммерческий тестовый режим.';

/** Short label for inline UI notices where the full sentence does not fit. */
export const PAYMENTS_DISABLED_SHORT = 'Тестовый режим — покупки отключены';

/**
 * Strict opt-in parser: only the exact string "true" (trimmed, lowercased).
 *
 * @param {unknown} rawValue
 * @returns {boolean}
 */
export function parsePaymentsEnabled(rawValue) {
  if (typeof rawValue !== 'string') {
    return false;
  }
  return rawValue.trim().toLowerCase() === 'true';
}

// Guarded access: Vite defines import.meta.env in dev and build, plain Node
// (unit tests) does not. Same pattern as utils/api.js.
const viteEnv = import.meta.env ?? {};

/**
 * @returns {boolean} true only when the build explicitly opted in.
 */
export function arePaymentsEnabled() {
  return parsePaymentsEnabled(viteEnv.VITE_PAYMENTS_ENABLED);
}

/**
 * Thrown instead of starting any purchase flow while payments are disabled.
 * Carries the same machine-readable code the backend returns, so call sites can
 * branch on one contract regardless of which layer refused.
 */
export class PaymentsDisabledError extends Error {
  constructor(message = PAYMENTS_DISABLED_MESSAGE) {
    super(message);
    this.name = 'PaymentsDisabledError';
    this.code = PAYMENTS_DISABLED_CODE;
    this.paymentsDisabled = true;
  }
}
