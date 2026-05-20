# Coder Survival — Testing Patterns

> Analyzed: 2026-05-20  
> Scope: `backend/tests/`, `.github/workflows/`

---

## 1. Test Framework

- **Jest** (`^29.7.0`) is the only test framework in use.
- ESM support requires `--experimental-vm-modules`:

```json
// backend/package.json
{
  "scripts": {
    "test": "node --experimental-vm-modules ./node_modules/jest/bin/jest.js"
  }
}
```

- There are **no frontend tests** and **no bot tests**.

---

## 2. Test File Structure

All tests live in `backend/tests/`:

| File | Type | Focus |
|------|------|-------|
| `phase2.integration.test.js` | Integration | Referral binding, team-battle claim idempotency, login rewards, burnout behavior |
| `phase2.unit.test.js` | Unit + DB | Achievement progress, battle reward distribution, burnout state |
| `smoke.idleEnergyRegen.test.js` | Smoke | Energy recovery trust contract, checkpoint anchoring |
| `stage2.routes.test.js` | Integration | Daily quest idempotency, double-claim protection, full-clear rules, pass backfill, streak backfill |
| `stage2.oracles.test.js` | Oracle / Property | Quest determinism, pass XP conservation, streak monotonicity, loot-box weight stability |
| `stage3.oracles.test.js` | Oracle / Property | Battle escrow conservation, referral hard floor, hackathon reset, cooldown rejection |
| `stage4.oracles.test.js` | Oracle / Property | Event rotation, activeDays gating, modifier purity, bonus quest generation, expiry handling |

### Helpers

```
backend/tests/
├── helpers/
│   ├── testDb.js      # Pool factory, schema migration runner, DB reset
│   └── testServer.js  # Live Express server + fetch wrapper
```

---

## 3. Test Helpers

### `testDb.js`

- Creates a dedicated `pg.Pool` from `TEST_DATABASE_URL`.
- `ensureTestSchema()` runs SQL migration files from `backend/migrations/` in numeric order, tracking applied files in `schema_migrations`.
- `resetTestDatabase()` truncates all user tables (except `schema_migrations`) with `RESTART IDENTITY CASCADE`.
- `createInitData(userId, options)` builds a fake `X-Telegram-Init-Data` string for route authentication.

