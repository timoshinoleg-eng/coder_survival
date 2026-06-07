# Deployment Checklist — Coder Survival

## 1. Yandex Cloud VM Setup Summary

- **Image:** Ubuntu 22.04 LTS
- **Specs:** 2 vCPU, 4 GB RAM, 20 GB disk (minimum)
- **Software:** Docker + Docker Compose, nginx, certbot
- **DNS:** A-record `coder-survival-api.duckdns.org` → VM public IP (`111.88.247.195`)
- **Firewall:** open 22 (SSH), 80 (HTTP), 443 (HTTPS)
- **Provision:** run `scripts/setup-api-host-on-vm.ps1` to configure nginx reverse proxy and TLS

## 2. Deploy Backend (Docker)

### Automated (recommended)
```powershell
# From Windows host
.\scripts\release-prod.ps1 -VmHost "ubuntu@111.88.247.195"
```

### Manual on VM
```bash
cd /opt/coder-survival/app
docker build --no-cache -t cr.yandex/crpduv7gci2puq300f38/coder-survival-backend:latest ./backend
docker-compose -f docker-compose.backend.yml run --rm backend node src/migrate.js
docker-compose -f docker-compose.backend.yml up -d --force-recreate backend
```

## 3. Deploy Backend (PM2 — alternative)

Use PM2 when running Node.js directly without Docker:

```bash
cd backend
npm ci
npm run migrate
pm2 start src/index.js --name coder-survival-api
pm2 save
```

Reload after code changes:
```bash
pm2 reload coder-survival-api --update-env
```

## 4. Deploy Frontend (Vercel)

```bash
cd frontend
npx vercel deploy --prod
```

Deploy bot serverless functions:
```bash
cd bot
npx vercel deploy --prod
```

## 5. Required Environment Variables

### Backend (`backend/.env` or VM env / Docker env)
| Variable | Example | Required |
|----------|---------|----------|
| `NODE_ENV` | `production` | Yes |
| `PORT` | `3000` | Yes |
| `DATABASE_URL` | `postgresql://user:pass@host:6432/db` | Yes |
| `DB_HOST` | `rc1a-...mdb.yandexcloud.net` | Yes* |
| `DB_PORT` | `6432` | Yes* |
| `DB_NAME` | `coder_survival` | Yes* |
| `DB_USER` | `coder` | Yes* |
| `DB_PASSWORD` / `DB_PASS` | `***` | Yes* |
| `BOT_TOKEN` | `123456:ABC...` | Yes |
| `BOT_BACKEND_SECRET` | `shared-secret` | Yes |
| `WEBAPP_URL` | `https://codersurvival.ru` | Yes |
| `INIT_DATA_MAX_AGE_SECONDS` | `3600` | Yes |
| `RATE_LIMIT_MAX_TAPS_PER_SECOND` | `15` | Yes |
| `RATE_LIMIT_SOFT_BAN_THRESHOLD` | `25` | Yes |
| `RATE_LIMIT_DAILY_CAP_PER_IP` | `10000` | Yes |
| `AMPLITUDE_API_KEY` | `...` | No |
| `FRONTEND_URL` | `https://codersurvival.ru` | No |
| `ADSGRAM_SECRET` | `...` | No |
| `PROPELLER_SECRET` | `...` | No |

> *`DATABASE_URL` OR individual `DB_*` variables must be provided.

### Bot (`bot/.env` or Vercel environment variables)
| Variable | Example | Required |
|----------|---------|----------|
| `BOT_TOKEN` | `123456:ABC...` | Yes |
| `WEBAPP_URL` | `https://codersurvival.ru` | Yes |
| `API_URL` | `https://coder-survival-api.duckdns.org` | Yes |
| `TELEGRAM_WEBHOOK_SECRET` | `secret` | Yes |
| `BOT_BACKEND_SECRET` | `shared-secret` | Yes |
| `BOT_USERNAME` | `coder_survival_bot` | Yes |

### Frontend build-time (Vercel / `.env`)
| Variable | Example | Required |
|----------|---------|----------|
| `VITE_API_BASE_URL` | `https://coder-survival-api.duckdns.org` | Yes |

## 6. Run Migrations

### Docker path
```bash
docker-compose -f docker-compose.backend.yml run --rm backend node src/migrate.js
```

### Native / PM2 path
```bash
cd backend
npm run migrate
# or
node src/migrate.js
```

Migrations are transactional and tracked in the `schema_migrations` table.

## 7. Rollback

### Fast code rollback
```bash
# Revert last commit
git revert HEAD
git push origin main

# Restart process
pm2 reload all                              # PM2 path
# OR
docker-compose -f docker-compose.backend.yml up -d --force-recreate backend   # Docker path
```

### Database rollback
- Do **not** delete migration rows from `schema_migrations` manually unless it is an emergency.
- If a migration caused data corruption, restore from the most recent backup created by `scripts/backup-db.ps1`.

### Full deployment rollback
1. Revert code (`git revert HEAD` or checkout previous tag).
2. Re-deploy backend (Docker rebuild or `pm2 reload`).
3. Run smoke tests: `.\scripts\smoke-prod.ps1`.
4. If frontend was also broken, redeploy previous Vercel deployment from Vercel dashboard.
