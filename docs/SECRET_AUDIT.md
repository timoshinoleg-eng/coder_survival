# Secret Audit — Coder Survival

**Audit Date:** 2026-06-24
**Audited by:** MiMoCode (automated)
**Scope:** Full repository — source code, configs, CI/CD, Docker

---

## 1. Hardcoded Secrets Scan

### Findings

| Severity | Location | Description | Action Required |
|----------|----------|-------------|-----------------|
| LOW | `.github/workflows/preview.yml:12-13` | `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` hardcoded | Move to GitHub Secrets if considered sensitive (org/project IDs are semi-public) |
| LOW | `.github/workflows/backend-tests.yml:23` | `POSTGRES_PASSWORD: postgres` for test container | Acceptable for CI test containers (ephemeral, local) |
| LOW | `.github/workflows/integration-tests-staging.yml:25-29` | Staging DB host IP `89.169.140.219` and user `test` hardcoded | Move to GitHub Secrets if IP should be hidden |
| INFO | `backend/.env.example:10` | `DB_PASSWORD=***` placeholder | Not a real secret — placeholder only |

**No production secrets found hardcoded in source code.**

### Patterns Searched (0 matches for real secrets)
- `sk_live_`, `pk_live_`, `AKIA*`, `ghp_*`, `gho_*`, `github_pat_*`, `xox[bpsa]-`
- `console.log` with password/secret/token — none found
- Hardcoded API keys, JWTs, Bearer tokens — none found

---

## 2. Environment Variables Inventory

### Backend (`backend/.env.example`)

| Variable | Required | Used In | Rotation Needed | Last Rotated |
|----------|----------|---------|-----------------|--------------|
| `DATABASE_URL` | Yes | `backend/src/config/database.js` | Quarterly | Unknown |
| `DB_HOST` | Yes* | `backend/src/config/database.js` | N/A (infra) | N/A |
| `DB_PORT` | Yes* | `backend/src/config/database.js` | N/A | N/A |
| `DB_NAME` | Yes* | `backend/src/config/database.js` | N/A | N/A |
| `DB_USER` | Yes* | `backend/src/config/database.js` | Semi-annually | Unknown |
| `DB_PASSWORD` / `DB_PASS` | Yes* | `backend/src/config/database.js` | **Quarterly** | Unknown |
| `BOT_TOKEN` | Yes | `backend/src/routes/` | **Quarterly** | Unknown |
| `BOT_BACKEND_SECRET` | Yes | `backend/src/routes/referral.js` | **Quarterly** | Unknown |
| `WEBAPP_URL` | Yes | Multiple routes | N/A (config) | N/A |
| `INIT_DATA_MAX_AGE_SECONDS` | Yes | Auth middleware | N/A | N/A |
| `RATE_LIMIT_MAX_TAPS_PER_SECOND` | Yes | Rate limiter | N/A | N/A |
| `RATE_LIMIT_SOFT_BAN_THRESHOLD` | Yes | Rate limiter | N/A | N/A |
| `RATE_LIMIT_DAILY_CAP_PER_IP` | Yes | Rate limiter | N/A | N/A |
| `TIER_THRESHOLDS` | No | Game balance | N/A | N/A |
| `ADSGRAM_SECRET` | No | Ad integration | Semi-annually | Unknown |
| `PROPELLER_SECRET` | No | Ad integration | Semi-annually | Unknown |
| `AMPLITUDE_API_KEY` | No | Analytics | Semi-annually | Unknown |
| `FRONTEND_URL` | No | CORS/redirects | N/A | N/A |

*\* Either `DATABASE_URL` or individual `DB_*` vars required.*

### Bot (`bot/.env.example`)

| Variable | Required | Used In | Rotation Needed |
|----------|----------|---------|-----------------|
| `BOT_TOKEN` | Yes | `bot/src/createBot.js` | **Quarterly** |
| `WEBAPP_URL` | Yes | Bot config | N/A |
| `API_URL` | Yes | Bot → Backend calls | N/A |
| `TELEGRAM_WEBHOOK_SECRET` | Yes | `bot/api/webhook.js` | **Quarterly** |
| `BOT_BACKEND_SECRET` | Yes | Backend auth | **Quarterly** |
| `BOT_USERNAME` | Yes | Bot identity | N/A |

### Frontend (`frontend/.env.example`)

| Variable | Required | Used In | Rotation Needed |
|----------|----------|---------|-----------------|
| `VITE_AMPLITUDE_API_KEY` | No | Analytics SDK | Semi-annually |
| `VITE_ADSGRAM_BLOCK_ID` | No | Ad integration | N/A |
| `VITE_ADS_PROVIDER` | No | Ad config | N/A |
| `VITE_ENABLE_REWARDED_ADS` | No | Feature flag | N/A |

