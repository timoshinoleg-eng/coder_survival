# Cloud.ru production backend

Target topology for Coder Survival:

- Vercel keeps hosting the Telegram Mini App frontend and bot webhook.
- `coder-survival-api.duckdns.org` stays the public backend hostname so the existing Vercel rewrites do not need to change.
- Cloud.ru Evolution VM runs only nginx + the backend Docker container.
- Cloud.ru Evolution Managed PostgreSQL runs in the same project and private subnet as the VM.
- PostgreSQL and backend port 3000 are never exposed publicly.

## Infrastructure source of truth

Production Cloud.ru resources are described in `deploy/cloudru/terraform/` and should be provisioned from a reviewed Terraform plan instead of by manually reproducing console clicks.

The Terraform module manages:

1. a dedicated Evolution VPC and routed subnet;
2. a security group with restricted SSH and public HTTP/HTTPS only;
3. a reserved public IPv4;
4. an encrypted Ubuntu boot disk and backend VM;
5. cloud-init bootstrap for the deployment user, nginx/certbot, Docker and Docker Compose;
6. Managed PostgreSQL 16 in the same subnet;
7. automatic PostgreSQL backups and PgBouncer transaction pooling;
8. a dedicated application database owner and database.

The PostgreSQL specification ID is an explicit required input. Terraform validates the selected specification and minimum storage at plan/apply time; it never auto-selects a paid database size. SSH `0.0.0.0/0` is rejected.

See `deploy/cloudru/terraform/README.md` for provider installation, required inputs, plan/apply procedure and state-security rules.

Cloud.ru documents that Managed PostgreSQL is reachable only from Evolution VMs in the same project and subnet. Its current connection guide uses the internal IP and normal PostgreSQL port without an `sslmode` requirement; this deployment therefore defaults `CLOUDRU_DB_SSL=false`. Change the environment variable if the database configuration later requires TLS.

## First VM bootstrap

The Terraform VM uses `deploy/cloudru/terraform/cloud-init.yaml.tftpl`, so the normal first boot installs and enables nginx, certbot and Docker, creates the deployment user, checks Docker Compose >= 2.30, and creates the application/backup directories automatically.

`deploy/cloudru/bootstrap-vm.sh` remains as an idempotent recovery/manual-bootstrap helper for an already-created VM; it is not the primary provisioning path.

After `terraform apply`, wait for cloud-init and verify the VM before the first release:

```bash
ssh coderdeploy@<terraform-vm-public-ip>
sudo cloud-init status --wait
docker compose version
sudo systemctl status nginx --no-pager
```

Point `coder-survival-api.duckdns.org` at the Cloud.ru VM public IPv4, then configure nginx and Let's Encrypt:

```bash
API_DOMAIN=coder-survival-api.duckdns.org \
LETSENCRYPT_EMAIL=<operator-email> \
ISSUE_CERTIFICATE=true \
bash deploy/cloudru/configure-nginx.sh
```

Before the first release, verify that the API hostname resolves to the same public IPv4 used by GitHub Actions for SSH. The deploy workflow enforces this and fails before touching the database if DNS still points at an old host.

## Stable frontend origin

The connected Vercel `frontend` project has a stable production alias:

`https://frontend-olegs-projects-bfc4e11a.vercel.app`

Use this exact origin for both production `FRONTEND_URL` and, unless a Telegram path is intentionally added later, `WEBAPP_URL`. Do not use a deployment-specific preview URL such as `frontend-<deployment-id>-<team>.vercel.app`.

Before the first Cloud.ru backend cutover, run **Deploy Frontend Production** from the current `main` and verify the stable alias serves that release. The workflow builds/tests the frontend, deploys exact `main` with Vercel `--prod`, and checks that the stable alias still serves the Coder Survival shell.

- `FRONTEND_URL` must be the canonical HTTPS origin only, with no path or trailing slash.
- `WEBAPP_URL` may include a path, but its origin must equal `FRONTEND_URL`.

The backend deploy enforces this relationship before the production image is transferred to the VM.

## GitHub environment

Create the `production-cloudru` environment and configure:

