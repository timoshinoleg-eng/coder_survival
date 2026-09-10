# Cloud.ru production backend

Target topology for Coder Survival:

- Vercel keeps hosting the Telegram Mini App frontend and bot webhook.
- `coder-survival-api.duckdns.org` stays the public backend hostname so the existing Vercel rewrites do not need to change.
- Cloud.ru Evolution VM runs only nginx + the backend Docker container.
- Cloud.ru Evolution Managed PostgreSQL runs in the same project and private subnet as the VM.
- PostgreSQL and backend port 3000 are never exposed publicly.

## Cloud.ru resources

1. Create an Evolution VPC/subnet.
2. Create an Ubuntu 24.04 VM in that subnet with a public IP and SSH key.
3. Security-group ingress: allow only 22/tcp from operator/CI sources and 80/443 from the Internet. Do not expose 3000 or 5432.
4. Create Managed PostgreSQL in the same project and subnet. Use its internal IP as `DB_HOST`.
5. Keep Managed PostgreSQL backups enabled.

Cloud.ru documents that Managed PostgreSQL is reachable only from Evolution VMs in the same project and subnet. Its current connection guide uses the internal IP and normal PostgreSQL port without an `sslmode` requirement; this deployment therefore defaults `CLOUDRU_DB_SSL=false`. Change the environment variable if the database configuration later requires TLS.

## First VM bootstrap

```bash
bash deploy/cloudru/bootstrap-vm.sh
```

The bootstrap requires Docker Compose >= 2.30 because production secrets are consumed with Compose `env_file.format: raw`. This prevents `$`, `${...}`, `#`, spaces and similar characters in secrets from being rewritten by Compose interpolation.

Re-login after the script so membership in the `docker` group is active.

Point `coder-survival-api.duckdns.org` at the Cloud.ru VM public IPv4, then configure nginx and Let's Encrypt:

```bash
API_DOMAIN=coder-survival-api.duckdns.org \
LETSENCRYPT_EMAIL=<operator-email> \
ISSUE_CERTIFICATE=true \
bash deploy/cloudru/configure-nginx.sh
```

Before the first release, verify that the API hostname resolves to the same public IPv4 used by GitHub Actions for SSH. The deploy workflow enforces this and fails before touching the database if DNS still points at an old host.

## Stable frontend origin

`WEBAPP_URL` and `FRONTEND_URL` must use the same stable production origin. Use a domain assigned to the Vercel `frontend` project, not a deployment-specific preview URL such as `frontend-<deployment-id>-<team>.vercel.app`.

- `FRONTEND_URL` must be the canonical HTTPS origin only, with no path or trailing slash.
- `WEBAPP_URL` may include a path, but its origin must equal `FRONTEND_URL`.

This is enforced before the production image is transferred to the VM.

## GitHub environment

Create the `production-cloudru` environment and configure:

Required secrets:

- `CLOUDRU_VM_HOST` — Cloud.ru VM public IPv4 or hostname.
- `CLOUDRU_VM_USER` — SSH user.
- `CLOUDRU_VM_SSH_KEY` — private SSH key.
- `CLOUDRU_VM_HOST_KEY` — pinned `known_hosts` entry for the VM and configured SSH port.
- `DB_HOST` — Managed PostgreSQL internal IP.
- `DB_PORT` — database port, normally `5432`.
- `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
- `BOT_TOKEN`, `BOT_BACKEND_SECRET`, `ADMIN_API_SECRET`.
- `WEBAPP_URL` — production Telegram Mini App HTTPS URL.
- `FRONTEND_URL` — canonical frontend HTTPS origin.
- `CORS_ALLOWED_ORIGINS` — optional extra comma-separated HTTPS origins.
- Rewarded-ad secrets only when that provider is enabled.

Repository/environment variables:

- `BACKEND_HEALTH_URL=https://coder-survival-api.duckdns.org/health`
- `CLOUDRU_VM_SSH_PORT=22`
- `CLOUDRU_DB_SSL=false`

### Pin the VM host key

Do not populate `CLOUDRU_VM_HOST_KEY` from an unauthenticated `ssh-keyscan` during deployment. Obtain the VM's ED25519 host public key from the Cloud.ru console/serial console or another trusted channel and store a complete OpenSSH `known_hosts` line.

For port 22 the line starts with the configured host/IP. For a non-standard SSH port it starts with `[host]:port`. The workflow verifies that the pinned entry actually covers `CLOUDRU_VM_HOST` + `CLOUDRU_VM_SSH_PORT`, and SSH itself verifies the server presents that key.

## Release contract

Run **Deploy Backend to Cloud.ru** from the `main` branch and type `deploy`.

The workflow:

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