### Root `.env.example`

| Variable | Required | Used In | Rotation Needed |
|----------|----------|---------|-----------------|
| `DB_HOST` through `DB_PASSWORD` | Yes | Root-level config | Quarterly (password) |
| `BOT_TOKEN` | Yes | Root-level config | **Quarterly** |
| `BOT_BACKEND_SECRET` | Yes | Root-level config | **Quarterly** |
| `WEBAPP_URL` | Yes | Root-level config | N/A |
| `INIT_DATA_MAX_AGE_SECONDS` | Yes | Auth | N/A |
| Rate limit vars | Yes | Rate limiter | N/A |
| `ADSGRAM_SECRET` | No | Ads | Semi-annually |
| `PROPELLER_SECRET` | No | Ads | Semi-annually |

### GitHub Actions Secrets (referenced in workflows)

| Secret Name | Used In | Purpose |
|-------------|---------|---------|
| `VM_SSH_KEY` | deploy-backend.yml, manual-release.yml | SSH access to production VM |
| `VM_HOST` | deploy-backend.yml | Production VM hostname |
| `VM_USER` | deploy-backend.yml | SSH user on VM |
| `STAGING_SSH_KEY` | deploy-staging.yml | SSH access to staging VM |
| `STAGING_HOST` | deploy-staging.yml | Staging VM hostname |
| `STAGING_USER` | deploy-staging.yml | SSH user on staging |
| `DB_HOST` | deploy-backend.yml | Production DB host |
| `DB_PORT` | deploy-backend.yml | Production DB port |
| `DB_NAME` | deploy-backend.yml | Production DB name |
| `DB_USER` | deploy-backend.yml | Production DB user |
| `DB_PASSWORD` | deploy-backend.yml | Production DB password |
| `BOT_TOKEN` | deploy-backend.yml, deploy-staging.yml | Telegram bot token |
| `WEBAPP_URL` | deploy-backend.yml, deploy-staging.yml | Frontend URL |
| `BOT_BACKEND_SECRET` | deploy-backend.yml, deploy-staging.yml | Backend auth secret |
| `DATABASE_URL` | deploy-staging.yml | Staging DB connection string |
| `ADSGRAM_SECRET` | deploy-staging.yml | Ad network secret |
| `PROPELLER_SECRET` | deploy-staging.yml | Ad network secret |
| `AMPLITUDE_API_KEY` | deploy-staging.yml | Analytics key |
| `FRONTEND_URL` | deploy-staging.yml | Frontend URL |
| `TEST_DB_PASSWORD` | integration-tests-staging.yml | Staging test DB password |
| `VERCEL_TOKEN` | preview.yml, manual-release.yml | Vercel deployment auth |
| `BATTLE_DISTRIBUTE_URL` | battle-distribute.yml | Battle distribution endpoint |
| `BATTLE_DISTRIBUTE_SECRET` | battle-distribute.yml | Battle distribution auth |
| `FREEMODEL_API_KEY` | claude-agent.yml | AI agent API key |
| `GH_PAT` | claude-agent.yml | GitHub personal access token |

---

## 3. Docker Secret Handling

### docker-compose.backend.yml (Production)

**Method:** Environment variable interpolation from host shell or `.env` file.

```yaml
environment:
  DB_HOST: ${DB_HOST}
  DB_PORT: ${DB_PORT}
  DB_NAME: ${DB_NAME}
  DB_USER: ${DB_USER}
  DB_PASS: ${DB_PASSWORD}
  DB_PASSWORD: ${DB_PASSWORD}
  BOT_TOKEN: ${BOT_TOKEN}
  BOT_BACKEND_SECRET: ${BOT_BACKEND_SECRET}
```

**Assessment:** ✅ Acceptable — secrets are not baked into images. They're injected at runtime via env vars. The canonical env file lives at `/opt/coder_survival/backend/.env` on the VM (outside repo).

**Note:** `DB_PASS` and `DB_PASSWORD` are both set (lines 24-25) for backward compatibility with the backend's config which checks both.

### docker-compose.prod.yml (Legacy Reference)

Same pattern as above — env var interpolation. Not used in production (backend-only compose is active).

### render.yaml (Render.com)

```yaml
envVars:
  - key: DATABASE_URL
    fromDatabase:
      name: coder-survival-db-test
      property: connectionString
  - key: BOT_TOKEN
    sync: false
  - key: BOT_BACKEND_SECRET
    sync: false
```

**Assessment:** ✅ Secrets managed via Render dashboard, not in YAML.

---

## 4. GitHub Actions Secret Usage

### Secret Logging Check

