/**
 * Already-charged payments must still be delivered — even while the payment
 * kill switch is engaged.
 *
 * The switch exists to stop NEW charges. By the time /telegram/confirm fires,
 * Telegram has already debited the user, so refusing would create
 * charge-without-delivery: strictly worse than the risk being mitigated. Absent
 * an automatic refund path, the correct behaviour is idempotent fulfillment
 * plus a redacted anomaly alert.
 *
 * These are DB-backed (they assert real reward crediting and real idempotency),
 * so they run in the backend-tests workflow which provides a postgres service,
 * and self-skip locally when no test database is configured — matching the
 * established pattern in this suite.
 */
// This project runs Jest in ESM mode, where `jest` is not a bare global.
import { jest } from "@jest/globals";
import {
  ensureTestSchema,
  resetTestDatabase,
  testPool,
  TEST_DATABASE_URL,
} from "./helpers/testDb.js";

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb("payment fulfillment while payments are disabled", () => {
  const INTERNAL_SECRET = "confirm-test-secret";
  const originalFlag = process.env.PAYMENTS_ENABLED;
  const originalSecret = process.env.BOT_BACKEND_SECRET;

  let app;
  let pool;
  let warnSpy;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    // Must be set BEFORE importing the router: it captures the secret at
    // module load time.
    process.env.BOT_BACKEND_SECRET = INTERNAL_SECRET;
    // The kill switch is engaged for every test in this file.
    delete process.env.PAYMENTS_ENABLED;

    await ensureTestSchema();

    const mod = await import("../src/index.js");
    app = mod.app;
    pool = mod.pool;
  });

  beforeEach(async () => {
    delete process.env.PAYMENTS_ENABLED;
    await resetTestDatabase();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  afterAll(async () => {
    if (originalFlag === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = originalFlag;
    if (originalSecret === undefined) delete process.env.BOT_BACKEND_SECRET;
    else process.env.BOT_BACKEND_SECRET = originalSecret;

    if (pool) await pool.end();
    if (testPool) await testPool.end();
  });

  async function request(path, { body, headers = {} } = {}) {
    const server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    try {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  async function seedPendingPurchase(telegramId, itemType, starsAmount) {
    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id`,
      [telegramId, `payer_${telegramId}`],
    );
    const userId = userResult.rows[0].id;
    await testPool.query(
      `INSERT INTO progression (user_id, energy, depression_level, commits_total)
       VALUES ($1, 10, 0, 0)`,
      [userId],
    );
    const purchaseResult = await testPool.query(
      `INSERT INTO purchases (user_id, item_type, stars_amount, status)
       VALUES ($1, $2, $3, 'pending') RETURNING id`,
      [userId, itemType, starsAmount],
    );
    return { userId, purchaseId: purchaseResult.rows[0].id };
  }

  function confirmBody({ telegramId, purchaseId, itemType, amount, chargeId }) {
    return {
      telegramUserId: telegramId,
      telegramPaymentChargeId: chargeId,
      providerPaymentChargeId: null,
      invoicePayload: `purchase:${purchaseId}:${itemType}`,
      totalAmount: amount,
      currency: "XTR",
      rawPayment: { note: "test" },
    };
  }

  test("an already-charged payment is still fulfilled and the reward is credited", async () => {
    const telegramId = 910000101;
    const itemType = "energy_refill";
    const amount = 50;
    const { userId, purchaseId } = await seedPendingPurchase(telegramId, itemType, amount);

    const res = await request("/api/internal/payments/telegram/confirm", {
      headers: { "X-Bot-Backend-Secret": INTERNAL_SECRET },
      body: confirmBody({ telegramId, purchaseId, itemType, amount, chargeId: "charge_disabled_1" }),
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Signals the anomaly to the caller without leaking identifiers.
    expect(res.body.paymentsDisabled).toBe(true);

    // The purchase is completed and the payment recorded — real delivery.
    const purchase = await testPool.query(`SELECT status FROM purchases WHERE id = $1`, [purchaseId]);
    expect(purchase.rows[0].status).toBe("completed");

    const payment = await testPool.query(
      `SELECT status FROM star_payments WHERE telegram_payment_charge_id = $1`,
      ["charge_disabled_1"],
    );
    expect(payment.rows).toHaveLength(1);
    expect(payment.rows[0].status).toBe("completed");

    // energy_refill tops energy up to max — the effect was actually applied.
    const progression = await testPool.query(
      `SELECT energy FROM progression WHERE user_id = $1`,
      [userId],
    );
    expect(Number(progression.rows[0].energy)).toBeGreaterThan(10);
  });

  test("fulfillment stays idempotent — a replayed charge credits nothing twice", async () => {
    const telegramId = 910000102;
    const itemType = "energy_refill";
    const amount = 50;
    const { purchaseId } = await seedPendingPurchase(telegramId, itemType, amount);
    const body = confirmBody({ telegramId, purchaseId, itemType, amount, chargeId: "charge_disabled_2" });

    const first = await request("/api/internal/payments/telegram/confirm", {
      headers: { "X-Bot-Backend-Secret": INTERNAL_SECRET },
      body,
    });
    const second = await request("/api/internal/payments/telegram/confirm", {
      headers: { "X-Bot-Backend-Secret": INTERNAL_SECRET },
      body,
    });

    expect(first.status).toBe(200);
    expect(first.body.idempotent).toBe(false);
    expect(second.status).toBe(200);
    expect(second.body.idempotent).toBe(true);

    const payments = await testPool.query(
      `SELECT id FROM star_payments WHERE telegram_payment_charge_id = $1`,
      ["charge_disabled_2"],
    );
    expect(payments.rows).toHaveLength(1);
  });

  test("the anomaly is logged without any payment identifiers", async () => {
    const telegramId = 910000103;
    const itemType = "energy_refill";
    const amount = 50;
    const chargeId = "charge_secret_abc123";
    const { purchaseId } = await seedPendingPurchase(telegramId, itemType, amount);
    const invoicePayload = `purchase:${purchaseId}:${itemType}`;

    await request("/api/internal/payments/telegram/confirm", {
      headers: { "X-Bot-Backend-Secret": INTERNAL_SECRET },
      body: confirmBody({ telegramId, purchaseId, itemType, amount, chargeId }),
    });

    expect(warnSpy).toHaveBeenCalled();
    const logged = warnSpy.mock.calls.flat().join(" ");

    // The alert must name neither the user, the charge, nor the payload.
    expect(logged).not.toContain(String(telegramId));
    expect(logged).not.toContain(chargeId);
    expect(logged).not.toContain(invoicePayload);
    // ...but must still be actionable.
    expect(logged).toContain(itemType);
  });

  test("an unauthenticated confirm is still rejected while disabled", async () => {
    const res = await request("/api/internal/payments/telegram/confirm", {
      headers: { "X-Bot-Backend-Secret": "wrong-secret" },
      body: confirmBody({
        telegramId: 910000104,
        purchaseId: 1,
        itemType: "energy_refill",
        amount: 50,
        chargeId: "charge_disabled_4",
      }),
    });

    expect(res.status).toBe(401);
  });
});
