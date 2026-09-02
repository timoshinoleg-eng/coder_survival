from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, got {count}")
    return text.replace(old, new, 1)


balance_path = Path('backend/src/config/balance.js')
balance = balance_path.read_text()
balance = replace_once(
    balance,
    "console.assert(STAGE2.PASS.LEVELS.length === 20, 'Level count must be 50');",
    "console.assert(STAGE2.PASS.LEVELS.length === 20, 'Level count must be 20');",
    'pass assertion message',
)
balance_path.write_text(balance)

payments_path = Path('backend/src/routes/internalPayments.js')
payments = payments_path.read_text()
needle = """      // Serialize paid fulfillment per user so two simultaneous first purchases
      // cannot both observe an empty payment history and both receive the x2 bonus.
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [userId]);

      const purchaseResult = await client.query("""
replacement = """      // Serialize paid fulfillment per user so two simultaneous first purchases
      // cannot both observe an empty payment history and both receive the x2 bonus.
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [userId]);

      // A duplicate callback can pass the optimistic pre-lock lookup while the
      // first callback is still uncommitted. Re-check after acquiring the user
      // lock so concurrent replays return the same idempotent 200 instead of
      // reaching the unique charge constraint after reward application.
      const existingPaymentAfterLock = await client.query(
        `SELECT id, user_id, purchase_id, item_type, stars_amount
         FROM star_payments
         WHERE telegram_payment_charge_id = $1`,
        [telegramPaymentChargeId]
      );
      if (existingPaymentAfterLock.rows.length > 0) {
        await client.query('COMMIT');
        if (paymentsWereDisabled) {
          alertPaymentWhileDisabled({ itemType: parsed.itemType, idempotent: true });
        }
        return res.status(200).json({
          success: true,
          idempotent: true,
          payment: existingPaymentAfterLock.rows[0],
          ...(paymentsWereDisabled ? { paymentsDisabled: true } : {})
        });
      }

      const purchaseResult = await client.query("""
payments = replace_once(payments, needle, replacement, 'post-lock payment recheck')
payments_path.write_text(payments)

test_path = Path('backend/tests/payments.firstPurchaseBonus.test.js')
test_src = test_path.read_text()
insert_before = "\n});\n"
if not test_src.endswith(insert_before):
    raise SystemExit('payment test suite closing marker not found')
concurrency_test = """

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
"""
test_src = test_src[:-len(insert_before)] + concurrency_test + insert_before
test_path.write_text(test_src)

print('UPDATED backend/src/config/balance.js')
print('UPDATED backend/src/routes/internalPayments.js')
print('UPDATED backend/tests/payments.firstPurchaseBonus.test.js')