| Workflow | Secrets in logs? | Assessment |
|----------|-----------------|------------|
| deploy-backend.yml | SSH key written to `~/.ssh/id_rsa` (line 35) — ephemeral runner | ✅ OK |
| deploy-staging.yml | SSH key via `webfactory/ssh-agent` action (line 35) | ✅ OK |
| manual-release.yml | SSH key written to `~/.ssh/id_rsa` (line 68) | ✅ OK |
| battle-distribute.yml | Secret in `X-Bot-Backend-Secret` header (line 29) — not logged | ✅ OK |
| claude-agent.yml | `FREEMODEL_API_KEY`, `GH_PAT` as env vars (lines 62-64) | ✅ OK |
| integration-tests-staging.yml | `DB_PASSWORD` in env, `DATABASE_URL` in export (line 62) | ⚠️ Could appear in job logs if migration fails |
| backend-tests.yml | `POSTGRES_PASSWORD: postgres` in service container | ✅ OK (ephemeral) |

### Security Scan Workflow

`security-scan.yml` runs TruffleHog with `--only-verified` flag — good. Runs on push to main and PRs.

### Permissions

`claude-agent.yml` has `contents: write` and `pull-requests: write` — necessary for the AI agent to create PRs. Acceptable with `GH_PAT` scoped appropriately.

---

## 5. .gitignore Verification

```gitignore
.env
.env.local
.env.*.local
.env.production
!.env.example
*.pem
*.key
```

**Assessment:** ✅ Correct. All `.env` variants are excluded except `.env.example`. Private keys (`*.pem`, `*.key`) are also excluded.

**Missing from .gitignore:**
- `.env.staging` — should be added
- `.env.development.local` — covered by `.env.*.local` pattern ✅
- `*.secret` — not currently excluded (could be added for safety)

---

## 6. Additional Secrets Found in Scripts

| Script | Secret | How Used |
|--------|--------|----------|
| `scripts/duckdns-update.ps1` | `DUCKDNS_TOKEN` | Passed as `-Token` parameter, not hardcoded |
| `scripts/observe-economy.ps1` | `OBSERVATION_SECRET` or `BOT_BACKEND_SECRET` | Fetched from VM runtime via SSH |
| `scripts/smoke-core-prod.ps1` | `BOT_TOKEN` | Fetched from VM runtime via SSH |
| `scripts/restart-vm.sh` | Multiple secrets | Loaded from SOPS-encrypted file (`/opt/coder-survival/.sops-age`) |

**Assessment:** ✅ Scripts fetch secrets at runtime, not hardcoded. SOPS encryption used for VM secrets.

---

## 7. Rotation Checklist

### Critical (Rotate Immediately if Compromised)

- [ ] **BOT_TOKEN** — Telegram bot token. Rotate via @BotFather `/revoke`.
  - Where: `@BotFather` → `/revoke` → select bot → new token generated
  - Update: GitHub Secrets (`BOT_TOKEN`), Render env vars, VM `.env`, Vercel env vars
  - Impact: Bot goes offline until updated everywhere

- [ ] **DB_PASSWORD** — PostgreSQL database password.
  - Where: Yandex Cloud DB console → Users → change password
  - Update: GitHub Secrets (`DB_PASSWORD`), VM `.env`, `DATABASE_URL` if changed
  - Impact: Backend loses DB access until updated

- [ ] **BOT_BACKEND_SECRET** — Shared auth between bot and backend.
  - Where: Generate new secret: `openssl rand -hex 32`
  - Update: GitHub Secrets (`BOT_BACKEND_SECRET`), VM `.env`, Vercel env vars
  - Impact: Bot-backend communication breaks until updated

### High (Rotate Quarterly)

- [ ] **VM_SSH_KEY** — SSH private key for production VM.
  - Where: Generate new key: `ssh-keygen -t ed25519 -f cs-deploy`
  - Update: GitHub Secrets (`VM_SSH_KEY`), add public key to VM `~/.ssh/authorized_keys`
  - Impact: CI/CD deploys fail until updated

- [ ] **STAGING_SSH_KEY** — SSH private key for staging VM.
  - Same as above for staging infrastructure.

- [ ] **TELEGRAM_WEBHOOK_SECRET** — Webhook validation token.
  - Where: Generate new secret: `openssl rand -hex 32`
  - Update: Telegram Bot API webhook, Vercel env vars
  - Impact: Webhook validation fails until updated

- [ ] **TEST_DB_PASSWORD** — Staging test DB password.
  - Where: Yandex Cloud DB console
  - Update: GitHub Secrets (`TEST_DB_PASSWORD`)
  - Impact: Integration tests fail until updated

### Medium (Rotate Semi-Annually)

