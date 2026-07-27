/**
 * Fail-closed payment gate for the bot (personal non-commercial test mode).
 *
 * Intentionally dependency-free: no grammy, no dotenv, no network client at
 * import time. That keeps the payment decision logic unit-testable in plain
 * Node, and keeps the rules identical to the backend copy in
 * backend/src/config/payments.js.
 *
 * The bot and backend are separate deploy units with no shared package, so the
 * parser is duplicated rather than imported. Both are covered by tests that
 * assert the same table of accepted/rejected values.
 */

/** Stable machine-readable code: payments are globally disabled. */
export const PAYMENTS_DISABLED_CODE = 'PAYMENTS_DISABLED';

export const PAYMENTS_DISABLED_MESSAGE =
  'Платежи отключены: бот работает в личном некоммерческом тестовом режиме.';

/** Shown to a user who somehow reaches checkout while payments are disabled. */
export const PRE_CHECKOUT_REJECTION_MESSAGE =
  'Платежи временно отключены: некоммерческий тестовый режим. Списание не произошло.';

/**
 * Strict opt-in parser. Only the exact string "true" (trimmed, lowercased)
 * enables payments; everything else — including undefined, "", "1", "yes" and
 * non-strings — is disabled.
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

/**
 * Reads the live flag (not cached, so the switch takes effect without a
 * restart and tests can flip it).
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function arePaymentsEnabled(env = process.env) {
  return parsePaymentsEnabled(env.PAYMENTS_ENABLED);
}

/**
 * Decides how to answer a Telegram pre_checkout_query.
 *
 * Pure function returning a decision object so the handler stays a thin
 * adapter and the rule itself is directly testable.
 *
 * @param {{ currency?: string }} query
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ ok: boolean, errorMessage?: string, reason?: string }}
 */
export function decidePreCheckout(query, env = process.env) {
  if (!arePaymentsEnabled(env)) {
    return {
      ok: false,
      errorMessage: PRE_CHECKOUT_REJECTION_MESSAGE,
      reason: PAYMENTS_DISABLED_CODE,
    };
  }

  if (query?.currency !== 'XTR') {
    return {
      ok: false,
      errorMessage: 'Поддерживаются только Telegram Stars.',
      reason: 'UNSUPPORTED_CURRENCY',
    };
  }

  return { ok: true };
}

/**
 * Redacted description of a payment that arrived while payments were disabled.
 *
 * Carries NO raw identifiers: no Telegram user id, no charge id, no invoice
 * payload, no raw payment object. Only the fact that it happened.
 */
export function redactedDisabledPaymentNotice() {
  return (
    '[payments] successful_payment received while PAYMENTS_ENABLED is not "true". ' +
    'Fulfilling the already-charged payment to avoid charge-without-delivery. ' +
    'Identifiers intentionally omitted.'
  );
}
