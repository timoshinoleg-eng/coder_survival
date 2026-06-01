# Coder Survival  -  Yandex Cloud Migration Plan

> **Date:** 2026-05-30  
> **Scope:** Infrastructure migration plan only. No code changes.  
> **Constraints:** Bot stays on Vercel. Telegram Bot API egress issues preclude bot hosting in YC without a verified proxy.  

---

## 0. Verified API Methods (pre-checked against repo)

| Endpoint | Method | Notes for smoke tests |
|----------|--------|----------------------|
| `/health` | GET | Health check |
| `/api/state` | GET | Player state |
| `/api/tap` | POST | Tap/click mutation |
| `/api/quests/daily` | GET | Daily quests |
| `/api/quests/claim` | POST | Claim quest reward |
| `/api/battle/today` | GET | Battle leaderboard |
| `/api/event/active` | GET | Active event |
| `/api/event/claim` | POST | Claim event reward |
| `/api/pass/status` | GET | Pass status |
| `/api/pass/claim` | POST | Claim pass reward |
| `/api/referral/stats` | GET | Referral stats |
| `/api/referral/claim-milestone` | POST | Claim milestone reward |
| `/api/shop/products` | GET | Shop catalog |
| `/api/buy` | POST | Purchase item (invoice payload) |
| `/api/meme?templateId=...&format=...` | GET | Generate meme PNG |
| `/api/meme/achievement?achievementId=...` | GET | Generate achievement meme PNG |
| `/api/meme/share` | POST | Record meme share |
| `/api/meme/token` | POST | Internal bot token (secret header) |
| `/api/meme/public/:token` | GET | Public meme by token |
| `/api/meme/gif/debug-stages` | GET | Generate debugging GIF |
| `/api/meme/gif/deadline` | GET | Generate deadline GIF |
| `/api/internal/observation/economy` | GET | Internal ops (secret header) |
| `/api/internal/payments/telegram/confirm` | POST | Internal payment confirm (secret header) |

---

## 1. First 24 Hours of the Grant

Do these before any production workload touches YC billing.

| # | Task | How | Validate |
|---|------|-----|----------|
| 1 | Activate grant | YC Console -> Billing -> Promotional code | Balance shows grant amount |
| 2 | Create billing alert | Console -> Billing -> Budgets -> Alert at **RUB 1,000**, **RUB 5,000**, **RUB 10,000** | Email/Telegram notification received |
| 3 | Create folder | `coder-survival-prod` | Visible in folder selector |
| 4 | Create service account | Name: `cs-prod-sa` | Roles: `container-registry.images.puller`, `lockbox.payloadViewer`, `logging.writer`, `monitoring.editor` (least-privilege; no folder-wide editor) |
| 5 | Generate S3 static key | Console -> Service accounts -> `cs-prod-sa` -> Create static access key | Save `access_key_id` + `secret_access_key` in offline vault (1Password/Bitwarden). **Never commit them.** |
| 6 | Create Lockbox secret | Name: `cs-prod-secrets` | Versions: `DB_PASSWORD`, `BOT_BACKEND_SECRET`, `JWT_SECRET`. Note: `BOT_TOKEN` stays in Vercel env (bot runtime). Backend only needs `BOT_BACKEND_SECRET` for internal route validation. |
| 7 | Verify Container Registry | `cr.yandex/crpduv7gci2puq300f38/coder-survival-backend:latest` exists and is pullable | `docker pull cr.yandex/.../coder-survival-backend:latest` from a test VM |
| 8 | Create staging bucket | `coder-survival-media-staging` in Object Storage | Private ACL, versioning disabled for staging |
| 9 | Create staging VM | Compute: 2 vCPU, 4 GB RAM, 50 GB SSD, Ubuntu 22.04, `ru-central1-a` | SSH works, Docker installed |
| 10 | Security group | Inbound: 22 (your IP), 80, 443 (any) | Verify with `nmap -p22,80,443 <staging-ip>` |
| 11 | Copy `.env` baseline | From current VM (`111.88.247.195`), **scrub secrets**, insert Lockbox refs / env file template | Review diff offline |
| 12 | Run one backend container on staging | `docker run -d -p 3000:3000 --env-file .env cr.yandex/.../coder-survival-backend:latest` | `curl -I http://<staging-ip>:3000/health` -> `200 OK` |

**Critical rule:** Do **not** create production Managed PostgreSQL HA or CDN resources on day 1. Use staging-only infra to validate the build pipeline and native library compatibility first.

---

