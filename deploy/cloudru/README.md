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

Cloud.ru documents that Managed PostgreSQL is reachable only from Evolution VMs in the same project and subnet. Its current connection guide uses the internal IP and normal PostgreSQL port without an `sslmode` requirement; this deployment therefore defaults `CLOUDRU_DB_SSL=false`. Change the repository variable if the database configuration later requires TLS.

## First VM bootstrap

```bash
bash deploy/cloudru/bootstrap-vm.sh
```

Re-login after the script so membership in the `docker` group is active.

Point `coder-survival-api.duckdns.org` at the Cloud.ru VM public IPv4, then configure nginx and Let's Encrypt:

```bash
API_DOMAIN=coder-survival-api.duckdns.org \
LETSENCRYPT_EMAIL=<operator-email> \
ISSUE_CERTIFICATE=true \
bash deploy/cloudru/configure-nginx.sh
```

## GitHub environment

Create the `production-cloudru` environment and configure:

Required secrets:

- `CLOUDRU_VM_HOST` — Cloud.ru VM public IPv4 or hostname.
- `CLOUDRU_VM_USER` — SSH user.
- `CLOUDRU_VM_SSH_KEY` — private SSH key.
- `CLOUDRU_VM_HOST_KEY` — pinned `known_hosts` entry for the VM.
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

## Release contract

Run **Deploy Backend to Cloud.ru** manually and type `deploy`.

The workflow:

1. runs the complete backend suite against PostgreSQL 16;
2. builds an immutable Docker image on GitHub Actions rather than on the small VM;
3. pins the SSH host key instead of trusting `ssh-keyscan` during release;
4. transfers the image and a generated mode-600 environment file;
5. creates a pre-migration `pg_dump` backup;
6. applies migrations before replacing the live container;
7. starts the new image on loopback only;
8. waits for container health (`status=ok`, `db=connected`);
9. rolls back to the previous image if health fails;
10. verifies the public HTTPS `/health` endpoint.

`PAYMENTS_ENABLED=false` remains hard-coded in the generated production environment until the separate payment go-live decision.
