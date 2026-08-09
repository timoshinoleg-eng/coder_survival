# Vultr Test-Launch Runbook

This runbook is the release acceptance path for the current topology: Vercel
hosts the frontend and bot webhook; the Express backend runs on Vultr behind
`https://coder-survival-api.duckdns.org`.

## Release inputs

Before any deployment, configure the GitHub `staging` environment secret
`STAGING_TEST_DATABASE_URL` for an isolated PostgreSQL database. Configure
`VM_SSH_TARGET` as `user@host` and `VM_SSH_KEY` for the Vultr VM. The target,
database URL, tokens and passwords stay only in secret stores.

The VM `backend/.env` must also contain the external database's `DB_*` values.
Production defaults to verified PostgreSQL TLS. Set `DB_SSL=false` only when
the VM connects to a trusted local PostgreSQL instance; managed TLS should use
`DB_SSL=true` and, when required, `DB_SSL_CA` plus the provider's hostname.

## Acceptance order

1. Open a release branch from the exact candidate commit. `backend-tests.yml`
   and `integration-tests-staging.yml` must complete successfully. Both run all
   migrations twice and then the complete backend test suite.
2. Confirm `vultr-health.yml` returns a successful run. Its endpoint check is
   strict: HTTP 200 alone is insufficient; health must report `status=ok` and
   `db=connected`.
3. In a clean checkout, set `CODER_SURVIVAL_VM_SSH_TARGET=user@host` and run
   `pwsh -File scripts/release-preflight.ps1`. It must pass without
   `-AllowDirty`.
4. Take and verify a database backup on Vultr before migration. Record the
   candidate commit and the rollback commit.
5. Dispatch `Manual Release` with all skip flags disabled. It performs the
   production Vercel deploy, uploads only the backend allowlist, builds on the
   VM, runs migrations, recreates the backend and waits for Docker health.
6. Run `pwsh -File scripts/smoke-core-prod.ps1`. This creates synthetic test
   users and mutates their game state; use only after the backup and only with
   the approved production test window.
7. Verify the Mini App manually in Telegram for iOS and Android, including a
   slow-network reopen, authentication, tap flow, webhook delivery and the
   disabled-payment response. Do not enable live Stars payments for this test
   launch.

## Stop and rollback

Stop immediately on a failed migration, failed health check, failing smoke, or
user-visible regression. Restore the verified database backup when migration
integrity is in doubt, then redeploy the recorded rollback commit through the
same guarded release path. Do not use `--allow-dirty`, bypass CI, or substitute
an arbitrary VM address.