## 2. Fast 1-Day Variant

**Goal:** Move backend compute and persistent media to YC. Keep bot on Vercel. Keep frontend on Vercel. Do not refactor architecture.

### Topology

```
[User] -> [Telegram] -> [Vercel Frontend] -> [Vercel API proxy /api/*]
                                              |
                                        [YC VM: backend + Postgres in Docker]
                                              |
                                        [YC Object Storage: media bucket]

[Bot Webhook] -> [Vercel Bot Runtime] -> [YC VM backend /api/internal/*]
```

### What goes where

| Component | YC Service | What we put there |
|-----------|-----------|-------------------|
| Backend runtime | **Compute VM** (1x 2vCPU/4GB/50GB) | Docker container from Container Registry |
| Database | **PostgreSQL in Docker** on the same VM | `docker-compose.backend.yml`  -  same pattern as current VM |
| Media (memes, GIFs) | **Object Storage** bucket `coder-survival-media-prod` | Static meme templates, generated PNG/GIF caches (uploaded via S3 SDK from backend) |
| Secrets | **Lockbox** | DB password, BOT_BACKEND_SECRET |
| Container images | **Container Registry** (existing) | `coder-survival-backend:latest` |

### Why this is enough for the grant period

- Object Storage replaces local disk for meme/GIF persistence; CDN is optional if DAU < 10k.
- One VM + Docker mirrors current operational knowledge; no new managed services to learn under deadline pressure.
- Bot stays on Vercel = no Telegram API egress risk.

### Deploy steps (verified commands only)

```bash
# 1. On staging VM, clone deploy artifacts (backend source + compose)
#    (Use the same whitelist pattern from scripts/release-prod.ps1)
scp -r backend/ docker-compose.backend.yml .env ubuntu@<yc-staging-ip>:/opt/cs/

# 2. SSH into staging VM
ssh ubuntu@<yc-staging-ip>
cd /opt/cs

# 3. Pull latest image (already in Container Registry)
docker pull cr.yandex/crpduv7gci2puq300f38/coder-survival-backend:latest

# 4. Start stack (same compose file used today)
docker-compose -f docker-compose.backend.yml up -d

# 5. Run migrations
docker-compose -f docker-compose.backend.yml run --rm backend node src/migrate.js

# 6. Health check
curl -I http://localhost:3000/health
```

> **Spots to verify via Console/Terraform:**
> - YC Security Group inbound rules (Console -> VPC -> Security groups).
> - If the VM has no public IP, use YC Serial Console or assign a temporary IP.

### Staging smoke (must pass before prod)

```powershell
# Standard game loop
pwsh -File scripts/smoke-prod.ps1 `
  -BaseUrl "https://<staging-ip-or-domain>" `
  -DirectApiBaseUrl "https://<staging-ip-or-domain>" `
  -SkipMutationTests:$false -SkipP1Gaps:$false

# Meme/GIF native-lib check (GET, confirmed from repo)
$meme = Invoke-RestMethod "https://<staging-ip>/api/meme?templateId=wtf_per_minute&format=1:1" -Headers $headers
# Expect Content-Type: image/png

$gif = Invoke-RestMethod "https://<staging-ip>/api/meme/gif/debug-stages" -Method Get
# Expect Content-Type: image/gif

# If either returns 500, check VM logs for missing native libs (cairo, pango, etc.)
docker logs <backend-container>
```

### Cutover (Fast)

1. **Backup current VM**
   ```bash
   # On current VM (111.88.247.195)
   docker exec -i $(docker-compose -f docker-compose.backend.yml ps -q db) \
     pg_dump -U postgres coder_survival > cs_backup_$(date +%F).sql
   ```
   Copy `.sql` and `.env` to offline storage.

2. **Restore on YC VM**
   ```bash
   # On YC VM
   cat cs_backup_*.sql | docker exec -i $(docker-compose ps -q db) psql -U postgres
   ```

3. **Switch Vercel API origin**
   ```powershell
   pwsh -File scripts/set-api-origin.ps1 -ApiOrigin "https://<yc-vm-public-ip-or-domain>"
   cd frontend; npx vercel deploy --prod --yes
   ```

4. **Update DuckDNS (if used)**
   ```powershell
   pwsh -File scripts/duckdns-update.ps1 -Token <token> -Domain coder-survival-api
   ```

5. **Hold old VM for 24h**
   - Do **not** stop the old VM (`111.88.247.195`).
   - Set a calendar reminder to terminate after 24h if zero errors.

### Rollback (Fast)

| Step | Action | Time to recover |
|------|--------|-----------------|
| 1 | Re-run `scripts/set-api-origin.ps1` pointing back to old VM IP / `coder-survival-api.duckdns.org` | ~2 min |
| 2 | Redeploy frontend to Vercel (`npx vercel deploy --prod`) | ~1 min |
| 3 | Verify smoke against old URL | ~3 min |
| 4 | Stop YC VM to halt billing | ~1 min |

---

## 3. Production 3-5 Day Variant

**Goal:** HA database, scalable compute, CDN for media, centralized secrets, logging/monitoring, automated backups.

### Topology

```
[User] -> [Telegram] -> [Vercel Frontend] -> [ALB HTTPS listener]
                                              |
                                    [YC ALB] -> [Instance Group: 2+ backend VMs]
                                              |
                                    [Managed PostgreSQL HA: master + replica]
                                              |
                                    [Object Storage: media bucket]
                                              |
                                    [CDN: media.coder-survival.app]