- [ ] **ADSGRAM_SECRET** — Ad network API secret.
  - Where: Adsgram dashboard → API keys
  - Update: GitHub Secrets (`ADSGRAM_SECRET`), VM `.env`, Vercel env vars

- [ ] **PROPELLER_SECRET** — Ad network API secret.
  - Where: PropellerAds dashboard → API keys
  - Update: GitHub Secrets (`PROPELLER_SECRET`), VM `.env`, Vercel env vars

- [ ] **AMPLITUDE_API_KEY** — Analytics API key.
  - Where: Amplitude dashboard → Settings → API keys
  - Update: GitHub Secrets (`AMPLITUDE_API_KEY`), VM `.env`, Vercel env vars

- [ ] **VERCEL_TOKEN** — Vercel deployment token.
  - Where: Vercel dashboard → Settings → Tokens
  - Update: GitHub Secrets (`VERCEL_TOKEN`)

- [ ] **FREEMODEL_API_KEY** — AI agent API key.
  - Where: FreeModel dashboard → API keys
  - Update: GitHub Secrets (`FREEMODEL_API_KEY`)

- [ ] **GH_PAT** — GitHub personal access token.
  - Where: GitHub → Settings → Developer settings → Personal access tokens
  - Update: GitHub Secrets (`GH_PAT`)
  - Scope: Recommend `repo` + `workflow` only

- [ ] **BATTLE_DISTRIBUTE_SECRET** — Battle distribution auth.
  - Where: Generate new: `openssl rand -hex 32`
  - Update: GitHub Secrets (`BATTLE_DISTRIBUTE_SECRET`), VM `.env`

### Low (Review Annually)

- [ ] **DuckDNS Token** — DNS update token.
  - Where: duckdns.org → account → token
  - Update: Pass to `duckdns-update.ps1` manually (not stored in repo)

- [ ] **SOPS AGE Key** — File encryption key for VM secrets.
  - Where: `/opt/coder-survival/.sops-age-key`
  - Rotate: Re-encrypt secrets file with new key

---

## 8. Recommendations

### Immediate Actions
1. **Add `*.secret` to `.gitignore`** — prevents accidental secret file commits
2. **Remove hardcoded staging IP** (`89.169.140.219`) from `integration-tests-staging.yml` — move to GitHub Secret
3. **Remove `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`** from `preview.yml` — move to GitHub Secrets
4. **Enable branch protection** on `main` — require PR reviews, no direct pushes

### Ongoing Practices
1. **Set up secret rotation reminders** — use GitHub Actions schedule or external tool
2. **Audit GitHub Secrets access** — review who has access quarterly
3. **Enable GitHub Secret Scanning** — alerts on leaked secrets
4. **Use `action/secret-scanning-push-protection`** — blocks pushes with detected secrets
5. **Document secret owners** — who to contact when rotation is needed

### Architecture Improvements
1. **Consider SOPS for all environments** — not just VM (already used in `restart-vm.sh`)
2. **Move staging secrets to GitHub Environments** — `staging` environment with protection rules
3. **Use OIDC for cloud auth** — replace long-lived service account keys where possible

---

## Appendix: .env.example Status

| File | Exists | All Vars Documented | Notes |
|------|--------|---------------------|-------|
| `.env.example` (root) | ✅ | ✅ | Complete |
| `backend/.env.example` | ✅ | ✅ | Includes test DB vars |
| `bot/.env.example` | ✅ | ✅ | Complete |
| `frontend/.env.example` | ✅ | ✅ | Complete |

**All required env vars are documented in .env.example files.**

---

## Appendix: Secrets Flow Diagram

```
┌─────────────────────────────────────────────────────┐
│                    GitHub Secrets                    │
│  VM_SSH_KEY, BOT_TOKEN, DB_PASSWORD, etc.           │
└──────────────┬──────────────────────────┬───────────┘
               │                          │
    ┌──────────▼──────────┐    ┌──────────▼──────────┐
    │  deploy-backend.yml │    │  deploy-staging.yml  │
    │  manual-release.yml │    │                      │
    └──────────┬──────────┘    └──────────┬──────────┘
               │                          │
    ┌──────────▼──────────┐    ┌──────────▼──────────┐
    │  Production VM      │    │  Staging VM          │
    │  /opt/coder_survival│    │  /opt/coder-survival │
    │  /backend/.env      │    │  /backend/.env       │
    └──────────┬──────────┘    └──────────┬──────────┘
               │                          │
    ┌──────────▼──────────┐    ┌──────────▼──────────┐
    │  Docker Container   │    │  Docker Container    │
    │  (env var injection)│    │  (env var injection) │
    └─────────────────────┘    └─────────────────────┘
```

---

*End of audit. Next review recommended: 2026-09-24 (quarterly).*
