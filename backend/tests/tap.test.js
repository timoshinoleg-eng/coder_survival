import { jest } from '@jest/globals';
import express from 'express';

const mockQuery = jest.fn();
globalThis.__mockQuery__ = mockQuery;

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

let antiCheat;
let tapRouter;

beforeAll(async () => {
  antiCheat = await import('../src/middleware/antiCheat.js');
  tapRouter = (await import('../src/routes/tap.js')).default;
});

beforeEach(() => {
  antiCheat.clearAllTapHistories();
});

function makeBaseProgression(overrides = {}) {
  return {
    user_id: 1,
    energy: 100,
    depression_level: 0,
    commits_total: 0,
    commits_current: 0,
    streak_days: 0,
    tier: 1,
    anti_cheat_state: {},
    active_effects: {},
    event_state: {},
    inventory: {},
    daily_quests_state: {},
    timezone_offset: 180,
    team_hackathon_state: {},
    referral_state: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_energy_activity_at: new Date().toISOString(),
    energy_recovery_checkpoint_at: new Date().toISOString(),
    forced_break_until: null,
    is_burnout: false,
    burnout_affliction: false,
    mu_currency: 0,
    prestige_level: 0,
    lifetime_loc: 0,
    ...overrides,
  };
}

function setupMockQuery(scenario = {}) {
  const base = makeBaseProgression(scenario.progression);
  const after = makeBaseProgression({
    ...scenario.progression,
    energy: (scenario.progression?.energy ?? 100) - (scenario.tapCount ?? 1),
    depression_level: (scenario.progression?.depression_level ?? 0) + (scenario.depressionGain ?? 0.5),
  });

  mockQuery.mockImplementation((sql) => {
    const s = (typeof sql === 'string' ? sql : sql?.text || '').toLowerCase().replace(/\s+/g, ' ');

    if (['begin', 'commit', 'rollback'].includes(s)) {
      return Promise.resolve({});
    }
    if (s.includes('insert into users')) {
      return Promise.resolve({ rows: [{ id: 1, inserted: false }] });
    }
    if (s.includes('insert into player_levels') && s.includes('on conflict')) {
      return Promise.resolve({ rows: [{ user_id: 1, xp_total: 0, prestige_level: 0, updated_at: new Date().toISOString() }] });
    }
    if (s.includes('select mu_currency from progression')) {
      return Promise.resolve({ rows: [{ mu_currency: 0 }] });
    }
    if (s.includes('rate_limit_user')) {
      return Promise.resolve({ rows: [{ tap_count: scenario.rateLimitCount ?? 5 }] });
    }
    if (s.includes('rate_limit_ip')) {
      return Promise.resolve({ rows: [{ tap_count: scenario.ipCount ?? 5 }] });
    }
    if (s.includes('insert into progression') && s.includes('on conflict') && s.includes('do nothing')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('select * from progression where user_id') && s.includes('for update')) {
      return Promise.resolve({ rows: [base] });
    }
    if (s.includes('update progression set anti_cheat_state')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('select 1 from user_skins') && s.includes('senior_pajamas')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('select skin_id from user_skins')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('update progression') && s.includes('returning')) {
      // Main tap UPDATE increments commits_total; recoverProgression and heartAttack do not.
      if (s.includes('commits_total = commits_total + $2')) {
        return Promise.resolve({ rows: [after] });
      }
      // recoverProgression idle recovery / heartAttack reset - tests use zero idle time, return base as-is
      return Promise.resolve({ rows: [base] });
    }
    if (s.includes('select * from phase2_state')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('select language_code') || s.includes('select active_language')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('select daily_quests_state')) {
      return Promise.resolve({ rows: [{ daily_quests_state: { lastDate: '2026-06-10', quests: [] }, timezone_offset: 180 }] });
    }
    if (s.includes('select team_hackathon_state')) {
      return Promise.resolve({ rows: [{ team_hackathon_state: {}, referral_state: {}, timezone_offset: 180, commits_total: 0 }] });
    }
    if (s.includes('select team_id from team_members')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('update sessions')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('insert into audit_logs')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('insert into user_skins')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('insert into daily_quests')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('insert into anticheat_tap_history')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('insert into daily_farm_log')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('insert into player_passes') || s.includes('update player_passes')) {
      return Promise.resolve({ rows: [{ current_level: 1, current_xp: 0, is_premium: false }] });
    }
    if (s.includes('insert into pass_xp_log')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('select id, season_number from sprint_passes')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('select event_id, target_commits from events')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('insert into event_contributions')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('update team_members set total_commits')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('insert into weekly_sprint_progress')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('update progression set inventory') && s.includes('burnout_count')) {
      return Promise.resolve({ rows: [{ cnt: 1 }] });
    }
    if (s.includes("select coalesce((inventory->>'burnout_count')::int")) {
      return Promise.resolve({ rows: [{ cnt: 1 }] });
    }

    return Promise.resolve({ rows: [] });
  });
}

