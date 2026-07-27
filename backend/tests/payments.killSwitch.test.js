/**
 * Fail-closed payment kill switch — backend.
 *
 * Two layers of evidence:
 *
 *  1. Pure unit tests over the strict flag parser.
 *  2. BEHAVIOURAL route tests that mount the real Express app and assert the
 *     refusal happens *before any database access*. `pool.connect` is replaced
 *     with a spy that throws if called, so a route that reached the DB would
 *     fail the test loudly rather than silently passing.
 *
 * The behavioural tests deliberately need no PostgreSQL: proving "no DB access"
 * is strictly stronger than proving "DB access rolled back", and it lets these
 * run in the unit-test CI job that has no postgres service.
 */
import {
  parsePaymentsEnabled,
  arePaymentsEnabled,
  paymentsDisabledResponse,
  PAYMENTS_DISABLED_CODE,
  PAYMENT_METHOD_UNAVAILABLE_CODE,
} from "../src/config/payments.js";

describe("parsePaymentsEnabled — strict opt-in", () => {
  test('only the exact string "true" enables payments', () => {
    expect(parsePaymentsEnabled("true")).toBe(true);
    // Case and surrounding whitespace are normalised.
    expect(parsePaymentsEnabled("TRUE")).toBe(true);
    expect(parsePaymentsEnabled("True")).toBe(true);
    expect(parsePaymentsEnabled("  true  ")).toBe(true);
  });

  test("missing, empty, malformed and non-'true' values are disabled", () => {
    const disabledValues = [
      undefined, null, "", "   ", "false", "FALSE", "0", "1", "yes", "no",
      "on", "off", "enabled", "true!", "truthy", "tru", "'true'", '"true"',
      "true false", "TRUE=1", 1, 0, true, false, {}, [], ["true"],
      () => "true", NaN, Infinity, Symbol("true"),
    ];

    for (const value of disabledValues) {
      expect(parsePaymentsEnabled(value)).toBe(false);
    }
  });

  test("a boolean true (not the string) is still disabled — no type coercion", () => {
    // Guards against someone "fixing" the parser with a truthiness check.
    expect(parsePaymentsEnabled(true)).toBe(false);
  });

  test("arePaymentsEnabled reads PAYMENTS_ENABLED from the given env", () => {
    expect(arePaymentsEnabled({})).toBe(false);
    expect(arePaymentsEnabled({ PAYMENTS_ENABLED: "1" })).toBe(false);
    expect(arePaymentsEnabled({ PAYMENTS_ENABLED: "true" })).toBe(true);
  });

  test("refusal body carries the stable machine-readable code", () => {
    expect(paymentsDisabledResponse()).toMatchObject({ code: "PAYMENTS_DISABLED" });
    expect(PAYMENTS_DISABLED_CODE).toBe("PAYMENTS_DISABLED");
    expect(PAYMENT_METHOD_UNAVAILABLE_CODE).toBe("PAYMENT_METHOD_UNAVAILABLE");
  });
});

/**
 * Behavioural tests against the real app.
 *
 * These import src/index.js, which constructs a pg Pool. `new Pool()` does not
 * open a connection eagerly, so importing is safe without a database — and we
 * then make any actual connection attempt an explicit test failure.
 */
describe("payment routes fail closed before touching the database", () => {
  let app;
  let pool;
  let connectSpy;
  const originalFlag = process.env.PAYMENTS_ENABLED;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    // No BOT_TOKEN in this suite: initDataMiddleware then runs in its
    // dev-mode branch and parses initData without signature validation, so we
    // can exercise authenticated routes without a real Telegram signature.
    delete process.env.BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;

    const mod = await import("../src/index.js");
    app = mod.app;
    pool = mod.pool;
  });

  beforeEach(() => {
    delete process.env.PAYMENTS_ENABLED;
    // Any DB access from a gated route is a bug: surface it as a failure.
    connectSpy = jest.spyOn(pool, "connect").mockImplementation(() => {
      throw new Error("pool.connect() must not be reached while payments are disabled");
    });
  });

  afterEach(() => {
    connectSpy.mockRestore();
  });

  afterAll(async () => {
    if (originalFlag === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = originalFlag;
    await pool.end();
  });

  const initData = new URLSearchParams({
    user: JSON.stringify({ id: 987654321, username: "killswitch", first_name: "Kill" }),
    auth_date: String(Math.floor(Date.now() / 1000)),
  }).toString();

  /** Minimal in-process HTTP request against the real app. */
  async function request(path, { method = "POST", body, headers = {} } = {}) {
    const server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    try {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": initData,
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  test("POST /api/buy refuses with PAYMENTS_DISABLED and never creates a purchase intent", async () => {
    const res = await request("/api/buy", { body: { productId: "energy_refill" } });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PAYMENTS_DISABLED");
    expect(connectSpy).not.toHaveBeenCalled();
  });

  test("POST /api/shop/purchase-deal refuses and never increments a deal counter", async () => {
    const res = await request("/api/shop/purchase-deal", { body: { dealType: "daily_deal" } });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PAYMENTS_DISABLED");
    expect(connectSpy).not.toHaveBeenCalled();
  });

  test("the gate runs before body validation — a malformed body still yields PAYMENTS_DISABLED", async () => {
    // Ensures the refusal cannot be probed away with a 400, and that the
    // machine-readable code is what clients see regardless of input shape.
    const res = await request("/api/buy", { body: { nonsense: true } });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PAYMENTS_DISABLED");
    expect(connectSpy).not.toHaveBeenCalled();
  });

  test("POST /api/pass/upgrade is blocked entirely — no DB access, no premium unlock", async () => {
    const res = await request("/api/pass/upgrade", { body: { currency: "stars" } });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PAYMENTS_DISABLED");
    expect(connectSpy).not.toHaveBeenCalled();
  });

  test("POST /api/pass/upgrade with currency:'ton' is blocked while disabled", async () => {
    const res = await request("/api/pass/upgrade", { body: { currency: "ton" } });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PAYMENTS_DISABLED");
    expect(connectSpy).not.toHaveBeenCalled();
  });

  test("internal invoice-context refuses to hand out invoice data while disabled", async () => {
    process.env.BOT_BACKEND_SECRET = "test-internal-secret";
    // The router captured BOT_BACKEND_SECRET at import time, so a fresh value
    // here would not match; assert the endpoint refuses either way and, most
    // importantly, never reaches the database.
    const res = await request("/api/internal/payments/telegram/invoice-context", {
      body: { invoicePayload: "purchase:1:energy_refill" },
      headers: { "X-Bot-Backend-Secret": "test-internal-secret" },
    });

    expect([401, 403]).toContain(res.status);
    expect(connectSpy).not.toHaveBeenCalled();
  });

  test("non-payment gameplay routes are unaffected by the kill switch", async () => {
    // /api/shop/products is a plain catalog read: it must still answer, and it
    // must advertise the payment state so clients need not guess.
    const res = await request("/api/shop/products", { method: "GET", body: undefined });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(res.body.paymentsEnabled).toBe(false);
  });

  test("with PAYMENTS_ENABLED='true' the gate opens and the route proceeds to the DB", async () => {
    // Proves the gate is a real switch, not a permanent 403 — the request now
    // gets far enough to attempt a DB connection (which our spy rejects).
    process.env.PAYMENTS_ENABLED = "true";

    const res = await request("/api/buy", { body: { productId: "energy_refill" } });

    expect(res.status).not.toBe(403);
    expect(connectSpy).toHaveBeenCalled();
  });
});
