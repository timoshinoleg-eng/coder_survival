# Deployment Reference

The current topology is Vercel for the frontend and bot webhook, and a Docker
backend on Vultr behind `coder-survival-api.duckdns.org`. The canonical source
of truth is `CURRENT_ARCHITECTURE.md`; release acceptance is
`TEST_LAUNCH_RUNBOOK.md`.

## Required release gates

1. Exact candidate branch and terminal GitHub CI.
2. `STAGING_TEST_DATABASE_URL` in the GitHub `staging` environment.
3. Secret-backed `VM_SSH_TARGET=user@host` and `VM_SSH_KEY`.
4. VM `backend/.env` with `DB_*`, `DB_SSL` and application secrets. Production
   uses verified PostgreSQL TLS unless `DB_SSL=false` is explicitly selected
   for a trusted local VM database.
5. Verified database backup and rollback commit before migration.

## Supported operator commands

```powershell
$env:CODER_SURVIVAL_VM_SSH_TARGET = 'user@host'
pwsh -File scripts/release-preflight.ps1
pwsh -File scripts/release-prod.ps1
pwsh -File scripts/smoke-core-prod.ps1
```

Do not use direct registry pushes, provider-specific image names, source-coded
VM addresses, or retired deployment scripts. A failed gate stops the release;
rollback uses the recorded accepted commit through the same guarded path.
