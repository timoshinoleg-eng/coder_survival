# Coder Survival — Production Release Checklist

The local `scripts/release-prod.ps1` and `scripts/deploy.sh` entrypoints are retired. Production releases must use the guarded GitHub Actions workflows.

## 1. Frontend first

Run **Deploy Frontend Production** from `main` and type `deploy`.

Required repository secret:

- `VERCEL_TOKEN`

The workflow deploys the exact current `main` through the connected Vercel frontend project and validates the stable production origin:

`https://frontend-olegs-projects-bfc4e11a.vercel.app`

Do not continue to backend cutover unless that workflow is green and the stable alias serves Coder Survival.

## 2. Cloud.ru infrastructure

Before the first backend release:

- Evolution VM and Evolution Managed PostgreSQL are in the same project/private subnet;
- VM public ingress exposes only required SSH plus HTTP/HTTPS; ports `3000` and `5432` are not public;
- `coder-survival-api.duckdns.org` resolves to the Cloud.ru VM public IPv4;
- nginx and Let's Encrypt are configured on the VM;
- Docker Compose is at least `2.30.0`;
- Managed PostgreSQL backups are enabled.

Follow `deploy/cloudru/README.md` for the authoritative values and bootstrap commands.

## 3. GitHub `production-cloudru` environment

Configure the secrets required by **Deploy Backend to Cloud.ru**:

- `CLOUDRU_VM_HOST`
- `CLOUDRU_VM_USER`
- `CLOUDRU_VM_SSH_KEY`
- `CLOUDRU_VM_HOST_KEY`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `BOT_TOKEN`
- `BOT_BACKEND_SECRET`
- `ADMIN_API_SECRET`
- `WEBAPP_URL=https://frontend-olegs-projects-bfc4e11a.vercel.app`
- `FRONTEND_URL=https://frontend-olegs-projects-bfc4e11a.vercel.app`
- optional `CORS_ALLOWED_ORIGINS`
- rewarded-ad provider secrets only when enabled.

Environment/repository variables:

- `BACKEND_HEALTH_URL=https://coder-survival-api.duckdns.org/health`
- `CLOUDRU_VM_SSH_PORT=22`
- `CLOUDRU_DB_SSL=false` unless the managed database is configured to require TLS.

## 4. Backend release

Run **Deploy Backend to Cloud.ru** from `main` and type `deploy`.

The workflow must complete all of these gates automatically: PostgreSQL-backed tests, immutable Docker build, production config preflight, stable frontend-origin validation, pinned SSH host-key validation, DNS-to-VM verification, VM prerequisite checks, database reachability, pre-migration `pg_dump`, migrations, container health, rollback on failed health, and public HTTPS health verification.

`PAYMENTS_ENABLED=false` stays enforced until the separate payment go-live decision.

## 5. Post-release checks

- `https://coder-survival-api.duckdns.org/health` returns HTTP 200 with `status=ok` and `db=connected`;
- Vercel frontend still serves from the stable production alias;
- Telegram `/start` opens the Mini App;
- one normal gameplay session persists state after a backend restart;
- no unexpected errors appear in Vercel/backend logs.

Never use the retired local release scripts as a rollback mechanism. Backend rollback is handled by the Cloud.ru workflow when a new container fails health; frontend rollback should use Vercel deployment rollback/promotion tooling.
