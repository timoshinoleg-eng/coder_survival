# PP-18 Deploy Checklist

Status date: 2026-06-01

## Verified locally
- Migration `044_add_prestige.sql` applied on local dev PostgreSQL.
- `schema_migrations` contains `044_add_prestige.sql`.
- Local backend health is OK at `http://localhost:3000/health`.
- HTTP smoke passed with test Telegram ID `918000002`:
  - `GET /api/state` bootstraps the smoke user.
  - `GET /api/prestige/preview` returns locked state before seed.
  - Seeded local smoke user to `xp_total=3100`, `commits_total=10000`.
  - `GET /api/prestige/preview` returns eligible, `prestigeCurrencyEarned=31`.
  - `POST /api/prestige/execute` succeeds and resets XP/rank state.
  - `GET /api/state` shows `prestige.level=1`, `prestige.currency=31`, `maxEnergy=110`.
  - `POST /api/tap` succeeds after prestige and returns `level.prestigeLevel=1`.
  - `GET /api/prestige/shop` returns 5 shop items and 31 prestige currency.

## Before deploy
- Run CI/CD or the normal backend build path from the committed checkpoint.
- Do not deploy directly from a dirty worktree.
- Confirm `pp18.prestige.unit.test.js` still passes in CI.
- Confirm backend syntax checks still pass for:
  - `backend/src/routes/prestige.js`
  - `backend/src/utils/prestige.js`
  - `backend/src/utils/vnext.js`
  - `backend/src/utils/tap.js`
- Apply `044_add_prestige.sql` to staging before any production rollout.
- Run the same PP-18 HTTP smoke on staging using a synthetic Telegram ID only.
- Use a test Telegram user ID for destructive `POST /api/prestige/execute`.

## Production guardrails
- Do not touch YC, DNS, `.env`, Vercel config, or deploy scripts as part of PP-18 smoke.
- Do not rebuild the backend image through long manual SSH sync.
- Prefer the existing CI/CD or pre-built base image path.
- If a manual build is unavoidable, run it detached with `screen` and capture logs.
- Production deploy is blocked until staging migration plus staging HTTP smoke pass.

## Notes
- The implemented preview route is `GET /api/prestige/preview`; frontend uses this method.
- `POST /api/prestige/execute` is the destructive step.
