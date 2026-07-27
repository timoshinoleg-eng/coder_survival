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
// This project runs Jest in ESM mode, where `jest` is not a bare global.
import { jest } from "@jest/globals";
import {
  parsePaymentsEnabled,
  arePaymentsEnabled,
  paymentsDisabledResponse,
  PAYMENTS_DISABLED_CODE,
  PAYMENT_METHOD_UNAVAILABLE_CODE,
} from "../src/config/payments.js";

describe("parsePaymentsEnabled — strict opt-in", () => {
  test('the literal lowercase string "true" is the only value that enables payments', () => {
    expect(parsePaymentsEnabled("true")).toBe(true);
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

  test("case and whitespace near-misses are disabled — the match is literal", () => {
    // Deliberately NOT normalised: an operator who writes PAYMENTS_ENABLED=TRUE
    // gets the safe outcome (disabled) rather than having their near-miss
    // guessed into live payments.
    const nearMisses = [
      "TRUE", "True", "tRuE", "TrUe",
      "  true  ", " true", "true ", "\ttrue", "true\n", "\ntrue\t",
    ];

    for (const value of nearMisses) {
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
    expect(arePaymentsEnabled({ PAYMENTS_ENABLED: "TRUE" })).toBe(false);
    expect(arePaymentsEnabled({ PAYMENTS_ENABLED: " true " })).toBe(false);
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
  const originalBotToken = process.env.BOT_TOKEN;
  const originalTelegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalInternalSecret = process.env.BOT_BACKEND_SECRET;
  const INTERNAL_SECRET = "killswitch-internal-secret";

  beforeAll(async () => {
    // NODE_ENV must be "test" (not "production") for the no-BOT_TOKEN branch
    // below to be the dev path rather than a 500.
    process.env.NODE_ENV = "test";
    // With no BOT_TOKEN, initDataMiddleware runs its dev-mode branch and parses
    // initData without signature validation, so authenticated routes can be
    // exercised without forging a real Telegram signature.
    delete process.env.BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    // MUST be set before importing the app: internalPayments.js captures
    // BOT_BACKEND_SECRET at module load, so a value assigned later would never
    // match and the internal endpoints would answer 401 instead of exercising
    // the payments gate.
    process.env.BOT_BACKEND_SECRET = INTERNAL_SECRET;

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
    if (originalBotToken === undefined) delete process.env.BOT_TOKEN;
    else process.env.BOT_TOKEN = originalBotToken;
    if (originalTelegramBotToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalTelegramBotToken;
    if (originalInternalSecret === undefined) delete process.env.BOT_BACKEND_SECRET;
    else process.env.BOT_BACKEND_SECRET = originalInternalSecret;
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
    // Authenticated with the secret the router captured at import time, so this
    // request clears the 401 auth check and genuinely reaches the payments gate.
    // Requiring exactly 403 + PAYMENTS_DISABLED (rather than accepting 401 too)
    // is what makes this a real proof: if the gate were removed, the request
    // would fall through to the DB and this test would fail.
    const res = await request("/api/internal/payments/telegram/invoice-context", {
      body: { invoicePayload: "purchase:1:energy_refill" },
      headers: { "X-Bot-Backend-Secret": INTERNAL_SECRET },
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PAYMENTS_DISABLED");
    expect(connectSpy).not.toHaveBeenCalled();
  });

  test("internal invoice-context still rejects a wrong secret with 401, not a payment-state leak", async () => {
    // Auth precedes the gate, so an unauthenticated caller must not be able to
    // read the payment state off this endpoint.
    const res = await request("/api/internal/payments/telegram/invoice-context", {
      body: { invoicePayload: "purchase:1:energy_refill" },
      headers: { "X-Bot-Backend-Secret": "wrong-secret" },
    });

    expect(res.status).toBe(401);
    expect(res.body.code).not.toBe("PAYMENTS_DISABLED");
    expect(connectSpy).not.toHaveBeenCalled();
  });

  test("anonymous callers still get 401 — the gate is not an unauthenticated oracle", async () => {
    // Auth is checked before the payments gate, so the pre-existing 401
    // contract holds and the payment state is never disclosed to anonymous
    // callers. Sending no initData header at all.
    const server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    try {
      const { port } = server.address();
      for (const path of ["/api/buy", "/api/shop/purchase-deal", "/api/pass/upgrade"]) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const text = await response.text();
        const parsed = text ? JSON.parse(text) : null;

        expect(response.status).toBe(401);
        expect(parsed?.code).not.toBe("PAYMENTS_DISABLED");
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }

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
    // Proves the gate is a real switch rather than a permanent 403: the request
    // now gets past the guard and reaches the DB layer. Our spy throws there,
    // so the route surfaces a server error — the *status* is incidental; the
    // meaningful assertion is that pool.connect() was reached at all, and that
    // the response is not the PAYMENTS_DISABLED refusal.
    process.env.PAYMENTS_ENABLED = "true";
    // The error handler logs the injected failure; keep the test output clean.
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      const res = await request("/api/buy", { body: { productId: "energy_refill" } });

      expect(res.status).not.toBe(403);
      expect(res.body?.code).not.toBe("PAYMENTS_DISABLED");
      expect(connectSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("with payments ENABLED, currency:'ton' is still refused with PAYMENT_METHOD_UNAVAILABLE and no DB access", async () => {
    // The case the disabled-mode tests cannot reach. TON has no verified
    // settlement path, and the previous implementation unlocked a premium pass
    // for it while charging nothing. Refusing on its own merits — independently
    // of the kill switch — is what stops that free-premium path from silently
    // returning the day payments are switched on.
    process.env.PAYMENTS_ENABLED = "true";

    const res = await request("/api/pass/upgrade", { body: { currency: "ton" } });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PAYMENT_METHOD_UNAVAILABLE");
    // "ton" must not be advertised as payable.
    expect(res.body.supportedCurrencies).not.toContain("ton");
    // Refused before any DB work, so no premium unlock and no purchase row.
    expect(connectSpy).not.toHaveBeenCalled();
  });
});
