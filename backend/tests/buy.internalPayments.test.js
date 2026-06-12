import { jest } from '@jest/globals';
import express from 'express';
import { closeServer, listenOnFetchSafePort } from './helpers/testServer.js';

const mockQuery = jest.fn();

const mockPool = {
  query: mockQuery,
  connect: jest.fn().mockResolvedValue({ query: mockQuery, release: jest.fn() }),
  on: jest.fn(),
  end: jest.fn(),
};

jest.unstable_mockModule('../src/index.js', () => ({
  __esModule: true,
  pool: mockPool,
}));

let buyRouter;
let internalRouter;

const secret = 'test-backend-secret';
process.env.BOT_BACKEND_SECRET = secret;

beforeAll(async () => {
  buyRouter = (await import('../src/routes/buy.js')).default;
  internalRouter = (await import('../src/routes/internalPayments.js')).default;
});

beforeEach(() => {
  mockQuery.mockReset();
});

function normalizeSql(sql) {
  const s = (typeof sql === 'string' ? sql : sql?.text || '').toLowerCase();
  return s.replace(/\s+/g, ' ');
}

async function requestApp(app, path, { method = 'GET', headers = {}, body } = {}) {
  const server = await listenOnFetchSafePort(app);
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  } finally {
    await closeServer(server);
  }
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.telegramUser = { user: { id: 123456, username: 'testuser' } };
    next();
  });
  app.use('/api/buy', buyRouter);
  app.use('/api/internal/payments', internalRouter);
  return app;
}

describe('buy.js', () => {
  test('purchase intent: valid item_type → 202 + purchase.id + payment.payload', async () => {
    mockQuery.mockImplementation((sql) => {
      const s = normalizeSql(sql);
      if (s.includes('begin') || s.includes('commit') || s.includes('rollback')) return Promise.resolve({});
      if (s.includes('select id from users')) return Promise.resolve({ rows: [{ id: 1 }] });
      if (s.includes('insert into purchases')) {
        return Promise.resolve({ rows: [{ id: 99, item_type: 'energy_refill', stars_amount: 10, status: 'pending' }] });
      }
      if (s.includes('insert into audit_logs')) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });

    const res = await requestApp(buildApp(), '/api/buy', { method: 'POST', body: { productId: 'energy_refill' } });
    expect(res.status).toBe(202);
    expect(res.body.purchase.itemType).toBe('energy_refill');
    expect(res.body.payment.payload).toMatch(/^purchase:/);
  });

  test('invalid item_type → 400', async () => {
    const res = await requestApp(buildApp(), '/api/buy', { method: 'POST', body: { productId: 'nonexistent_item' } });
    expect(res.status).toBe(400);
  });
});

