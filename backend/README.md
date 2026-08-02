# Coder Survival Backend

Express API for the Telegram Mini App.

## Local development

```bash
cd backend
cp .env.example .env
docker compose up
```

The local compose stack starts PostgreSQL and the API. Keep `DB_SSL` empty for
development; production enables verified TLS by default.

## Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` or `DB_*` | PostgreSQL connection |
| `DB_SSL` | Production TLS override. Leave unset for verified TLS; use `false` only for a trusted local database. |
| `DB_SSL_CA` | Certificate authority text when the managed database requires it. |
| `BOT_TOKEN` | Telegram signature validation in production. |
| `BOT_BACKEND_SECRET` | Bot-to-backend internal authentication. |

## Verification

Run the whole backend suite against an isolated PostgreSQL database:

```powershell
$env:NODE_ENV = 'test'
$env:TEST_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/coder_survival_test'
npm test
```

`backend-tests.yml` executes the same migration/idempotency and test gate in
GitHub Actions. See `../docs/TEST_LAUNCH_RUNBOOK.md` for release acceptance.

## Deployment

`backend/deploy.sh` is intentionally retired. The only supported release path
is the guarded root script:

```powershell
$env:CODER_SURVIVAL_VM_SSH_TARGET = 'user@host'
pwsh -File scripts/release-prod.ps1
```

Do not push images to an unconfigured registry or deploy directly to a VM.
