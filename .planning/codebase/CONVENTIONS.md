# Coder Survival — Code Conventions

> Analyzed: 2026-05-20  
> Scope: `backend/`, `frontend/`, `bot/`

---

## 1. Language & Module System

- **ES Modules everywhere**: all three packages set `"type": "module"` in `package.json`.
- **Node.js runtime**: backend requires `>=20`, bot requires `>=18`.
- **No transpilation**: backend and bot run native Node.js ESM; frontend is built with Vite.

```json
// backend/package.json
{
  "type": "module",
  "engines": { "node": ">=20.0.0" }
}
```

---

## 2. File Naming

| Package | Pattern | Examples |
|---------|---------|----------|
| Backend | camelCase for utils/middleware/config; lowercase for routes | `errorHandler.js`, `dailyQuests.js`, `tap.js`, `state.js` |
| Frontend | PascalCase components; camelCase hooks/utils | `StatsBar.jsx`, `TapArea.jsx`, `useGameState.js`, `api.js` |
| Bot | camelCase | `createBot.js` |

- Route files export a default `Router` instance: `export default router;`
- Utility files export named functions: `export function calculateTapDelta(...) { ... }`

---

## 3. Code Style

### Quotes
The codebase uses **mixed quoting** — no enforced style. Single quotes dominate in backend and bot; frontend leans toward double quotes.

```js
// backend/src/middleware/initData.js
import crypto from 'crypto';

// frontend/src/App.jsx
import { h } from "preact";
```

### Semicolons
Most files terminate statements with semicolons, but some omit them. Follow the dominant style of the file you are editing.

### Indentation
2 spaces everywhere.

### Trailing commas
Trailing commas are used in multi-line objects/arrays.

```js
// backend/src/routes/tap.js
[
  userId,
  tapResult.commitsDelta,
  newCommitsCurrent,
  newEnergy,
  newDepression,
  newTier,
  isBurnout,
]
```

---

## 4. Naming Conventions

| Category | Convention | Example |
|----------|-----------|---------|
| Constants (game balance) | `UPPER_SNAKE_CASE` | `TAP_MECHANICS`, `STRESS_V2`, `CONTEXT_OFFER_RULES` |
| Exported functions | camelCase | `calculateTapDelta`, `recoverProgression` |
| Local variables | camelCase | `userId`, `progressRow`, `newEnergy` |
| React/Preact components | PascalCase | `StatsBar`, `TapArea` |
| Private helpers | camelCase (no `_` prefix) | `getRecoveryAnchor`, `toValidDate` |
| Database columns | snake_case | `commits_total`, `depression_level`, `last_active` |
| API response fields | camelCase preferred, snake_case legacy allowed | `commitsTotal` (new), `commits_total` (legacy compat) |

---

## 5. Import Order

1. Node built-ins
2. Third-party packages
3. Internal modules (relative paths)

```js
// backend/src/routes/state.js
import { Router } from "express";
import { randomUUID, createHash } from "crypto";
import { pool } from "../index.js";
import { STAGE4 } from "../config/balance.js";
import { recoverProgression } from "../utils/progression.js";
```

---

## 6. Error Handling

### Backend
- **Route handlers** wrap DB work in `try / finally` with `client.release()`.
- **Transactions** use explicit `BEGIN / COMMIT / ROLLBACK`.
- **Global error handler** (`backend/src/middleware/errorHandler.js`) maps PostgreSQL error codes and JWT errors to HTTP status codes.

```js
// backend/src/middleware/errorHandler.js
export function errorHandler(err, req, res, next) {
  console.error('API Error:', err);

  if (err.code === '23505') {
    return res.status(409).json({ error: 'Conflict: resource already exists' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Foreign key violation' });
  }

  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({ error: message });
}
```

- Rollback failures are swallowed intentionally to preserve the original error:

```js
if (client) {
  try {
    await client.query('ROLLBACK');
  } catch (_rollbackErr) {
    // Ignore rollback failure and return the original server error.
  }
}
```

### Frontend
- API errors are thrown as `ApiError` instances with `status` and `payload`.
- UI errors surface via a toast system in `useGameState.js`.

```js
// frontend/src/utils/api.js
export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}
```

---

## 7. Logging & Analytics

- `console.error` for actual errors and unhandled rejections.
- `console.log` is used as a lightweight **event/analytics stream** with structured objects:

```js
console.log('energy_recovery_trusted', {
  userId: progression.user_id,
  energyRecovered: actualRecovered,
  anchor: anchor.toISOString(),
});
```

- Graceful shutdown hooks log `SIGTERM` / `SIGINT`.
- `unhandledRejection` and `uncaughtException` handlers exist in `backend/src/index.js` and `bot/index.js`.

---

## 8. Architectural Patterns

### Backend
- **Express router-per-feature**: each domain (`tap`, `state`, `quests`, `battle`, etc.) has its own file in `backend/src/routes/`.
- **Middleware stack**: `initDataMiddleware` (Telegram auth) → route handler → `errorHandler`.
- **PG pool**: single shared `Pool` exported from `backend/src/index.js`; routes import it directly.
- **Config-as-code**: game balance constants live in `backend/src/config/balance.js` with `console.assert` validations.

```js
// backend/src/config/balance.js
const STAGE2 = { /* ... */ };
console.assert(totalStage2PassXp === 6850, `Pass XP mismatch: ${totalStage2PassXp}`);
export { STAGE2 };
```

### Frontend
- **Preact** (React alternative) with `h()` hyperscript instead of JSX.
- **Context + Hooks** state management: `GameContext` in `frontend/src/hooks/useGameState.js`.
- **Phaser** game layer runs inside a Preact component (`PhaserGame.js`).
- **Inline styles**: no CSS-in-JS library; styles are plain objects passed to the `style` prop.

```jsx
// frontend/src/components/TapArea.jsx
return h('div', {
  style: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20 }
}, [ /* children */ ]);
```

### Bot
- **Grammy** framework for Telegram Bot API.
- **Dual runtime**: Vercel serverless webhook (`bot/api/webhook.js`) for production; legacy polling entrypoint (`bot/index.js`) for local debugging guarded by `ENABLE_POLLING_BOT=true`.

---

## 9. Linting & Formatting

- **No ESLint, Prettier, or EditorConfig** is configured in any package.
- Style is maintained manually. When editing, match the dominant quoting and spacing style of the target file.

---

## 10. Environment Configuration

- `.env` files are loaded explicitly with `dotenv`:

```js
// backend/src/index.js
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });
```

- `bot/index.js` uses `import 'dotenv/config'` (auto-load from cwd).
- Frontend uses Vite env vars: `import.meta.env.VITE_API_BASE_URL`.

---

## 11. Comments

- Mixed Russian and English comments. Core logic comments are often in Russian; JSDoc-style headers are in English.
- Large feature blocks are delimited with ASCII line comments:

```js
// ═══════════════════════════════════════════════════════════════
// STAGE 3 INTEGRATION: Social Progress
// ═══════════════════════════════════════════════════════════════
```

---

## 12. Database Conventions

- PostgreSQL with parameterized queries (`$1`, `$2`, …).
- `ON CONFLICT` used for upserts.
- JSONB columns store flexible state (`daily_quests_state`, `pass_state`, `career_story`).
- `FOR UPDATE` row locking inside transactions for mutable operations (claim, tap, etc.).