describe('internalPayments.js', () => {

  test('invoice context: valid payload → 200 + invoice details', async () => {
    mockQuery.mockImplementation((sql) => {
      const s = normalizeSql(sql);
      if (s.includes('select id, item_type, stars_amount, status from purchases')) {
        return Promise.resolve({ rows: [{ id: 99, item_type: 'energy_refill', stars_amount: 10, status: 'pending' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await requestApp(buildApp(), '/api/internal/payments/telegram/invoice-context', {
      method: 'POST',
      headers: { 'X-Bot-Backend-Secret': secret },
      body: { invoicePayload: 'purchase:99:energy_refill' },
    });
    expect(res.status).toBe(200);
    expect(res.body.invoice.currency).toBe('XTR');
    expect(res.body.purchase.starsAmount).toBe(10);
  });

  test('invoice context: invalid payload → 400', async () => {
    const res = await requestApp(buildApp(), '/api/internal/payments/telegram/invoice-context', {
      method: 'POST',
      headers: { 'X-Bot-Backend-Secret': secret },
      body: { invoicePayload: 'bad_payload' },
    });
    expect(res.status).toBe(400);
  });

  test('confirm: idempotent double confirm → 200 idempotent:true', async () => {
    mockQuery.mockImplementation((sql) => {
      const s = normalizeSql(sql);
      if (s.includes('begin') || s.includes('commit') || s.includes('rollback')) return Promise.resolve({});
      if (s.includes('select id, user_id, purchase_id, item_type, stars_amount from star_payments')) {
        return Promise.resolve({ rows: [{ id: 77, user_id: 1, purchase_id: 99, item_type: 'energy_refill', stars_amount: 10 }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const payload = {
      telegramUserId: 123456,
      telegramPaymentChargeId: 'charge_001',
      providerPaymentChargeId: 'prov_001',
      invoicePayload: 'purchase:99:energy_refill',
      totalAmount: 10,
      currency: 'XTR',
    };

    const first = await requestApp(buildApp(), '/api/internal/payments/telegram/confirm', {
      method: 'POST',
      headers: { 'X-Bot-Backend-Secret': secret },
      body: payload,
    });
    expect(first.status).toBe(200);

    const second = await requestApp(buildApp(), '/api/internal/payments/telegram/confirm', {
      method: 'POST',
      headers: { 'X-Bot-Backend-Secret': secret },
      body: payload,
    });
    expect(second.status).toBe(200);
    expect(second.body.idempotent).toBe(true);
  });

  test('confirm: amount mismatch → 400', async () => {
    mockQuery.mockImplementation((sql) => {
      const s = normalizeSql(sql);
      if (s.includes('begin') || s.includes('rollback')) return Promise.resolve({});
      if (s.includes('select id, user_id, purchase_id, item_type, stars_amount from star_payments')) return Promise.resolve({ rows: [] });
      if (s.includes('select id from users')) return Promise.resolve({ rows: [{ id: 1 }] });
      if (s.includes('select id, user_id, item_type, stars_amount, status from purchases')) {
        return Promise.resolve({ rows: [{ id: 99, user_id: 1, item_type: 'energy_refill', stars_amount: 10, status: 'pending' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await requestApp(buildApp(), '/api/internal/payments/telegram/confirm', {
      method: 'POST',
      headers: { 'X-Bot-Backend-Secret': secret },
      body: {
        telegramUserId: 123456,
        telegramPaymentChargeId: 'charge_002',
        invoicePayload: 'purchase:99:energy_refill',
        totalAmount: 99,
        currency: 'XTR',
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.toLowerCase()).toMatch(/amount mismatch/);
  });

  test('confirm: user not found → 404', async () => {
    mockQuery.mockImplementation((sql) => {
      const s = normalizeSql(sql);
      if (s.includes('begin') || s.includes('rollback')) return Promise.resolve({});
      if (s.includes('select id, user_id, purchase_id, item_type, stars_amount from star_payments')) return Promise.resolve({ rows: [] });
      if (s.includes('select id from users')) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });

    const res = await requestApp(buildApp(), '/api/internal/payments/telegram/confirm', {
      method: 'POST',
      headers: { 'X-Bot-Backend-Secret': secret },
      body: {
        telegramUserId: 999999,
        telegramPaymentChargeId: 'charge_003',
        invoicePayload: 'purchase:99:energy_refill',
        totalAmount: 10,
        currency: 'XTR',
      },
    });
    expect(res.status).toBe(404);
  });

  test('confirm: purchase not found / wrong user → 404', async () => {
    mockQuery.mockImplementation((sql) => {
      const s = normalizeSql(sql);
      if (s.includes('begin') || s.includes('rollback')) return Promise.resolve({});
      if (s.includes('select id, user_id, purchase_id, item_type, stars_amount from star_payments')) return Promise.resolve({ rows: [] });
      if (s.includes('select id from users')) return Promise.resolve({ rows: [{ id: 1 }] });
      if (s.includes('select id, user_id, item_type, stars_amount, status from purchases')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await requestApp(buildApp(), '/api/internal/payments/telegram/confirm', {
      method: 'POST',
      headers: { 'X-Bot-Backend-Secret': secret },
      body: {
        telegramUserId: 123456,
        telegramPaymentChargeId: 'charge_004',
        invoicePayload: 'purchase:99999:energy_refill',
        totalAmount: 10,
        currency: 'XTR',
      },
    });
    expect(res.status).toBe(404);
  });
});
