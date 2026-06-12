/**
 * Stand-in for a frontend hook/unit test for the tap-queue retry behaviour.
 *
 * The real `flushTapQueue` lives inside `frontend/src/hooks/useGameState.js` and
 * depends on React/Preact hooks, so we cannot run it directly without a test
 * runner. This script mirrors the retry decision logic we fixed and asserts the
 * two key invariants:
 *
 * 1. A short server cooldown (burst_limit, retryAfter <= 10 s) is retried.
 * 2. A long server cooldown (anti-cheat / soft_ban, retryAfter > 10 s) is NOT
 *    retried; the queue is dropped, the lock is released, and the user sees a
 *    clear cooldown message.
 *
 * Run with: node frontend/scripts/tap-queue-regression.mjs
 */

function decideRetry(err, attempts, maxRetryDelayMs = 10000) {
  const rawRetryAfterSeconds = Number(err?.payload?.retryAfter);
  const isRateLimit = err.status === 429;
  const shortCooldown =
    !isRateLimit || !Number.isFinite(rawRetryAfterSeconds) || rawRetryAfterSeconds <= 10;
  const retryDelayMs = isRateLimit
    ? Math.max(
        1000,
        Math.min(
          maxRetryDelayMs,
          (Number.isFinite(rawRetryAfterSeconds) ? rawRetryAfterSeconds : 1) * 1000
        )
      )
    : Math.min(5000, 750 * 2 ** attempts);
  const retryable = isRateLimit || err.status >= 500 || err.status == null;
  const maxAttempts = isRateLimit ? 4 : 3;
  const nextAttempt = attempts + 1;

  if (retryable && nextAttempt <= maxAttempts && shortCooldown) {
    const retryMessage = isRateLimit
      ? "Слишком быстро. Повторяю сохранение..."
      : "Не удалось сохранить тап. Повторяю...";
    return {
      action: "retry",
      retryDelayMs,
      nextAttempt,
      message: nextAttempt === 1 ? retryMessage : undefined,
    };
  }

  return {
    action: "drop",
    nextAttempt: 0,
    message:
      isRateLimit && Number.isFinite(rawRetryAfterSeconds) && rawRetryAfterSeconds > 10
        ? `Слишком быстро. Попробуй снова через ${rawRetryAfterSeconds} сек.`
        : "Не удалось сохранить тап",
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

// --- Burst limit: retryAfter = 1 second -> retry ---
{
  const err = { status: 429, payload: { retryAfter: 1, type: "burst_limit" } };
  const result = decideRetry(err, 0);
  assert(result.action === "retry", "burst_limit should be retried");
  assert(result.retryDelayMs === 1000, "burst_limit retry delay should be 1000 ms");
  assert(
    result.message === "Слишком быстро. Повторяю сохранение...",
    "burst_limit should show retry toast"
  );
  console.log("✓ burst_limit (retryAfter=1) -> retry");
}

// --- Anti-cheat pattern ban: retryAfter = 60 seconds -> drop ---
{
  const err = { status: 429, payload: { retryAfter: 60, type: "pattern_ban" } };
  const result = decideRetry(err, 0);
  assert(result.action === "drop", "pattern_ban should be dropped, not retried");
  assert(result.nextAttempt === 0, "attempts should reset on drop");
  assert(
    result.message === "Слишком быстро. Попробуй снова через 60 сек.",
    "pattern_ban should show cooldown message"
  );
  console.log("✓ pattern_ban (retryAfter=60) -> drop with cooldown message");
}

// --- Rate-limit soft ban: retryAfter = 60 seconds -> drop ---
{
  const err = { status: 429, payload: { retryAfter: 60, type: "soft_ban" } };
  const result = decideRetry(err, 0);
  assert(result.action === "drop", "soft_ban should be dropped");
  assert(
    result.message === "Слишком быстро. Попробуй снова через 60 сек.",
    "soft_ban should show cooldown message"
  );
  console.log("✓ soft_ban (retryAfter=60) -> drop with cooldown message");
}

// --- 5xx server error -> retry with exponential backoff ---
{
  const err = { status: 503, payload: { error: "Service Unavailable" } };
  const result = decideRetry(err, 0);
  assert(result.action === "retry", "5xx should be retried");
  assert(result.retryDelayMs === 750, "first 5xx retry delay should be 750 ms");
  assert(
    result.message === "Не удалось сохранить тап. Повторяю...",
    "5xx retry should show generic retry toast"
  );
  console.log("✓ 503 -> retry with exponential backoff");
}

// --- 400 validation error -> drop ---
{
  const err = { status: 400, payload: { error: "Validation failed" } };
  const result = decideRetry(err, 0);
  assert(result.action === "drop", "400 should be dropped");
  assert(result.message === "Не удалось сохранить тап", "400 should show generic error");
  console.log("✓ 400 -> drop");
}

// --- Attempt exhaustion for burst_limit -> drop ---
{
  const err = { status: 429, payload: { retryAfter: 1, type: "burst_limit" } };
  const result = decideRetry(err, 4); // already exhausted 4 attempts
  assert(result.action === "drop", "exhausted burst_limit should be dropped");
  assert(result.nextAttempt === 0, "attempts should reset after exhaustion");
  console.log("✓ exhausted burst_limit retries -> drop");
}

console.log("\nAll tap-queue regression checks passed.");
