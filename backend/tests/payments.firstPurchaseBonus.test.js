import {
  ensureTestSchema,
  resetTestDatabase,
  testPool,
  TEST_DATABASE_URL,
} from './helpers/testDb.js';

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb('first purchase x2 fulfillment', () => {
  const INTERNAL_SECRET = 'first-purchase-test-secret';
  const originalFlag = process.env.PAYMENTS_ENABLED;
  const originalSecret = process.env.BOT_BACKEND_SECRET;

  let app;
  let pool;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.BOT_BACKEND_SECRET = INTERNAL_SECRET;
    delete process.env.PAYMENTS_ENABLED;
    await ensureTestSchema();
    const mod = await import('../src/index.js');
    app = mod.app;
    pool = mod.pool;
  });

  beforeEach(async () => {
    delete process.env.PAYMENTS_ENABLED;
    await resetTestDatabase();
  });

  afterAll(async () => {
    if (originalFlag === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = originalFlag;
    if (originalSecret === undefined) delete process.env.BOT_BACKEND_SECRET;
    else process.env.BOT_BACKEND_SECRET = originalSecret;
    if (pool) await pool.end();
    if (testPool) await testPool.end();
  });

  async function request(body) {
    const server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/api/internal/payments/telegram/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bot-Backend-Secret': INTERNAL_SECRET,
        },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  async function createPurchase(userId, itemType = 'coffee_break', amount = 25) {
    const result = await testPool.query(
      `INSERT INTO purchases (user_id, item_type, stars_amount, status)
       VALUES ($1, $2, $3, 'pending') RETURNING id`,
      [userId, itemType, amount]
    );
    return result.rows[0].id;
  }

  function confirmBody(telegramId, purchaseId, chargeId) {
    return {
      telegramUserId: telegramId,
      telegramPaymentChargeId: chargeId,
      invoicePayload: `purchase:${purchaseId}:coffee_break`,
      totalAmount: 25,
      currency: 'XTR',
      rawPayment: { test: true },
    };
  }

  test('first eligible payment is x2, replay is no-op, next payment is x1', async () => {
    const telegramId = 920000101;
    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, 'first_bonus') RETURNING id`,
      [telegramId]
    );
    const userId = userResult.rows[0].id;
    await testPool.query(
      `INSERT INTO progression (user_id, energy, depression_level, commits_total)
       VALUES ($1, 10, 100, 0)`,
      [userId]
    );

    const firstPurchaseId = await createPurchase(userId);
    const firstBody = confirmBody(telegramId, firstPurchaseId, 'first_bonus_charge_1');
    const first = await request(firstBody);

    expect(first.status).toBe(200);
    expect(first.body.idempotent).toBe(false);
    expect(first.body.firstPurchaseBonusApplied).toBe(true);

    let progression = await testPool.query(
      `SELECT energy, depression_level FROM progression WHERE user_id = $1`,
      [userId]
    );
    // coffee_break = +50 energy / -10 stress; x2 reaches 100 / 80.
    expect(Number(progression.rows[0].energy)).toBe(100);
    expect(Number(progression.rows[0].depression_level)).toBe(80);

    const audit = await testPool.query(
      `SELECT COUNT(*)::int AS count FROM audit_logs
       WHERE user_id = $1 AND action = 'first_purchase_bonus'`,
      [userId]
    );
    expect(audit.rows[0].count).toBe(1);

    const replay = await request(firstBody);
    expect(replay.status).toBe(200);
    expect(replay.body.idempotent).toBe(true);

    progression = await testPool.query(
      `SELECT energy, depression_level FROM progression WHERE user_id = $1`,
      [userId]
    );
    expect(Number(progression.rows[0].energy)).toBe(100);
    expect(Number(progression.rows[0].depression_level)).toBe(80);

    await testPool.query(
      `UPDATE progression SET energy = 10, depression_level = 100 WHERE user_id = $1`,
      [userId]
    );
    const secondPurchaseId = await createPurchase(userId);
    const second = await request(confirmBody(telegramId, secondPurchaseId, 'first_bonus_charge_2'));

    expect(second.status).toBe(200);
    expect(second.body.firstPurchaseBonusApplied).toBe(false);

    progression = await testPool.query(
      `SELECT energy, depression_level FROM progression WHERE user_id = $1`,
      [userId]
    );
    expect(Number(progression.rows[0].energy)).toBe(60);
    expect(Number(progression.rows[0].depression_level)).toBe(90);
  });

  test('concurrent replay of the same charge returns two 200 responses and credits once', async () => {
    const telegramId = 920000102;
    const userResult = await testPool.query(
      `INSERT INTO users (telegram_id, username) VALUES ($1, 'first_bonus_race') RETURNING id`,
      [telegramId]
    );
    const userId = userResult.rows[0].id;
    await testPool.query(
      `INSERT INTO progression (user_id, energy, depression_level, commits_total)
       VALUES ($1, 10, 100, 0)`,
      [userId]
    );

    const purchaseId = await createPurchase(userId);
    const body = confirmBody(telegramId, purchaseId, 'first_bonus_concurrent_charge');
    const responses = await Promise.all([request(body), request(body)]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 200]);
    expect(responses.map((response) => response.body.idempotent).sort()).toEqual([false, true]);

    const progression = await testPool.query(
      `SELECT energy, depression_level FROM progression WHERE user_id = $1`,
      [userId]
    );
    expect(Number(progression.rows[0].energy)).toBe(100);
    expect(Number(progression.rows[0].depression_level)).toBe(80);

    const payments = await testPool.query(
      `SELECT COUNT(*)::int AS count FROM star_payments
       WHERE telegram_payment_charge_id = $1`,
      ['first_bonus_concurrent_charge']
    );
    expect(payments.rows[0].count).toBe(1);

    const audit = await testPool.query(
      `SELECT COUNT(*)::int AS count FROM audit_logs
       WHERE user_id = $1 AND action = 'first_purchase_bonus'`,
      [userId]
    );
    expect(audit.rows[0].count).toBe(1);
  });

});