Required secrets:

- `CLOUDRU_VM_HOST` — Terraform `vm_public_ip` output.
- `CLOUDRU_VM_USER` — Terraform `vm_user` output, normally `coderdeploy`.
- `CLOUDRU_VM_SSH_KEY` — private SSH key matching the public key provisioned by Terraform.
- `CLOUDRU_VM_HOST_KEY` — pinned `known_hosts` entry for the VM and configured SSH port.
- `DB_HOST` — private Managed PostgreSQL host from the sensitive Terraform connection output.
- `DB_PORT` — database port, normally `5432`.
- `DB_NAME` — Terraform `postgres_database` output.
- `DB_USER` — Terraform `postgres_user` output.
- `DB_PASSWORD` — same strong password supplied as `TF_VAR_postgres_app_password` during provisioning.
- `BOT_TOKEN`, `BOT_BACKEND_SECRET`, `ADMIN_API_SECRET`.
- `WEBAPP_URL=https://frontend-olegs-projects-bfc4e11a.vercel.app`
- `FRONTEND_URL=https://frontend-olegs-projects-bfc4e11a.vercel.app`
- `CORS_ALLOWED_ORIGINS` — optional extra comma-separated HTTPS origins.
- Rewarded-ad secrets only when that provider is enabled.

Repository/environment variables:

- `BACKEND_HEALTH_URL=https://coder-survival-api.duckdns.org/health`
- `CLOUDRU_VM_SSH_PORT=22`
- `CLOUDRU_DB_SSL=false`

### Pin the VM host key

Do not populate `CLOUDRU_VM_HOST_KEY` from an unauthenticated `ssh-keyscan` during deployment. Obtain the VM's ED25519 host public key from the Cloud.ru console/serial console or another trusted channel and store a complete OpenSSH `known_hosts` line.

For port 22 the line starts with the configured host/IP. For a non-standard SSH port it starts with `[host]:port`. The workflow verifies that the pinned entry actually covers `CLOUDRU_VM_HOST` + `CLOUDRU_VM_SSH_PORT`, and SSH itself verifies the server presents that key.

## CI-to-VM SSH constraint

The backend production workflow currently uses a GitHub-hosted runner, whose public source IP is dynamic. Production Terraform intentionally requires a narrow `ssh_allowed_cidrs` list and rejects public SSH from `0.0.0.0/0`.

Do not weaken that rule just to make the first deployment convenient. Before relying on automated backend SSH deployment, establish a stable trusted CI source (for example a dedicated deployment runner/network path) and allowlist only that source plus required operator `/32` addresses.

## Release contract

First run **Deploy Frontend Production** from `main`. Then run **Deploy Backend to Cloud.ru** from `main` and type `deploy`.

The backend workflow:

1. refuses any production release not dispatched from `main`;
2. runs the complete backend suite against PostgreSQL 16;
3. builds an immutable Docker image on GitHub Actions rather than on the small VM;
4. validates the exact production configuration and stable frontend origin;
5. pins the SSH host key instead of trusting `ssh-keyscan` during release;
6. verifies the public API DNS resolves to the same VM used for SSH;
7. verifies Docker, Docker Compose >= 2.30 and nginx on the VM;
8. transfers the image and a mode-600 raw environment file;
9. validates production preflight inside the exact release image;
10. checks Managed PostgreSQL reachability from the VM;
11. creates a pre-migration `pg_dump` backup;
12. applies migrations before replacing the live container;
13. starts the new image on loopback only;
14. waits for container health (`status=ok`, `db=connected`);
15. rolls back to the previous image if health fails;
16. verifies the public HTTPS `/health` endpoint.

`PAYMENTS_ENABLED=false` remains enforced in the generated production environment and Compose until the separate payment go-live decision.

## Secret-format contract

The generated `backend.env` is a raw line-oriented Docker env file. Newlines, carriage returns and NUL bytes are rejected. Other common characters, including `$`, `${...}`, `#`, spaces and `=`, are preserved literally. The Cloud.ru infra CI contains a round-trip regression test for these values through both Docker Compose and `docker run --env-file`.
