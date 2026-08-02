# Release Configuration Requirements

The source-controlled release gates are active. The following values are
environment configuration, never repository values.

| Scope | Required value | Purpose | Gate behaviour |
| --- | --- | --- | --- |
| GitHub `staging` environment | `STAGING_TEST_DATABASE_URL` | Isolated PostgreSQL database for migrations and the complete backend suite. | Missing, malformed or unreachable value fails `integration-tests-staging.yml`. |
| GitHub repository/environment secret | `VM_SSH_TARGET` | Vultr SSH target in `user@host` form. | Missing or malformed target fails `manual-release.yml` before SSH. |
| GitHub repository/environment secret | `VM_SSH_KEY` | Private key matching `VM_SSH_TARGET`. | SSH setup fails closed. |
| GitHub repository/environment secrets | `VM_USER`, `VM_HOST`, `DB_*`, `BOT_*`, `WEBAPP_URL` | Inputs for the guarded backend deployment workflow. | The workflow must fail if tests, migration, deployment or health check fails. |
| GitHub repository secrets | `BATTLE_DISTRIBUTE_URL`, `BATTLE_DISTRIBUTE_SECRET` | Daily battle reward distribution. | The scheduled job fails explicitly until both are configured. |
| GitHub repository secret | `VERCEL_TOKEN` | Optional preview deployment only. | Missing token records an explicit preview skip and cannot produce a false successful deploy. |

Do not add an IP address, database password, Bot token, Vercel token, or SSH
private key to tracked files. The public API remains
`https://coder-survival-api.duckdns.org`; it is monitored by
`vultr-health.yml` and must return `{ "status": "ok", "db": "connected" }`.