[Bot Webhook] -> [Vercel Bot Runtime] -> [ALB] -> [Instance Group]
```

### YC Services: why, what, check, cost-after-grant

| YC Service | Why the game needs it | What we put there | Validation checklist | Est. cost after grant |
|-----------|----------------------|-------------------|----------------------|----------------------|
| **Compute Instance Group** | Auto-healing, rolling updates, scale-out during events | Template: Container Registry image; 2+ VMs; startup script pulls `.env` from Lockbox or writes it via Terraform | Health check on `/health` passes; rolling update does not drop connections | RUB 3,000-5,000/mo |
| **Application Load Balancer (ALB)** | TLS termination, path-based routing, DDoS shield | HTTPS listener -> Backend Group (Instance Group); HTTP->HTTPS redirect | `curl -I https://<alb-ip>/health` -> `200`; `curl -I http://<alb-ip>/health` -> `301` | RUB 1,500/mo |
| **Managed PostgreSQL HA** | No manual replication, automated backups, point-in-time recovery | `coder_survival` DB; users + progression tables | Master/replica lag < 1s; failover test in staging (Console -> cluster -> Failover) | RUB 5,000-8,000/mo |
| **Object Storage** | Meme/GIF persistence, offloading disk I/O from VM | Bucket `coder-survival-media-prod`; folders `/memes/`, `/gifs/`, `/templates/` | S3 `ListObjectsV2` works; upload/download via `aws s3 --endpoint-url=https://storage.yandexcloud.net` | RUB 500-1,000/mo |
| **CDN** | Low-latency meme delivery globally, reduced egress from YC | Origin Group -> bucket FQDN (`coder-survival-media-prod.storage.yandexcloud.net`); CDN Resource -> `media.coder-survival.app`; TLS cert via YCM; DNS CNAME | `curl -I https://media.coder-survival.app/gifs/debug-stages.gif` -> `200` + `X-Cache: HIT` after repeat request | RUB 1,000-2,000/mo |
| **Lockbox** | Secret rotation without redeploy; no secrets in VM images | Secrets: `db-password`, `bot-backend-secret`, `jwt-secret` | VM startup script reads secret via IAM metadata; `echo $DB_PASSWORD` is populated | Included in base cost |
| **Cloud Logging + Monitoring** | Debug production issues, alert on 5xx / high latency | Backend stdout/stderr -> fluent-bit -> Cloud Logging; custom metric `http_requests_total` | Dashboard shows RPS / latency / error rate; alert fires to Telegram bot on 5xx spike | RUB 500-1,000/mo |
| **Certificate Manager** | Free TLS for CDN and ALB | Domain validation for `*.coder-survival.app` | Cert status = `ISSUED` in Console | Free (Let's Encrypt) |

### Verified configuration patterns (no speculative CLI)

#### Object Storage  -  S3 endpoint and credentials

```bash
# Verified against YC public docs
aws configure set aws_access_key_id <static-key-id>
aws configure set aws_secret_access_key <static-secret>
aws configure set region ru-central1

aws s3 ls s3://coder-survival-media-prod \
  --endpoint-url=https://storage.yandexcloud.net

# Upload from backend (Node.js aws-sdk v3 or @aws-sdk/client-s3)
# Endpoint: https://storage.yandexcloud.net
# Region:   ru-central1
# ForcePathStyle: true
```

#### CDN  -  correct scheme

```
1. Object Storage bucket created
   -  FQDN: coder-survival-media-prod.storage.yandexcloud.net

2. CDN -> Origin Group
   -  Origin: coder-survival-media-prod.storage.yandexcloud.net
   -  Protocol: HTTPS
   -  Verify origin SSL: Yes

3. CDN -> Resource
   -  Domain: media.coder-survival.app
   -  Origin Group: (select above)
   -  TLS: YC Certificate Manager -> Let's Encrypt -> validate via DNS

4. DNS (your provider / YC DNS)
   -  CNAME media.coder-survival.app -> <yc-cdn-cname>.edgecdn.ru

5. Wait 5-15 min, then:
   curl -I https://media.coder-survival.app/gifs/debug-stages.gif
```

> **Do not run `yc cdn resource create` without checking current CLI help.**  
> Prefer Console or Terraform module `yandex_cdn_resource`.

#### Managed PostgreSQL HA  -  provable host management

**Do not use:** `yc managed-postgresql cluster update --host` (syntax unverified and varies by CLI version).

**Use one of these checked approaches:**

- **YC Console:** Managed PostgreSQL -> Cluster -> Hosts -> **Add host** -> select zone `ru-central1-b` -> Save.
- **Terraform:**
  ```hcl
  resource "yandex_mdb_postgresql_cluster" "cs_prod" {
    name = "cs-prod-pg"
    # ...
    host {
      zone      = "ru-central1-a"
      subnet_id = yandex_vpc_subnet.subnet_a.id
    }
    host {
      zone      = "ru-central1-b"
      subnet_id = yandex_vpc_subnet.subnet_b.id
    }
  }
  ```
- **CLI (verify first):** Run `yc managed-postgresql host add --help` in a Cloud Shell session to confirm flags before executing.

### Deploy sequence (3-5 days)

#### Day 1: Foundation

- Create VPC + subnets in `ru-central1-a` and `ru-central1-b`.
- Create Managed PostgreSQL HA cluster (staging size: 2 hosts, 2 vCPU, 8 GB RAM, 50 GB disk).
- Restore current DB backup into staging cluster (`pg_restore` or `psql`).
- Create `coder-survival-media-staging` bucket.

#### Day 2: Compute + ALB staging

- Build fresh backend image and push to Container Registry.
- Create Instance Group template (2 VMs, max 3) with startup script:
  - Install Docker.
  - Pull image.
  - Fetch secrets from Lockbox via IAM metadata.
  - Run container.
- Create ALB + Backend Group + Health check on `/health`.
- Verify: `curl https://<alb-staging-domain>/api/state` returns valid JSON.

#### Day 3: Media + CDN staging

- Upload static meme templates and sample GIFs to staging bucket via S3 API.
- Create CDN Origin Group + Resource for staging.
- Update backend env: `MEDIA_BASE_URL=https://media-staging.coder-survival.app`.
- Test meme generation:
  - `GET /api/meme?templateId=wtf_per_minute&format=1:1` -> PNG
  - `GET /api/meme/gif/debug-stages` -> GIF
- If canvas/GIF fails, check Docker image native libs (`apk add cairo pango` is already in Dockerfile; verify VM base image matches).

#### Day 4: Logging, monitoring, alerts

- Install YC fluent-bit agent on VM template (or route Docker logs to stdout and collect via Cloud Logging agent).
- Create Cloud Monitoring dashboard: CPU, RAM, RPS, p95 latency.
- Create alert channels (Telegram bot or email).

#### Day 5: Production cutover

1. **Backup**
   - `pg_dump` from current VM.
   - Snapshot old VM disk.
   - Export local meme cache if any.

2. **Prod resources**
   - Clone staging cluster to prod (`coder-survival-media-prod`, `cs-prod-pg`, prod ALB).
   - Restore backup into prod DB.
   - Scale Instance Group to 2 VMs.

3. **Smoke against prod ALB**
   ```powershell
   pwsh -File scripts/smoke-prod.ps1 `
     -BaseUrl "https://<prod-alb-domain>" `
     -DirectApiBaseUrl "https://<prod-alb-domain>" `
     -SkipMutationTests:$false
   ```

4. **DNS cutover**
   - Update A-record / CNAME to ALB IP / domain.
   - Update Vercel `API_ORIGIN` env to ALB domain.
   - Redeploy frontend.

5. **24-hour watch**
   - Keep old VM running.
   - Monitor Cloud Logging error rate.
   - Monitor Cloud Monitoring health check failures.

---

## 4. AI Studio  -  Safe Game Applications (non-blocking)

These run **asynchronously**, never in the tap/HTTP hot path.

| # | Use case | Input | Output | Trigger | Safety guard |
|---|----------|-------|--------|---------|--------------|
| 1 | **Daily / event text generation** | Game context (rank, season, event type) | Quest title + description | Cron (00:05 UTC) | Human approval before publish; fallback to static strings if AI fails |
| 2 | **Meme caption moderation** | User-submitted text before overlay | Toxicity score + flag | POST `/api/meme/share` background job | Reject if score > threshold; log for review |
| 3 | **Support summaries** | Cloud Logging error batches (last 24h) | Operator digest: top errors, affected users | Cron (09:00 UTC) | Read-only; never mutates state |
| 4 | **Balance analytics** | Economy metrics (DAU, ARPDAU, retention) | Tuning recommendations | Weekly cron (Monday) | Recommendations go to `#ops` channel; human decides |
| 5 | **A/B copy variants** | Offer type + player segment | 3 headline variants for context offers | Weekly batch | Store as draft; manual pick before deploy |

**What NOT to do with AI Studio:**
- [NO] Real-time tap path generation (latency > 100ms will kill UX).
- [NO] Direct SQL generation from user prompts (injection risk).
- [NO] Automatic balance adjustments without human review.

---

## 5. Cutover Checklist (applies to both variants)

```
[ ] 1. BACKUP
   [ ] pg_dump current production DB
   [ ] Snapshot old VM system disk
   [ ] Export Object Storage contents if migrating buckets
   [ ] Save current Vercel env vars (API_ORIGIN, BOT_WEBHOOK_URL)

[ ] 2. STAGING DEPLOY
   [ ] Deploy backend + DB to staging
   [ ] Apply migrations
   [ ] Upload media templates to staging bucket/CDN

[ ] 3. STAGING SMOKE
   [ ] pwsh -File scripts/smoke-prod.ps1 -BaseUrl <staging>
   [ ] Meme/GIF checks:
      GET /api/meme?templateId=wtf_per_minute&format=1:1
      GET /api/meme/gif/debug-stages
      GET /api/meme/gif/deadline
   [ ] Bot internal calls:
      POST /api/meme/token (with X-Bot-Backend-Secret)
      GET /api/internal/observation/economy

[ ] 4. DNS / ORIGIN SWITCH
   [ ] Update DNS A-record / CNAME
   [ ] Update Vercel environment variables
   [ ] Redeploy frontend to Vercel

[ ] 5. MONITORING (first 30 min)
   [ ] ALB health checks: 0 failures
   [ ] Cloud Logging: 5xx rate < 0.1%
   [ ] Cloud Monitoring: CPU < 60%, RAM < 70%
   [ ] Telegram Bot webhook: /start responds

[ ] 6. 24-HOUR HOLD
   [ ] Old VM stays running
   [ ] Old DB stays accessible (read-only mode optional)
   [ ] On-call operator checks dashboards every 4 hours

[ ] 7. ROLLBACK TRIGGER (if any of these happen)
   [ ] 5xx rate > 2% for > 5 minutes
   [ ] `/health` fails for > 2 minutes
   [ ] Meme/GIF generation crashes (native lib error)
   [ ] DB replication lag > 10 seconds
   [ ] Bot webhook delivery failures > 5% (YC ALB network issues)
```

---

## 6. Rollback Procedures

| Layer | Rollback action | Estimated time | Who |
|-------|----------------|----------------|-----|
| **Frontend / API origin** | Revert Vercel env `API_ORIGIN` to old VM / DuckDNS; redeploy | 2 min | Operator |
| **DNS** | Revert A-record / CNAME to old VM IP; wait TTL | 5 min (DuckDNS) to 60 min (external DNS) | Operator |
| **Backend compute** | Scale YC Instance Group to 0 or stop VM | 1 min | Operator |
| **Database** | If Managed PG is broken, redirect backend to old VM Postgres (update env, recreate containers) | 5 min | Operator |
| **Media / CDN** | Point CDN origin back to old VM nginx static serve, or switch frontend to old `/api/meme` path | 2 min | Operator |
| **Bot** | No change  -  bot stays on Vercel | 0 min |  -  |

---

## 7. Cost Guardrails

| Guardrail | Implementation |
|-----------|----------------|
| **Billing alerts** | RUB 1,000 / RUB 5,000 / RUB 10,000 thresholds in YC Console |
| **Hard budget** | Folder-level spending limit (if available in your YC billing tier); otherwise manual review weekly |
| **VM sizing** | Start with 2 vCPU / 4 GB; scale up only after monitoring shows > 70% CPU sustained |
| **Storage lifecycle** | Object Storage: abort incomplete multipart uploads after 1 day; transition old versions to cold after 30 days |
| **CDN caching** | Static GIFs/templates: `Cache-Control: max-age=2592000` (30 days); dynamic memes: `max-age=300` (5 min) |
| **DB auto-shutdown** | Staging Managed PostgreSQL: stop instances nightly via Console or Terraform `yandex_mdb_postgresql_cluster` with reduced host count |
| **Logging retention** | Cloud Logging: 7 days for staging, 30 days for prod; export to Object Storage for long-term |

---

## 8. Smoke Command Reference (copy-paste ready)

```powershell
# Standard game loop smoke
pwsh -File scripts/smoke-prod.ps1 `
  -BaseUrl "https://<target-domain>" `
  -DirectApiBaseUrl "https://<target-domain>" `
  -SkipMutationTests:$false -SkipP1Gaps:$false

# Meme / GIF / Canvas native-lib validation (GET methods, verified from repo)
$headers = @{ "x-telegram-init-data" = $initData }

Invoke-WebRequest -Uri "https://<target-domain>/api/meme?templateId=wtf_per_minute&format=1:1" `
  -Headers $headers -Method Get -OutFile "smoke_meme.png"
# Verify: file smoke_meme.png exists and size > 1KB

Invoke-WebRequest -Uri "https://<target-domain>/api/meme/achievement?achievementId=first_commit" `
  -Headers $headers -Method Get -OutFile "smoke_achievement.png"

Invoke-WebRequest -Uri "https://<target-domain>/api/meme/gif/debug-stages" `
  -Method Get -OutFile "smoke_debug.gif"
# Verify: file smoke_debug.gif exists and size > 1KB

Invoke-WebRequest -Uri "https://<target-domain>/api/meme/gif/deadline" `
  -Method Get -OutFile "smoke_deadline.gif"

# Meme share tracking (POST, verified from repo)
Invoke-RestMethod "https://<target-domain>/api/meme/share" `
  -Headers $jsonHeaders -Method Post `
  -Body (@{ templateId = "wtf_per_minute"; format = "1:1"; sharedTo = "smoke_test" } | ConvertTo-Json)

# Internal observation (GET, direct API only)
Invoke-RestMethod "https://<target-domain>/api/internal/observation/economy?days=7" `
  -Headers @{ "X-Bot-Backend-Secret" = $secret } -Method Get

# Backend build verification (local repo)
npm --prefix frontend run build
npm --prefix backend test -- tests/mvp.performanceStatic.test.js --runInBand
```

---

## 9. What to Check After the Grant Expires

| Check | Frequency | Action if fail |
|-------|-----------|----------------|
| Bill exceeds RUB 15,000/mo | Monthly | Right-size VMs, reduce DB disk, disable staging overnight |
| CDN hit ratio < 70% | Weekly | Review cache headers; increase static asset TTL |
| DB storage > 80% | Weekly | Enable compression, archive old sessions, add disk |
| Backup restore test | Monthly | Restore staging DB from prod backup; verify data integrity |
| Certificate expiry | Weekly (automated) | YC Certificate Manager auto-renews LE; alert on `ISSUANCE_FAILED` |
| AI Studio quota | Weekly | If using AI Studio, monitor request count; switch to local fallback if quota exhausted |

---

## 10. Open Items (verify before execution)

1. **YC CLI syntax drift:** Before running any `yc compute instance-group ...` or `yc alb ...` commands, open **YC Cloud Shell** and run `yc <service> <command> --help` to confirm flags. Prefer Terraform for repeatable infrastructure.
2. **Telegram API egress from YC:** If you later decide to test bot hosting in YC, verify `curl -I https://api.telegram.org` from a test VM **before** moving the bot. If blocked, the bot stays on Vercel.
3. **Container Registry IAM:** Ensure `cs-prod-sa` has `container-registry.images.puller` on the exact registry `cr.yandex/crpduv7gci2puq300f38`.
4. **Native library compatibility:** The backend Dockerfile already installs `cairo`, `pango`, `pixman`, `giflib`. If YC VM uses a different kernel or libc, rebuild the image on a YC VM once to confirm `@napi-rs/canvas` loads without `symbol not found` errors.
5. **DuckDNS TTL:** DuckDNS updates propagate in ~1 minute, but some DNS resolvers cache longer. During cutover, test from multiple networks / `dig +trace`.