describe('tap.js', () => {
  let server;
  let port;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.telegramUser = { user: { id: 123456, username: 'testuser', first_name: 'Test' } };
      next();
    });
    app.use('/api/tap', tapRouter);
    app.use((err, _req, res, _next) => {
      res.status(500).json({ error: err.message, stack: err.stack });
    });

    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.on('listening', resolve));
    port = server.address().port;
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  async function requestApp(path, { method = 'GET', headers = {}, body } = {}) {
    const url = `http://127.0.0.1:${port}${path}`;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '127.0.0.1', 'Connection': 'close', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  test('debug mockQuery returns rows', async () => {
    setupMockQuery({});
    const r1 = await mockQuery("INSERT INTO progression (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING RETURNING *");
    const r2 = await mockQuery("SELECT * FROM progression WHERE user_id = $1 FOR UPDATE");
    expect(r1.rows).toEqual([]);
    expect(r2.rows).toBeDefined();
  });

  test('happy path: energy=100, tapCount=10 → commitsDelta > 0, energy drops by 10', async () => {
    setupMockQuery({ tapCount: 10, progression: { energy: 100 } });
    const res = await requestApp('/api/tap', { method: 'POST', body: { tapCount: 10 } });
    if (res.status !== 200) console.log('DEBUG tap body:', JSON.stringify(res.body, null, 2));
    expect(res.status).toBe(200);
    expect(res.body.commitsDelta).toBeGreaterThan(0);
    expect(res.body.energy).toBe(90);
    expect(res.body.delta.energy).toBe(-10);
  });

  test('energy=0 → early return with commitsDelta=0', async () => {
    setupMockQuery({ progression: { energy: 0 } });
    const res = await requestApp('/api/tap', { method: 'POST', body: { tapCount: 5 } });
    expect(res.status).toBe(200);
    expect(res.body.commitsDelta).toBe(0);
  });

  test('energy=3, tapCount=20 -> actualTapCount=3 and rate_limit_user increments by 3', async () => {
    setupMockQuery({ tapCount: 3, progression: { energy: 3 } });
    mockQuery.mockClear();
    const res = await requestApp('/api/tap', { method: 'POST', body: { tapCount: 20 } });
    expect(res.status).toBe(200);
    expect(res.body.tapCount).toBe(3);
    expect(res.body.energy).toBe(0);
    expect(res.body.commitsDelta).toBeGreaterThan(0);
    const rateLimitCalls = mockQuery.mock.calls.filter(([sql]) =>
      String(sql).toLowerCase().includes('rate_limit_user')
    );
    expect(rateLimitCalls.length).toBe(1);
    expect(rateLimitCalls[0][1][1]).toBe(3); // tapIncrement passed to the limiter
  });

  test('energy=0, tapCount=10 -> no rate-limit call/quota burn', async () => {
    setupMockQuery({ progression: { energy: 0 } });
    mockQuery.mockClear();
    const res = await requestApp('/api/tap', { method: 'POST', body: { tapCount: 10 } });
    expect(res.status).toBe(200);
    expect(res.body.commitsDelta).toBe(0);
    const rateLimitCalls = mockQuery.mock.calls.filter(([sql]) =>
      String(sql).toLowerCase().includes('rate_limit_user')
    );
    expect(rateLimitCalls.length).toBe(0);
  });

  test('burnout entry: depression=200 → isBurnout=true', async () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.999);
    try {
      setupMockQuery({ progression: { energy: 100, depression_level: 200 } });
      const res = await requestApp('/api/tap', { method: 'POST', body: { tapCount: 1 } });
      expect(res.status).toBe(200);
      expect(res.body.isBurnout).toBe(true);
    } finally {
      randomSpy.mockRestore();
    }
  });

  test('crit silver: mocked Math.random returns silver crit', async () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.10);
    try {
      setupMockQuery({ tapCount: 1, progression: { energy: 100 } });
      const res = await requestApp('/api/tap', { method: 'POST', body: { tapCount: 1 } });
      expect(res.status).toBe(200);
      expect(res.body.isCrit).toBe(true);
      expect(res.body.critTier).toBe('silver');
    } finally {
      randomSpy.mockRestore();
    }
  });

  test('anti-cheat trigger: CPS > 20 → 429 pattern_ban', async () => {
    let now = Date.parse('2026-06-10T12:00:00.000Z');
    const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    setupMockQuery({ tapCount: 1 });

    try {
      for (let i = 0; i < 15; i++) {
        now += 30;
        const res = await requestApp('/api/tap', { method: 'POST', body: { tapCount: 1 } });
        if (res.status === 429) {
          expect(res.body.type).toBe('pattern_ban');
          return;
        }
      }
      throw new Error('Expected anti-cheat ban but request was allowed');
    } finally {
      dateSpy.mockRestore();
    }
  });

  test('rate limit soft ban: tapCount > SOFT_BAN_THRESHOLD → 429 soft_ban', async () => {
    setupMockQuery({ tapCount: 20, rateLimitCount: 999, progression: { energy: 1000 } });
    const res = await requestApp('/api/tap', { method: 'POST', body: { tapCount: 20 } });
    expect(res.status).toBe(429);
    expect(res.body.type).toBe('soft_ban');
  });

  test('429 burst_limit response has required payload {error, retryAfter, type}', async () => {
    setupMockQuery({ tapCount: 5, rateLimitCount: 110, progression: { energy: 100 } });
    const res = await requestApp('/api/tap', { method: 'POST', body: { tapCount: 5 } });
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      error: expect.any(String),
      retryAfter: expect.any(Number),
      type: 'burst_limit',
    });
  });

  test('429 soft_ban response has required payload {error, retryAfter, type}', async () => {
    setupMockQuery({ tapCount: 5, rateLimitCount: 999, progression: { energy: 1000 } });
    const res = await requestApp('/api/tap', { method: 'POST', body: { tapCount: 5 } });
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      error: expect.any(String),
      retryAfter: 60,
      type: 'soft_ban',
    });
  });

  test('429 pattern_ban response has required payload {error, retryAfter, type}', async () => {
    let now = Date.parse('2026-06-10T12:00:00.000Z');
    const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    setupMockQuery({ tapCount: 1 });

    try {
      let banned = false;
      for (let i = 0; i < 15; i++) {
        now += 30;
        const res = await requestApp('/api/tap', { method: 'POST', body: { tapCount: 1 } });
        if (res.status === 429 && res.body.type === 'pattern_ban') {
          expect(res.body).toMatchObject({
            error: expect.any(String),
            retryAfter: expect.any(Number),
            type: 'pattern_ban',
          });
          banned = true;
          break;
        }
      }
      expect(banned).toBe(true);
    } finally {
      dateSpy.mockRestore();
    }
  });

  test('after 429 cooldown a valid tap succeeds', async () => {
    // First request triggers a soft ban.
    setupMockQuery({ tapCount: 5, rateLimitCount: 999, progression: { energy: 1000 } });
    const first = await requestApp('/api/tap', { method: 'POST', body: { tapCount: 5 } });
    expect(first.status).toBe(429);
    expect(first.body.type).toBe('soft_ban');

    // Second request simulates the rate-limit window having reset.
    setupMockQuery({ tapCount: 5, rateLimitCount: 5, progression: { energy: 995 } });
    const second = await requestApp('/api/tap', { method: 'POST', body: { tapCount: 5 } });
    expect(second.status).toBe(200);
    expect(second.body.commitsDelta).toBeGreaterThan(0);
    expect(second.body.tapCount).toBe(5);
  });

  test('tapCount 5 and default body {} both work after cooldown', async () => {
    setupMockQuery({ tapCount: 5, rateLimitCount: 5, progression: { energy: 100 } });
    const withCount = await requestApp('/api/tap', { method: 'POST', body: { tapCount: 5 } });
    expect(withCount.status).toBe(200);
    expect(withCount.body.tapCount).toBe(5);

    // Validation default tapCount = 1 when body is {}.
    setupMockQuery({ tapCount: 1, rateLimitCount: 6, progression: { energy: 95 } });
    const withDefault = await requestApp('/api/tap', { method: 'POST', body: {} });
    expect(withDefault.status).toBe(200);
    expect(withDefault.body.tapCount).toBe(1);
  });
});
