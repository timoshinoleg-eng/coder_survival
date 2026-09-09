# Coder Survival — deployment

**Target topology (2026-09-09): Cloud.ru Evolution for the backend. Vultr is retired.**

The frontend Mini App and bot webhook remain on Vercel. The backend moves to a Cloud.ru Evolution VM, while PostgreSQL moves to Cloud.ru Managed PostgreSQL in the same private subnet. The public API hostname remains `coder-survival-api.duckdns.org`, so `frontend/vercel.json` does not need a cutover change; only the DuckDNS A record must point to the new Cloud.ru VM public IP.

Canonical Cloud.ru runbook: [`deploy/cloudru/README.md`](deploy/cloudru/README.md).
Canonical topology: [`docs/CURRENT_ARCHITECTURE.md`](docs/CURRENT_ARCHITECTURE.md).

## Production boundaries

- Public: nginx on VM ports 80/443.
- Private: backend Docker port 3000 bound to `127.0.0.1` only.
- Private: Managed PostgreSQL internal IP only; never expose 5432 to the Internet.
- CI/CD: `.github/workflows/deploy-backend.yml` (`workflow_dispatch` only).
- Continuous health: `.github/workflows/backend-health.yml`.
- Payments: disabled (`PAYMENTS_ENABLED=false`) until a separate go-live decision.

## First-time Cloud.ru setup

1. Create VPC/subnet.
2. Create Ubuntu 24.04 VM with public IP and SSH public key.
3. Create Managed PostgreSQL in the same Evolution project/subnet.
4. Run `deploy/cloudru/bootstrap-vm.sh` on the VM.
5. Point `coder-survival-api.duckdns.org` to the new Cloud.ru public IP.
6. Run `deploy/cloudru/configure-nginx.sh` with `ISSUE_CERTIFICATE=true`.
7. Configure the `production-cloudru` GitHub environment and secrets listed in `deploy/cloudru/README.md`.
8. Set repository variable `BACKEND_HEALTH_URL=https://coder-survival-api.duckdns.org/health`.
9. Run **Deploy Backend to Cloud.ru** and type `deploy`.

## Release safety

The release path is fail-closed:

- backend tests and migration idempotency must pass first;
- Docker image is built in CI and tagged by commit SHA;
- SSH host identity is pinned;
- production DB is backed up before migration;
- migrations run before container replacement;
- backend listens only on loopback;
- container health checks application and DB connectivity;
- failed health causes automatic image rollback;
- public HTTPS health is verified after the swap.

## Existing frontend routing

`frontend/vercel.json` currently proxies `/api/*` and `/health` to:

`https://coder-survival-api.duckdns.org`

Keep that hostname during the Cloud.ru cutover to avoid an unnecessary frontend redeploy.