```js
// backend/tests/helpers/testDb.js
export const testPool = TEST_DATABASE_URL
  ? new Pool({ connectionString: TEST_DATABASE_URL, ssl: false })
  : null;

export async function resetTestDatabase() {
  const result = await testPool.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`);
  const tables = result.rows.map((row) => `"public"."${row.tablename}"`);
  await testPool.query(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
}
```

### `testServer.js`

- Imports the Express `app` and `pool` from `src/index.js`.
- Binds to an ephemeral port (`0`) on `127.0.0.1`.
- Returns a `request(path, opts)` helper that wraps `fetch` and auto-parses JSON.
- `close()` shuts down the HTTP server **and** ends the DB pool.

```js
// backend/tests/helpers/testServer.js
export async function startTestServer() {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(path, { method = "GET", headers = {}, body } = {}) {
    const response = await fetch(`${baseUrl}${path}`, { method, headers: { "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
    const text = await response.text();
    return { status: response.status, ok: response.ok, body: text ? JSON.parse(text) : null };
  }

  async function close() { /* ... */ }
  return { request, close };
}
```

---

## 4. Conditional DB Tests

Every test file that needs PostgreSQL defines a conditional `describe` block so tests are skipped when `TEST_DATABASE_URL` is unset:

```js
// backend/tests/phase2.integration.test.js
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb("phase2 integration", () => {
  // ...
});
```

---

## 5. Test Lifecycle

Standard Jest hooks are used consistently:

```js
describeIfDb("stage2 routes", () => {
  let server;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.STAGE2_PASS_SEASON_START_DATE = "2026-05-01";
    await ensureTestSchema();
    server = await startTestServer();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    if (server) await server.close();
    if (testPool) await testPool.end();
  });
});
```

- `beforeAll` migrates schema and starts the server once.
- `beforeEach` wipes data so tests are isolated.
- `afterAll` tears down server + pool.

---

## 6. Mocking Patterns

### Minimal mocking
The project avoids heavy mocking. Most tests hit the **real database** and the **real HTTP server**.

### `jest.spyOn` for time
The only mocking pattern in use is `Date.now` to test time-dependent logic:

```js
// backend/tests/stage3.oracles.test.js
import { jest } from '@jest/globals';

jest.spyOn(Date, 'now').mockReturnValue(createdAt.getTime() + 5 * 60 * 1000);
try {
  expect(canChallenge(state, 2, 1)).toBe(false);
} finally {
  Date.now.mockRestore();
}
```

### No external mocking libraries
No `sinon`, `msw`, or `nock` are present. Bot payment paths use `AbortController` + timeout for fetch resilience, but this is production code, not test mocking.

---

## 7. Oracle / Property Tests

Several files use **oracle tests** (deterministic property checks) rather than example-based tests:

```js
// backend/tests/stage2.oracles.test.js
test('Oracle 1: quest determinism', () => {
  const q1 = generateDailyQuests('test_user', '2026-05-10', 1);
  const q2 = generateDailyQuests('test_user', '2026-05-10', 1);
  assert.deepStrictEqual(q1.map((quest) => quest.id), q2.map((quest) => quest.id));
});

test('Oracle 4: loot box weights are stable under deterministic RNG sweep', () => {
  const sequence = Array.from({ length: 10000 }, (_, index) => ((index * 9301 + 49297) % 233280) / 233280);
  // ...
  assert(counts.energy_10 > 6500 && counts.energy_10 < 7500);
});
```

These tests verify:
- **Determinism**: same input → same output
- **Conservation laws**: XP totals, escrow energy, commit totals are preserved
- **Boundary conditions**: hard floors, level boundaries, expiry edges

---

## 8. Integration Test Patterns

### Route-level integration
Tests exercise full HTTP round-trips:

```js
test("GET /api/quests is idempotent for the same local day", async () => {
  const initData = createInitData(770001, { username: "quest_idempotent" });
  const first = await server.request("/api/quests?timezoneOffset=180", {
    headers: { "X-Telegram-Init-Data": initData },
  });
  expect(first.status).toBe(200);
});
```

### Direct DB seeding + route assertion
For race-condition tests, the DB is seeded directly, then the route is called:

```js
test("quest claim is protected against double claim", async () => {
  // Seed progression state directly
  await testPool.query(`UPDATE progression SET daily_quests_state = $2 WHERE user_id = $1`, [userId, JSON.stringify(state)]);

  // Fire two concurrent claims
  const responses = await Promise.all([
    server.request("/api/quests/claim", { method: "POST", headers, body }),
    server.request("/api/quests/claim", { method: "POST", headers, body }),
  ]);

  expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
  expect(responses.filter((r) => r.status === 400)).toHaveLength(1);
});
```

---

## 9. Smoke Tests

`smoke.idleEnergyRegen.test.js` validates a **business-critical trust contract**:
1. `GET /api/state` recovers idle energy without resetting the activity anchor.
2. A 10-minute idle window yields the expected energy gain.
3. Calling `recoverProgression` again on the same checkpoint does not double-apply recovery.

---

## 10. Coverage

- No explicit coverage thresholds are configured.
- Jest collects coverage by default when run with `--coverage` (not wired into CI scripts).
- The `coverage/` directory is gitignored.

---

## 11. CI / CD Testing

### `.github/workflows/backend-tests.yml`
Triggered on `push`/`pull_request` when `backend/**` changes.

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: coder_survival_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
    env:
      NODE_ENV: test
      TEST_DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:5432/coder_survival_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: backend/package-lock.json
      - run: npm ci
      - run: npm test -- --runInBand
```

### `.github/workflows/ci.yml`
Broader CI that runs on **all** pushes/PRs:
1. Spins up Postgres on port `5433`.
2. Runs backend integration + smoke tests (`--testPathPattern="integration|smoke" --runInBand`).
3. Builds the frontend with `npm run build` as a smoke test.

Key flags:
- `--runInBand`: sequential execution to avoid DB contention.
- `--testPathPattern="integration|smoke"`: unit/oracle tests are skipped in the broad CI (they run in `backend-tests.yml`).

---

## 12. Manual / Release Testing

The `scripts/` directory contains PowerShell smoke scripts for production validation:

- `scripts/smoke-offers.ps1` — smoke-test offer endpoints
- `scripts/release-preflight.ps1` — pre-flight checklist
- `scripts/release-prod.ps1` — production release validation

These are **not** part of automated CI; they are operator-run scripts.
